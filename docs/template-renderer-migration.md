# Template Renderer Migration

## Problem

The current certificate flow uses two different renderers:

- The admin editor renders text and layers in the browser with DOM/SVG.
- The backend renders the final PDF separately with `printpdf` and `rusttype`.

Because these engines do not share the same text layout, font metrics, or line wrapping, the editor cannot be trusted as a WYSIWYG surface.

## Goal

Move the project to a single-render architecture where the template scene is described once and rendered by the same drawing code in every environment.

## Target Architecture

- Source of truth: `canvas_data` scene JSON stored with the template layout.
- Shared renderer: one scene renderer that draws onto a 2D canvas context.
- Editor: browser `<canvas>` uses the shared renderer for instant preview.
- Server export: a Node worker uses the same shared renderer via a headless canvas implementation.
- PDF output: render the page to a bitmap and embed that bitmap into a PDF page.

This trades selectable PDF text for exact visual consistency, which is the correct tradeoff for certificate issuance.

## Phases

### Phase 1

- Add a shared browser-side scene renderer.
- Replace DOM/SVG layer rendering in the editor with canvas drawing.
- Keep the current backend PDF proof only as a temporary verification fallback.

### Phase 2

- Move preview generation out of Rust typography logic.
- Introduce a Node-based render worker that uses the same renderer as the browser.
- Generate preview PNG or PDF from that worker on demand.

### Phase 3

- Replace certificate export with worker-based bitmap rendering.
- Use Rust only for orchestration, queueing, persistence, and API boundaries.
- Remove `printpdf`/`rusttype` text layout as a rendering authority.

### Phase 4

- Remove the legacy `name_box` compatibility path.
- Make all issuance and preview flows operate on full `canvas_data`.
- Pre-generate or cache issued certificates to absorb public traffic spikes.

## Operational Notes

- Live editing must stay local in the browser. The server must not be in the hot path for drag, resize, or text changes.
- Fonts must come from the same physical font files in both browser and export worker.
- PDF source templates should eventually be normalized into raster or rendered page images before entering the editor surface.

## Current Execution Step

Implement Phase 1 by switching the main editor surface from DOM/SVG text rendering to a shared canvas renderer.
