"use client";

import { ArrowDown, ArrowLeft, ArrowRight, Pause, Play, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn, formatCompactNumber } from "@/lib/utils";

type Cell = "I" | "J" | "L" | "O" | "S" | "T" | "Z" | null;
type PieceKind = Exclude<Cell, null>;
type Matrix = number[][];
type Board = Cell[][];
type GameStatus = "idle" | "playing" | "paused" | "gameOver";

interface ActivePiece {
  kind: PieceKind;
  matrix: Matrix;
  x: number;
  y: number;
}

interface GameState {
  board: Board;
  active: ActivePiece | null;
  next: ActivePiece;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
  clearingRows: number[];
}

interface GameUiState {
  next: ActivePiece;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
}

type GameAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "move"; dx: number }
  | { type: "rotate" }
  | { type: "softDrop" }
  | { type: "hardDrop" }
  | { type: "tick" }
  | { type: "commitClear" };

interface TetrisProps {
  className?: string;
  onGameOver?: (result: { score: number; lines: number }) => Promise<void> | void;
  onStart?: () => Promise<void> | void;
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const PIECES: Record<PieceKind, Matrix> = {
  I: [[1, 1, 1, 1]],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
};
const PIECE_KINDS = Object.keys(PIECES) as PieceKind[];
const CELL_CLASSES: Record<PieceKind, string> = {
  I: "border-cyan-300/80 bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.3)]",
  J: "border-blue-400/80 bg-blue-400 shadow-[0_0_14px_rgba(96,165,250,0.3)]",
  L: "border-orange-300/80 bg-orange-300 shadow-[0_0_14px_rgba(253,186,116,0.3)]",
  O: "border-yellow-300/80 bg-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.3)]",
  S: "border-primary/80 bg-primary shadow-[0_0_14px_rgba(140,216,18,0.32)]",
  T: "border-fuchsia-300/80 bg-fuchsia-300 shadow-[0_0_14px_rgba(240,171,252,0.3)]",
  Z: "border-red-400/80 bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.3)]",
};
const PREVIEW_CELL_IDS = Array.from({ length: 16 }, (_, index) => `preview-${index}`);
const INITIAL_DROP_INTERVAL_MS = 620;
const DROP_INTERVAL_LEVEL_STEP_MS = 55;
const MIN_DROP_INTERVAL_MS = 75;
const LINE_CLEAR_DELAY_MS = 220;
const UI_SYNC_INTERVAL_MS = 120;
const BOARD_RENDER_DPR_CAP = 1.5;
const CELL_PALETTE: Record<PieceKind, { fill: string; stroke: string; shine: string }> = {
  I: { fill: "#67e8f9", shine: "rgba(236,254,255,0.36)", stroke: "rgba(103,232,249,0.92)" },
  J: { fill: "#60a5fa", shine: "rgba(219,234,254,0.32)", stroke: "rgba(96,165,250,0.92)" },
  L: { fill: "#fdba74", shine: "rgba(255,237,213,0.34)", stroke: "rgba(253,186,116,0.92)" },
  O: { fill: "#fde047", shine: "rgba(254,249,195,0.36)", stroke: "rgba(253,224,71,0.92)" },
  S: { fill: "#8cd812", shine: "rgba(236,252,203,0.36)", stroke: "rgba(140,216,18,0.92)" },
  T: { fill: "#f0abfc", shine: "rgba(250,232,255,0.34)", stroke: "rgba(240,171,252,0.92)" },
  Z: { fill: "#f87171", shine: "rgba(254,226,226,0.34)", stroke: "rgba(248,113,113,0.92)" },
};

export function Tetris({ className, onGameOver, onStart }: TetrisProps) {
  const gameRef = useRef<GameState | null>(null);
  if (gameRef.current === null) {
    gameRef.current = createInitialState();
  }
  const initialGameState = gameRef.current;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clearLineTimer = useRef<number | null>(null);
  const lastUiSync = useRef(0);
  const [uiState, setUiState] = useState<GameUiState>(() => createUiState(initialGameState));
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const handledGameOverScore = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const previewCells = useMemo(() => renderPreviewCells(uiState.next), [uiState.next]);

  const drawCurrentBoard = useCallback(() => {
    if (!canvasRef.current || !gameRef.current) {
      return;
    }

    drawBoardCanvas(canvasRef.current, gameRef.current);
  }, []);

  const syncUiState = useCallback((force = false) => {
    if (!gameRef.current) {
      return;
    }

    const now = performance.now();
    if (!force && now - lastUiSync.current < UI_SYNC_INTERVAL_MS) {
      return;
    }

    lastUiSync.current = now;
    const nextUiState = createUiState(gameRef.current);
    setUiState((current) => (areUiStatesEqual(current, nextUiState) ? current : nextUiState));
  }, []);

  const handleGameOverIfNeeded = useCallback(
    (previous: GameState, next: GameState) => {
      if (previous.status === "gameOver" || next.status !== "gameOver") {
        return;
      }

      if (handledGameOverScore.current === next.score) {
        return;
      }

      handledGameOverScore.current = next.score;
      void onGameOver?.({ score: next.score, lines: next.lines });
    },
    [onGameOver],
  );

  const commitClearingRows = useCallback(() => {
    if (!gameRef.current) {
      return;
    }

    clearLineTimer.current = null;
    const previous = gameRef.current;
    const next = gameReducer(previous, { type: "commitClear" });
    gameRef.current = next;
    drawCurrentBoard();
    syncUiState(true);
    handleGameOverIfNeeded(previous, next);
  }, [drawCurrentBoard, handleGameOverIfNeeded, syncUiState]);

  const scheduleLineClear = useCallback(() => {
    if (clearLineTimer.current !== null) {
      return;
    }

    clearLineTimer.current = window.setTimeout(commitClearingRows, LINE_CLEAR_DELAY_MS);
  }, [commitClearingRows]);

  const applyAction = useCallback(
    (action: GameAction, forceUi = false) => {
      if (!gameRef.current) {
        return;
      }

      if (action.type === "start" && clearLineTimer.current !== null) {
        window.clearTimeout(clearLineTimer.current);
        clearLineTimer.current = null;
      }

      const previous = gameRef.current;
      const next = gameReducer(previous, action);
      if (next === previous) {
        return;
      }

      gameRef.current = next;
      drawCurrentBoard();

      if (next.clearingRows.length > 0) {
        scheduleLineClear();
      }

      const shouldForceUi =
        forceUi ||
        action.type !== "tick" ||
        previous.status !== next.status ||
        next.status === "gameOver";
      syncUiState(shouldForceUi);
      handleGameOverIfNeeded(previous, next);
    },
    [drawCurrentBoard, handleGameOverIfNeeded, scheduleLineClear, syncUiState],
  );

  const startGame = useCallback(async () => {
    setStartError(null);
    setIsStarting(true);
    try {
      await onStart?.();
      handledGameOverScore.current = null;
      applyAction({ type: "start" }, true);
    } catch {
      setStartError("Не удалось создать игровую сессию. Попробуйте ещё раз.");
    } finally {
      setIsStarting(false);
    }
  }, [applyAction, onStart]);

  useEffect(() => {
    drawCurrentBoard();
  }, [drawCurrentBoard]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver(drawCurrentBoard);
    observer.observe(canvas);
    window.addEventListener("resize", drawCurrentBoard);
    drawCurrentBoard();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", drawCurrentBoard);
    };
  }, [drawCurrentBoard]);

  useEffect(() => {
    return () => {
      if (clearLineTimer.current !== null) {
        window.clearTimeout(clearLineTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (uiState.status !== "playing") {
      return;
    }

    let timer: number | null = null;
    let cancelled = false;

    function scheduleTick() {
      const level = gameRef.current?.level ?? 1;
      timer = window.setTimeout(() => {
        applyAction({ type: "tick" });
        if (!cancelled && gameRef.current?.status === "playing") {
          scheduleTick();
        }
      }, getDropInterval(level));
    }

    scheduleTick();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [applyAction, uiState.status]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const status = gameRef.current?.status ?? "idle";
      if (event.key === "Enter" && status !== "playing") {
        event.preventDefault();
        void startGame();
        return;
      }

      if (status !== "playing") {
        return;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
        event.preventDefault();
      }

      if (event.key === "ArrowLeft") applyAction({ type: "move", dx: -1 });
      if (event.key === "ArrowRight") applyAction({ type: "move", dx: 1 });
      if (event.key === "ArrowDown") applyAction({ type: "softDrop" });
      if (event.key === "ArrowUp") applyAction({ type: "rotate" });
      if (event.key === " ") applyAction({ type: "hardDrop" });
      if (event.key.toLowerCase() === "p") applyAction({ type: "pause" }, true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyAction, startGame]);

  const isRunning = uiState.status === "playing";
  const pauseDisabled = uiState.status === "idle" || uiState.status === "gameOver";

  return (
    <section className={cn("grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]", className)}>
      <div className="flex min-w-0 flex-col gap-3 lg:contents">
        {/* Mobile: compact stats above board */}
        <div className="admin-panel grid grid-cols-3 gap-2 p-2.5 text-center sm:p-3 lg:hidden">
          <Stat compact label="Счёт" value={formatCompactNumber(uiState.score)} />
          <Stat compact label="Линии" value={String(uiState.lines)} />
          <Stat compact label="Уровень" value={String(uiState.level)} />
        </div>

        <div className="admin-panel flex flex-col gap-3 overflow-hidden p-3 sm:p-4 lg:order-first lg:row-span-3">
          <div className="lg:hidden">
            <p className="admin-eyebrow">Следующая фигура</p>
            <NextPiecePreview cells={previewCells} />
          </div>

          <div
            className="relative mx-auto max-w-[min(92vw,430px)] touch-none rounded-2xl border border-primary/20 bg-black/50 p-2 shadow-[0_0_32px_rgba(140,216,18,0.1)]"
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start || gameRef.current?.status !== "playing") return;
              const touch = event.changedTouches[0];
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
                applyAction({ type: "rotate" });
                return;
              }
              if (Math.abs(dx) > Math.abs(dy)) {
                applyAction({ type: "move", dx: dx > 0 ? 1 : -1 });
              } else if (dy > 0) {
                applyAction({ type: dy > 70 ? "hardDrop" : "softDrop" });
              }
            }}
            onTouchCancel={() => {
              touchStart.current = null;
            }}
            onTouchStart={(event) => {
              const touch = event.changedTouches[0];
              touchStart.current = { x: touch.clientX, y: touch.clientY };
            }}
          >
            <canvas
              aria-label="Tetris board"
              className="block aspect-[10/20] w-full rounded-xl"
              ref={canvasRef}
              role="img"
            />

            {uiState.status !== "playing" ? (
              <div className="absolute inset-2 flex flex-col items-center justify-center rounded-xl bg-black/75 p-5 text-center backdrop-blur-sm">
                <p className="font-pixel text-xl leading-8 text-primary">
                  {uiState.status === "gameOver" ? "GAME OVER" : "TETRIS"}
                </p>
                <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
                  Управляйте стрелками, вращайте вверх, сбрасывайте пробелом. На телефоне — кнопки
                  «Управление» ниже поля (можно и свайпами по полю).
                </p>
                <button
                  className="btn-hero glow-primary mt-5 rounded-2xl bg-primary/15 text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isStarting}
                  type="button"
                  onClick={() => void startGame()}
                >
                  <Play className="size-4" />
                  {uiState.status === "gameOver" ? "Играть ещё" : "Старт"}
                </button>
                {startError ? <p className="mt-3 text-sm text-red-200">{startError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 lg:hidden">
            <p className="admin-eyebrow">Управление</p>
            <MobileControls applyAction={applyAction} isRunning={isRunning} />
            <button
              className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pauseDisabled}
              type="button"
              onClick={() => applyAction({ type: isRunning ? "pause" : "resume" }, true)}
            >
              {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isRunning ? "Пауза" : "Продолжить"}
            </button>
          </div>
        </div>
      </div>

      <aside className="hidden space-y-4 lg:block">
        <div className="admin-panel grid grid-cols-3 gap-3 text-center">
          <Stat label="Счёт" value={formatCompactNumber(uiState.score)} />
          <Stat label="Линии" value={String(uiState.lines)} />
          <Stat label="Уровень" value={String(uiState.level)} />
        </div>

        <div className="admin-panel">
          <p className="admin-eyebrow">Следующая фигура</p>
          <NextPiecePreview cells={previewCells} />
        </div>

        <div className="admin-panel space-y-3">
          <p className="admin-eyebrow">Управление</p>
          <div className="grid grid-cols-3 gap-2">
            <ControlButton
              disabled={!isRunning}
              label="Влево"
              onClick={() => applyAction({ type: "move", dx: -1 })}
            >
              <ArrowLeft className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вращать"
              onClick={() => applyAction({ type: "rotate" })}
            >
              <RotateCw className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вправо"
              onClick={() => applyAction({ type: "move", dx: 1 })}
            >
              <ArrowRight className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вниз"
              onClick={() => applyAction({ type: "softDrop" })}
            >
              <ArrowDown className="size-5" />
            </ControlButton>
            <button
              className="col-span-2 min-h-12 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isRunning}
              type="button"
              onClick={() => applyAction({ type: "hardDrop" })}
            >
              Быстрый сброс
            </button>
          </div>

          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pauseDisabled}
            type="button"
            onClick={() => applyAction({ type: isRunning ? "pause" : "resume" }, true)}
          >
            {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isRunning ? "Пауза" : "Продолжить"}
          </button>
        </div>
      </aside>
    </section>
  );
}

function Stat({ compact, label, value }: { compact?: boolean; label: string; value: string }) {
  return (
    <div>
      <p
        className={cn(
          "uppercase tracking-[0.18em] text-white/45",
          compact ? "text-[9px]" : "text-[10px]",
        )}
      >
        {label}
      </p>
      <p
        className={cn("mt-1 font-pixel text-primary", compact ? "text-base leading-6" : "text-lg")}
      >
        {value}
      </p>
    </div>
  );
}

function NextPiecePreview({ cells }: { cells: Cell[] }) {
  return (
    <div className="mx-auto grid w-max max-w-full grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/40 p-2">
      {PREVIEW_CELL_IDS.map((id, index) => {
        const cell = cells[index] ?? null;
        return (
          <div
            key={id}
            className={cn(
              "aspect-square w-7 shrink-0 rounded-md border sm:w-8",
              cell ? CELL_CLASSES[cell] : "border-white/10 bg-white/[0.04]",
            )}
          />
        );
      })}
    </div>
  );
}

function MobileControls({
  applyAction,
  isRunning,
}: {
  applyAction: (action: GameAction, forceUi?: boolean) => void;
  isRunning: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 touch-manipulation">
      <ControlButton
        className="min-h-14 touch-manipulation"
        disabled={!isRunning}
        label="Влево"
        onClick={() => applyAction({ type: "move", dx: -1 })}
      >
        <ArrowLeft className="size-5" />
      </ControlButton>
      <ControlButton
        className="min-h-14 touch-manipulation"
        disabled={!isRunning}
        label="Вращать"
        onClick={() => applyAction({ type: "rotate" })}
      >
        <RotateCw className="size-5" />
      </ControlButton>
      <ControlButton
        className="min-h-14 touch-manipulation"
        disabled={!isRunning}
        label="Вправо"
        onClick={() => applyAction({ type: "move", dx: 1 })}
      >
        <ArrowRight className="size-5" />
      </ControlButton>
      <ControlButton
        className="min-h-14 touch-manipulation"
        disabled={!isRunning}
        label="Вниз"
        onClick={() => applyAction({ type: "softDrop" })}
      >
        <ArrowDown className="size-5" />
      </ControlButton>
      <button
        className="col-span-2 flex min-h-14 touch-manipulation items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!isRunning}
        type="button"
        onClick={() => applyAction({ type: "hardDrop" })}
      >
        Быстрый сброс
      </button>
    </div>
  );
}

function ControlButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "commitClear") {
    return commitClearedLines(state);
  }

  if (state.clearingRows.length > 0) {
    return state;
  }

  if (action.type === "start") {
    return startNewGame();
  }

  if (action.type === "pause" && state.status === "playing") {
    return { ...state, status: "paused" };
  }

  if (action.type === "resume" && state.status === "paused") {
    return { ...state, status: "playing" };
  }

  if (state.status !== "playing" || !state.active) {
    return state;
  }

  if (action.type === "move") {
    const moved = { ...state.active, x: state.active.x + action.dx };
    return canPlace(state.board, moved) ? { ...state, active: moved } : state;
  }

  if (action.type === "rotate") {
    const rotated = { ...state.active, matrix: rotateMatrix(state.active.matrix) };
    const kicked = [0, -1, 1, -2, 2]
      .map((dx) => ({ ...rotated, x: rotated.x + dx }))
      .find((piece) => canPlace(state.board, piece));
    return kicked ? { ...state, active: kicked } : state;
  }

  if (action.type === "hardDrop") {
    let dropped = state.active;
    let distance = 0;
    while (canPlace(state.board, { ...dropped, y: dropped.y + 1 })) {
      dropped = { ...dropped, y: dropped.y + 1 };
      distance += 1;
    }
    return lockPiece({ ...state, active: dropped, score: state.score + distance * 2 });
  }

  if (action.type === "softDrop" || action.type === "tick") {
    const dropped = { ...state.active, y: state.active.y + 1 };
    if (canPlace(state.board, dropped)) {
      return {
        ...state,
        active: dropped,
        score: state.score + (action.type === "softDrop" ? 1 : 0),
      };
    }
    return lockPiece(state);
  }

  return state;
}

