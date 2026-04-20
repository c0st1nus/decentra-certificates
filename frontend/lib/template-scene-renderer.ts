import type {
  TemplateCanvasData,
  TemplateCanvasImageLayer,
  TemplateCanvasLayer,
  TemplateCanvasTextLayer,
  TemplateLayoutData,
} from "@/lib/admin-api";
import { getCanvasLayerDisplayText } from "@/lib/template-canvas";

const TEXT_PADDING_X = 16;
const TEXT_PADDING_Y = 12;
const MIN_AUTO_SHRINK_SIZE = 10;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

type RenderTemplateSceneArgs = {
  canvas: HTMLCanvasElement;
  layout: TemplateLayoutData;
  scene: TemplateCanvasData;
  previewName: string;
  bindingValues?: Record<string, string>;
  backgroundSrc?: string | null;
};

type WrappedLine = {
  text: string;
  width: number;
};

type WrappedTextLayout = {
  fontSize: number;
  ascent: number;
  descent: number;
  lineHeight: number;
  lines: WrappedLine[];
  totalHeight: number;
};

export async function renderTemplateSceneToCanvas({
  canvas,
  layout,
  scene,
  previewName,
  bindingValues = {},
  backgroundSrc = null,
}: RenderTemplateSceneArgs) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context is not available");
  }

  if (typeof document !== "undefined" && "fonts" in document) {
    await document.fonts.ready;
  }

  canvas.width = Math.max(1, Math.round(layout.page_width));
  canvas.height = Math.max(1, Math.round(layout.page_height));

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundSrc) {
    await drawBackgroundImage(context, backgroundSrc, canvas.width, canvas.height);
  }

  for (const layer of scene.layers) {
    if (!layer.visible) {
      continue;
    }

    context.save();
    context.globalAlpha = clampOpacity(layer.opacity);

    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    if (layer.rotation !== 0) {
      context.translate(centerX, centerY);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.translate(-centerX, -centerY);
    }

    if (layer.kind === "text" && layer.text) {
      drawTextLayer(context, layer, previewName, bindingValues);
    } else if (layer.kind === "image" && layer.image?.src) {
      await drawImageLayer(context, layer);
    }

    context.restore();
  }
}

async function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  src: string,
  width: number,
  height: number,
) {
  const image = await loadImage(src);
  if (!image.naturalWidth || !image.naturalHeight) {
    return;
  }

  context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, width, height);
}

function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: TemplateCanvasLayer,
  previewName: string,
  bindingValues: Record<string, string>,
) {
  if (!layer.text) {
    return;
  }

  const textContent = getCanvasLayerDisplayText(layer, previewName, bindingValues);
  if (!textContent.trim() && !layer.text.background_color_hex) {
    return;
  }

  const text = layer.text;
  if (text.background_color_hex) {
    context.fillStyle = text.background_color_hex;
    context.fillRect(layer.x, layer.y, layer.width, layer.height);
  }

  const maxTextWidth = Math.max(1, layer.width - TEXT_PADDING_X * 2);
  const maxTextHeight = Math.max(1, layer.height - TEXT_PADDING_Y * 2);
  const wrapped = computeWrappedTextLayout(context, textContent, text, maxTextWidth, maxTextHeight);
  if (wrapped.lines.length === 0) {
    return;
  }

  context.fillStyle = text.font_color_hex;
  context.textBaseline = "alphabetic";
  context.font = buildCanvasFont(text.font_weight, wrapped.fontSize, text.font_family);

  const contentHeight = wrapped.totalHeight;
  const top = resolveVerticalStart(layer.y, layer.height, contentHeight, text.vertical_align);
  let baselineY = top + wrapped.ascent;

  for (const line of wrapped.lines) {
    const drawX = resolveHorizontalStart(layer.x, layer.width, line.width, text.text_align);
    drawTextWithLetterSpacing(context, line.text, drawX, baselineY, text.letter_spacing);
    baselineY += wrapped.lineHeight;
  }
}

