"use client";

import { ArrowDown, ArrowLeft, ArrowRight, Pause, Play, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

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
const BOARD_CELL_IDS = Array.from({ length: BOARD_HEIGHT }, (_, y) =>
  Array.from({ length: BOARD_WIDTH }, (_, x) => `cell-${y}-${x}`),
);
const PREVIEW_CELL_IDS = Array.from({ length: 16 }, (_, index) => `preview-${index}`);

export function Tetris({ className, onGameOver, onStart }: TetrisProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const handledGameOverScore = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const visibleBoard = useMemo(
    () => withActivePiece(state.board, state.active),
    [state.board, state.active],
  );
  const dropInterval = useMemo(() => getDropInterval(state.level), [state.level]);

  const startGame = useCallback(async () => {
    setStartError(null);
    setIsStarting(true);
    try {
      await onStart?.();
      handledGameOverScore.current = null;
      dispatch({ type: "start" });
    } catch {
      setStartError("Не удалось создать игровую сессию. Попробуйте ещё раз.");
    } finally {
      setIsStarting(false);
    }
  }, [onStart]);

  useEffect(() => {
    if (state.status !== "playing") {
      return;
    }

    const timer = window.setInterval(() => {
      dispatch({ type: "tick" });
    }, dropInterval);

    return () => window.clearInterval(timer);
  }, [dropInterval, state.status]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && state.status !== "playing") {
        event.preventDefault();
        void startGame();
        return;
      }

      if (state.status !== "playing") {
        return;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
        event.preventDefault();
      }

      if (event.key === "ArrowLeft") dispatch({ type: "move", dx: -1 });
      if (event.key === "ArrowRight") dispatch({ type: "move", dx: 1 });
      if (event.key === "ArrowDown") dispatch({ type: "softDrop" });
      if (event.key === "ArrowUp") dispatch({ type: "rotate" });
      if (event.key === " ") dispatch({ type: "hardDrop" });
      if (event.key.toLowerCase() === "p") dispatch({ type: "pause" });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [startGame, state.status]);

  useEffect(() => {
    if (state.status !== "gameOver") {
      return;
    }

    if (handledGameOverScore.current === state.score) {
      return;
    }

    handledGameOverScore.current = state.score;
    void onGameOver?.({ score: state.score, lines: state.lines });
  }, [onGameOver, state.lines, state.score, state.status]);

  useEffect(() => {
    if (state.clearingRows.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "commitClear" });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [state.clearingRows]);

  const isRunning = state.status === "playing";

  return (
    <section className={cn("grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]", className)}>
      <div className="admin-panel overflow-hidden p-3 sm:p-4">
        <div
          className="relative mx-auto grid max-w-[min(92vw,430px)] touch-none gap-1 rounded-2xl border border-primary/20 bg-black/50 p-2 shadow-[0_0_32px_rgba(140,216,18,0.1)]"
          style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))` }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || state.status !== "playing") return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
              dispatch({ type: "rotate" });
              return;
            }
            if (Math.abs(dx) > Math.abs(dy)) {
              dispatch({ type: "move", dx: dx > 0 ? 1 : -1 });
            } else if (dy > 0) {
              dispatch({ type: dy > 70 ? "hardDrop" : "softDrop" });
            }
          }}
          onTouchStart={(event) => {
            const touch = event.changedTouches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
        >
          {BOARD_CELL_IDS.flatMap((rowIds, y) =>
            rowIds.map((cellId, x) => {
              const cell = visibleBoard[y][x];
              return (
                <div
                  className={cn(
                    "aspect-square rounded-[0.28rem] border border-white/[0.035] bg-white/[0.035] transition-colors duration-150",
                    cell && CELL_CLASSES[cell],
                    state.clearingRows.includes(y) &&
                      "animate-pulse border-white/80 bg-white shadow-[0_0_18px_rgba(255,255,255,0.55)]",
                  )}
                  key={cellId}
                />
              );
            }),
          )}

          {state.status !== "playing" ? (
            <div className="absolute inset-2 flex flex-col items-center justify-center rounded-xl bg-black/75 p-5 text-center backdrop-blur-sm">
              <p className="font-pixel text-xl leading-8 text-primary">
                {state.status === "gameOver" ? "GAME OVER" : "TETRIS"}
              </p>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
                Управляйте стрелками, вращайте вверх, сбрасывайте пробелом. На телефоне используйте
                свайпы или кнопки ниже.
              </p>
              <button
                className="btn-hero glow-primary mt-5 rounded-2xl bg-primary/15 text-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isStarting}
                type="button"
                onClick={() => void startGame()}
              >
                <Play className="size-4" />
                {state.status === "gameOver" ? "Играть ещё" : "Старт"}
              </button>
              {startError ? <p className="mt-3 text-sm text-red-200">{startError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="admin-panel grid grid-cols-3 gap-3 text-center">
          <Stat label="Счёт" value={formatCompactNumber(state.score)} />
          <Stat label="Линии" value={String(state.lines)} />
          <Stat label="Уровень" value={String(state.level)} />
        </div>

        <div className="admin-panel">
          <p className="admin-eyebrow">Следующая фигура</p>
          <div className="mt-4 grid size-24 grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-black/35 p-2">
            {renderPreviewCells(state.next).map((cell, index) => (
              <div
                className={cn(
                  "rounded-[0.22rem] border border-white/[0.035] bg-white/[0.025]",
                  cell && CELL_CLASSES[cell],
                )}
                key={PREVIEW_CELL_IDS[index]}
              />
            ))}
          </div>
        </div>

        <div className="admin-panel space-y-3">
          <p className="admin-eyebrow">Управление</p>
          <div className="grid grid-cols-3 gap-2">
            <ControlButton
              disabled={!isRunning}
              label="Влево"
              onClick={() => dispatch({ type: "move", dx: -1 })}
            >
              <ArrowLeft className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вращать"
              onClick={() => dispatch({ type: "rotate" })}
            >
              <RotateCw className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вправо"
              onClick={() => dispatch({ type: "move", dx: 1 })}
            >
              <ArrowRight className="size-5" />
            </ControlButton>
            <ControlButton
              disabled={!isRunning}
              label="Вниз"
              onClick={() => dispatch({ type: "softDrop" })}
            >
              <ArrowDown className="size-5" />
            </ControlButton>
            <button
              className="col-span-2 min-h-12 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isRunning}
              type="button"
              onClick={() => dispatch({ type: "hardDrop" })}
            >
              Быстрый сброс
            </button>
          </div>

          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={state.status === "idle" || state.status === "gameOver"}
            type="button"
            onClick={() => dispatch({ type: isRunning ? "pause" : "resume" })}
          >
            {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isRunning ? "Пауза" : "Продолжить"}
          </button>
        </div>
      </aside>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-1 font-pixel text-lg text-primary">{value}</p>
    </div>
  );
}

function ControlButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
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
  return Math.max(110, 820 - (level - 1) * 65);
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