function createInitialState(): GameState {
  return {
    active: null,
    board: createEmptyBoard(),
    clearingRows: [],
    level: 1,
    lines: 0,
    next: createPiece(),
    score: 0,
    status: "idle",
  };
}

function startNewGame(): GameState {
  const first = createPiece();
  const active = centerPiece(first);
  const next = createPiece();
  const board = createEmptyBoard();
  const state: GameState = {
    active,
    board,
    clearingRows: [],
    level: 1,
    lines: 0,
    next,
    score: 0,
    status: "playing",
  };
  return canPlace(board, active) ? state : { ...state, status: "gameOver" };
}

function lockPiece(state: GameState): GameState {
  if (!state.active) {
    return state;
  }

  const merged = mergePiece(state.board, state.active);
  const clearingRows = findFullRowIndices(merged);
  if (clearingRows.length > 0) {
    return {
      ...state,
      active: null,
      board: merged,
      clearingRows,
    };
  }

  return spawnNextPiece(state, merged, 0);
}

function commitClearedLines(state: GameState): GameState {
  if (state.clearingRows.length === 0) {
    return state;
  }

  const cleared = clearCompletedLines(state.board);
  return spawnNextPiece(state, cleared.board, cleared.lines);
}

function spawnNextPiece(state: GameState, board: Board, clearedLineCount: number): GameState {
  const totalLines = state.lines + clearedLineCount;
  const level = Math.floor(totalLines / 10) + 1;
  const score = state.score + scoreForLines(clearedLineCount, state.level);
  const active = centerPiece(state.next);
  const nextState: GameState = {
    ...state,
    active,
    board,
    clearingRows: [],
    level,
    lines: totalLines,
    next: createPiece(),
    score,
  };

  return canPlace(nextState.board, active) ? nextState : { ...nextState, status: "gameOver" };
}

