"use client";

import { Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { GameAuthGate } from "@/components/game/GameAuthGate";
import { Tetris } from "@/components/game/Tetris";
import { finishGameSession, startGameSession } from "@/lib/game-api";

export function GamePageClient() {
  const sessionIdRef = useRef<string | null>(null);
  const sessionNonceRef = useRef<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [finishState, setFinishState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleStart = useCallback(async () => {
    const { data, response } = await startGameSession();
    const sessionId = data?.session_id ?? data?.id;
    const nonce = data?.nonce;
    if (!response.ok || !sessionId || !nonce) {
      throw new Error("Game session was not created");
    }
    sessionIdRef.current = String(sessionId);
    sessionNonceRef.current = nonce;
    setFinishState("idle");
  }, []);

  const handleGameOver = useCallback(async (result: { score: number; lines: number }) => {
    const sessionId = sessionIdRef.current;
    const nonce = sessionNonceRef.current;
    setLastScore(result.score);

    if (!sessionId || !nonce) {
      setFinishState("error");
      toast.error("Не удалось сохранить результат: сессия игры не найдена.");
      return;
    }

    setFinishState("saving");
    try {
      const { response } = await finishGameSession(sessionId, {
        score: result.score,
        lines_cleared: result.lines,
        nonce,
      });
      if (!response.ok) {
        throw new Error("Score save failed");
      }
      setFinishState("saved");
      toast.success("Результат сохранён.");
    } catch {
      setFinishState("error");
      toast.error("Не удалось сохранить результат. Попробуйте сыграть ещё раз.");
    } finally {
      sessionIdRef.current = null;
      sessionNonceRef.current = null;
    }
  }, []);

  return (
    <GameAuthGate>
      <section className="flex min-h-0 flex-1 flex-col space-y-2 lg:space-y-6">
        <div className="lg:hidden">
          <p className="admin-eyebrow">Decentrathon arcade</p>
          <h1 className="heading-hero text-gradient mt-2 text-left text-2xl sm:text-3xl">Tetris</h1>
          {lastScore !== null ? (
            <p className="mt-2 text-xs text-white/65">
              Последний счёт: <span className="font-semibold text-primary">{lastScore}</span>
              {finishState === "saving" ? " · сохраняем..." : null}
              {finishState === "saved" ? " · сохранено" : null}
              {finishState === "error" ? " · не сохранено" : null}
            </p>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="admin-eyebrow">Decentrathon arcade</p>
              <h1 className="heading-hero text-gradient mt-3 text-left">Tetris Challenge</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Классический Tetris с ускорением, линиями и очками. Сыграйте партию, сохраните счёт
                и попробуйте подняться в лидерборде.
              </p>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                href="/game/profile"
              >
                <UserRound className="size-4" />
                Профиль
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                href="/game/leaderboard"
              >
                <Trophy className="size-4" />
                Лидерборд
              </Link>
            </div>
          </div>
        </div>

        {lastScore !== null ? (
          <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70 lg:block">
            Последний счёт: <span className="font-semibold text-primary">{lastScore}</span>
            {finishState === "saving" ? " · сохраняем..." : null}
            {finishState === "saved" ? " · сохранено" : null}
            {finishState === "error" ? " · не сохранено" : null}
          </div>
        ) : null}

        <Tetris className="min-h-0 flex-1" onGameOver={handleGameOver} onStart={handleStart} />
      </section>
    </GameAuthGate>
  );
}