async function drawImageLayer(context: CanvasRenderingContext2D, layer: TemplateCanvasLayer) {
  const image = layer.image;
  if (!image?.src) {
    return;
  }

  const resource = await loadImage(image.src);
  if (!resource.naturalWidth || !resource.naturalHeight) {
    return;
  }

  context.save();
  clipRoundedRect(context, layer.x, layer.y, layer.width, layer.height, image.border_radius);
  context.clip();

  const placement = resolveImagePlacement(
    resource.naturalWidth,
    resource.naturalHeight,
    layer.width,
    layer.height,
    image,
  );

  context.drawImage(
    resource,
    placement.sourceX,
    placement.sourceY,
    placement.sourceWidth,
    placement.sourceHeight,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
  );

  context.restore();
}

function computeWrappedTextLayout(
  context: CanvasRenderingContext2D,
  textContent: string,
  text: TemplateCanvasTextLayer,
  maxWidth: number,
  maxHeight: number,
): WrappedTextLayout {
  let fontSize = text.font_size;

  while (fontSize >= MIN_AUTO_SHRINK_SIZE) {
    context.font = buildCanvasFont(text.font_weight, fontSize, text.font_family);
    const metrics = measureFontMetrics(context);
    const lineHeight = Math.max(fontSize, fontSize * (text.line_height / 100));
    const lines = wrapText(context, textContent, maxWidth, text.letter_spacing);
    const totalHeight = calculateTextBlockHeight(
      lines.length,
      lineHeight,
      metrics.ascent,
      metrics.descent,
    );

    if (
      !text.auto_shrink ||
      (fitsWithinBounds(lines, totalHeight, maxWidth, maxHeight) && lines.length > 0)
    ) {
      return {
        fontSize,
        ascent: metrics.ascent,
        descent: metrics.descent,
        lineHeight,
        lines,
        totalHeight,
      };
    }

    fontSize -= 1;
  }

  context.font = buildCanvasFont(text.font_weight, MIN_AUTO_SHRINK_SIZE, text.font_family);
  const metrics = measureFontMetrics(context);
  const lineHeight = Math.max(
    MIN_AUTO_SHRINK_SIZE,
    MIN_AUTO_SHRINK_SIZE * (text.line_height / 100),
  );
  const lines = wrapText(context, textContent, maxWidth, text.letter_spacing);
  return {
    fontSize: MIN_AUTO_SHRINK_SIZE,
    ascent: metrics.ascent,
    descent: metrics.descent,
    lineHeight,
    lines,
    totalHeight: calculateTextBlockHeight(
      lines.length,
      lineHeight,
      metrics.ascent,
      metrics.descent,
    ),
  };
}

function wrapText(
  context: CanvasRenderingContext2D,
  textContent: string,
  maxWidth: number,
  letterSpacing: number,
) {
  const paragraphs = textContent.split(/\r?\n/);
  const lines: WrappedLine[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ text: "", width: 0 });
      continue;
    }

    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const nextWidth = measureTextWidth(context, next, letterSpacing);
      if (!current || nextWidth <= maxWidth) {
        current = next;
        continue;
      }

      lines.push({
        text: current,
        width: measureTextWidth(context, current, letterSpacing),
      });

      if (measureTextWidth(context, word, letterSpacing) <= maxWidth) {
        current = word;
        continue;
      }

      const chunks = splitLongToken(context, word, maxWidth, letterSpacing);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1]?.text ?? "";
    }

    lines.push({
      text: current,
      width: measureTextWidth(context, current, letterSpacing),
    });
  }

  return lines;
}

function splitLongToken(
  context: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
  letterSpacing: number,
) {
  const parts: WrappedLine[] = [];
  let current = "";

  for (const character of token) {
    const next = `${current}${character}`;
    if (!current || measureTextWidth(context, next, letterSpacing) <= maxWidth) {
      current = next;
      continue;
    }

    parts.push({
      text: current,
      width: measureTextWidth(context, current, letterSpacing),
    });
    current = character;
  }

  if (current) {
    parts.push({
      text: current,
      width: measureTextWidth(context, current, letterSpacing),
    });
  }

  return parts;
}