function findFullRowIndices(board: Board) {
  return board.flatMap((row, y) => (row.every((cell) => cell !== null) ? [y] : []));
}

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));
}

function createPiece(): ActivePiece {
  const kind = PIECE_KINDS[Math.floor(Math.random() * PIECE_KINDS.length)];
  return { kind, matrix: PIECES[kind], x: 0, y: 0 };
}

function centerPiece(piece: ActivePiece): ActivePiece {
  return {
    ...piece,
    x: Math.floor((BOARD_WIDTH - piece.matrix[0].length) / 2),
    y: 0,
  };
}

function canPlace(board: Board, piece: ActivePiece) {
  for (let y = 0; y < piece.matrix.length; y += 1) {
    for (let x = 0; x < piece.matrix[y].length; x += 1) {
      if (!piece.matrix[y][x]) continue;
      const boardX = piece.x + x;
      const boardY = piece.y + y;
      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) return false;
      if (boardY >= 0 && board[boardY][boardX]) return false;
    }
  }
  return true;
}

function mergePiece(board: Board, piece: ActivePiece): Board {
  const next = board.map((row) => [...row]);
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const boardY = piece.y + y;
      const boardX = piece.x + x;
      if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
        next[boardY][boardX] = piece.kind;
      }
    });
  });
  return next;
}