function calculateTextBlockHeight(
  lineCount: number,
  lineHeight: number,
  ascent: number,
  descent: number,
) {
  if (lineCount === 0) {
    return 0;
  }

  return ascent + descent + lineHeight * Math.max(0, lineCount - 1);
}

function fitsWithinBounds(
  lines: WrappedLine[],
  totalHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  return lines.every((line) => line.width <= maxWidth) && totalHeight <= maxHeight;
}

function resolveHorizontalStart(
  layerX: number,
  layerWidth: number,
  lineWidth: number,
  textAlign: string,
) {
  switch (textAlign) {
    case "center":
      return layerX + layerWidth / 2 - lineWidth / 2;
    case "right":
      return layerX + layerWidth - TEXT_PADDING_X - lineWidth;
    default:
      return layerX + TEXT_PADDING_X;
  }
}

function resolveVerticalStart(
  layerY: number,
  layerHeight: number,
  contentHeight: number,
  verticalAlign: string,
) {
  switch (verticalAlign) {
    case "center":
      return layerY + layerHeight / 2 - contentHeight / 2;
    case "bottom":
      return layerY + layerHeight - TEXT_PADDING_Y - contentHeight;
    default:
      return layerY + TEXT_PADDING_Y;
  }
}

function drawTextWithLetterSpacing(
  context: CanvasRenderingContext2D,
  text: string,
  startX: number,
  baselineY: number,
  letterSpacing: number,
) {
  if (!text) {
    return;
  }

  if (letterSpacing === 0) {
    context.fillText(text, startX, baselineY);
    return;
  }

  let currentX = startX;
  for (const character of text) {
    context.fillText(character, currentX, baselineY);
    currentX += context.measureText(character).width + letterSpacing;
  }
}

function measureTextWidth(context: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  if (!text) {
    return 0;
  }

  const metrics = context.measureText(text);
  return metrics.width + Math.max(0, text.length - 1) * letterSpacing;
}

function measureFontMetrics(context: CanvasRenderingContext2D) {
  const metrics = context.measureText("Hg");
  const ascent = metrics.actualBoundingBoxAscent || estimateAscentFromFont(context);
  const descent = metrics.actualBoundingBoxDescent || Math.max(2, ascent * 0.24);
  return { ascent, descent };
}

function estimateAscentFromFont(context: CanvasRenderingContext2D) {
  const fontMatch = / (\d+(?:\.\d+)?)px /.exec(context.font);
  const fontSize = Number(fontMatch?.[1] ?? 16);
  return fontSize * 0.78;
}

function buildCanvasFont(fontWeight: number, fontSize: number, fontFamily: string) {
  return `${fontWeight} ${fontSize}px "${fontFamily}"`;
}

function resolveImagePlacement(
  naturalWidth: number,
  naturalHeight: number,
  targetWidth: number,
  targetHeight: number,
  image: TemplateCanvasImageLayer,
) {
  if (image.fit === "fill") {
    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth: naturalWidth,
      sourceHeight: naturalHeight,
    };
  }

  const sourceRatio = naturalWidth / naturalHeight;
  const targetRatio = targetWidth / targetHeight;

  if (image.fit === "contain") {
    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth: naturalWidth,
      sourceHeight: naturalHeight,
    };
  }

  if (sourceRatio > targetRatio) {
    const cropWidth = naturalHeight * targetRatio;
    const offsetX = (naturalWidth - cropWidth) / 2;
    return {
      sourceX: offsetX,
      sourceY: 0,
      sourceWidth: cropWidth,
      sourceHeight: naturalHeight,
    };
  }

  const cropHeight = naturalWidth / targetRatio;
  const offsetY = (naturalHeight - cropHeight) / 2;
  return {
    sourceX: 0,
    sourceY: offsetY,
    sourceWidth: naturalWidth,
    sourceHeight: cropHeight,
  };
}

function clipRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function loadImage(src: string) {
  const existing = imageCache.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image: ${src}`));
    image.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

function clampOpacity(opacity: number) {
  return Math.min(1, Math.max(0, opacity / 100));
}