function withActivePiece(board: Board, piece: ActivePiece | null): Board {
  if (!piece) return board;
  return mergePiece(board, piece);
}

function createUiState(state: GameState): GameUiState {
  return {
    level: state.level,
    lines: state.lines,
    next: state.next,
    score: state.score,
    status: state.status,
  };
}

function areUiStatesEqual(current: GameUiState, next: GameUiState) {
  return (
    current.level === next.level &&
    current.lines === next.lines &&
    current.next === next.next &&
    current.score === next.score &&
    current.status === next.status
  );
}

function drawBoardCanvas(canvas: HTMLCanvasElement, state: GameState) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.clientWidth;
  const cssHeight = rect.height || canvas.clientHeight || cssWidth * 2;
  if (cssWidth <= 0 || cssHeight <= 0) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, BOARD_RENDER_DPR_CAP);
  const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = "rgba(3, 7, 18, 0.84)";
  context.fillRect(0, 0, cssWidth, cssHeight);

  const visibleBoard = withActivePiece(state.board, state.active);
  const clearingRows = new Set(state.clearingRows);
  const cellSize = Math.min(cssWidth / BOARD_WIDTH, cssHeight / BOARD_HEIGHT);
  const boardWidth = cellSize * BOARD_WIDTH;
  const boardHeight = cellSize * BOARD_HEIGHT;
  const offsetX = (cssWidth - boardWidth) / 2;
  const offsetY = (cssHeight - boardHeight) / 2;
  const gap = Math.max(1, cellSize * 0.08);
  const radius = Math.max(3, cellSize * 0.16);

  context.lineWidth = Math.max(1, Math.min(2, cellSize * 0.05));

  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = visibleBoard[y][x];
      const isClearing = clearingRows.has(y);
      const cellX = offsetX + x * cellSize + gap / 2;
      const cellY = offsetY + y * cellSize + gap / 2;
      const drawSize = cellSize - gap;

      roundedRectPath(context, cellX, cellY, drawSize, drawSize, radius);
      if (isClearing) {
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.strokeStyle = "rgba(255, 255, 255, 0.96)";
      } else if (cell) {
        const palette = CELL_PALETTE[cell];
        context.fillStyle = palette.fill;
        context.strokeStyle = palette.stroke;
      } else {
        context.fillStyle = "rgba(255, 255, 255, 0.035)";
        context.strokeStyle = "rgba(255, 255, 255, 0.055)";
      }
      context.fill();
      context.stroke();

      if (cell && !isClearing) {
        const palette = CELL_PALETTE[cell];
        roundedRectPath(
          context,
          cellX + drawSize * 0.18,
          cellY + drawSize * 0.14,
          drawSize * 0.64,
          drawSize * 0.18,
          radius * 0.5,
        );
        context.fillStyle = palette.shine;
        context.fill();
      }
    }
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
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

function clearCompletedLines(board: Board) {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const lines = BOARD_HEIGHT - remaining.length;
  return {
    board: [
      ...Array.from({ length: lines }, () => Array<Cell>(BOARD_WIDTH).fill(null)),
      ...remaining,
    ],
    lines,
    clearingRows: [] as number[],
  };
}

function rotateMatrix(matrix: Matrix): Matrix {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function scoreForLines(lines: number, level: number) {
  const scores = [0, 100, 300, 500, 800];
  return (scores[lines] ?? lines * 300) * level;
}

function getDropInterval(level: number) {
  return Math.max(
    MIN_DROP_INTERVAL_MS,
    INITIAL_DROP_INTERVAL_MS - (level - 1) * DROP_INTERVAL_LEVEL_STEP_MS,
  );
}

function renderPreviewCells(piece: ActivePiece): Cell[] {
  const grid = Array<Cell>(16).fill(null);
  const offsetX = Math.floor((4 - piece.matrix[0].length) / 2);
  const offsetY = Math.floor((4 - piece.matrix.length) / 2);
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        grid[(offsetY + y) * 4 + offsetX + x] = piece.kind;
      }
    });
  });
  return grid;
}
