"use client";

import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GameAuthGate } from "@/components/game/GameAuthGate";
import { Skeleton } from "@/components/ui/skeleton";
import { type GameHistoryItem, type GameProfileResponse, fetchGameProfile } from "@/lib/game-api";
import { formatCompactNumber, formatDate } from "@/lib/utils";

export function ProfilePageClient() {
  const [profile, setProfile] = useState<GameProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, response } = await fetchGameProfile();
      if (!response.ok || !data) {
        throw new Error("Profile unavailable");
      }
      setProfile(data);
    } catch {
      setError("Не удалось загрузить профиль игрока.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const games = useMemo(() => profile?.games ?? profile?.recent_games ?? [], [profile]);
  const personalBest = profile?.stats?.personal_best ?? profile?.personal_best ?? 0;

  return (
    <GameAuthGate>
      <section className="space-y-6">
        <div className="max-w-3xl space-y-4">
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm text-white/70 transition hover:border-primary/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            href="/game"
          >
            <ArrowLeft className="size-4" />
            Назад к игре
          </Link>
          <div>
            <p className="admin-eyebrow">Личный кабинет</p>
            <h1 className="heading-hero text-gradient mt-3 text-left">Профиль игрока</h1>
            <p className="mt-4 text-sm leading-6 text-white/70 sm:text-base">
              Здесь появятся ваши последние партии, рекорд и статистика Tetris Challenge.
            </p>
          </div>
        </div>

        {isLoading ? (
          <ProfileSkeleton />
        ) : error ? (
          <div className="admin-panel">
            <h2 className="text-lg font-black text-white">Профиль не загрузился</h2>
            <p className="mt-2 text-sm text-white/65">{error}</p>
            <button
              className="btn-hero mt-5 rounded-2xl border border-primary/25 bg-primary/10 text-primary"
              type="button"
              onClick={() => void loadProfile()}
            >
              Повторить
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Рекорд" value={formatCompactNumber(personalBest)} />
              <StatCard
                label="Игр сыграно"
                value={formatCompactNumber(profile?.stats?.games_played ?? games.length)}
              />
              <StatCard
                label="Всего очков"
                value={formatCompactNumber(profile?.stats?.total_score ?? totalScore(games))}
              />
              <StatCard
                label="Линий"
                value={formatCompactNumber(
                  profile?.stats?.total_lines_cleared ?? totalLines(games),
                )}
              />
            </div>

            <div className="admin-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="admin-eyebrow">История</p>
                  <h2 className="mt-2 text-2xl font-black text-white">Последние партии</h2>
                </div>
                <Link
                  className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  href="/game/leaderboard"
                >
                  <Trophy className="size-4" />
                  Открыть лидерборд
                </Link>
              </div>

              {games.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                  <h3 className="text-lg font-black text-white">Партий пока нет</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
                    Сыграйте первую партию, и результат появится здесь после сохранения.
                  </p>
                  <Link
                    className="btn-hero mt-5 rounded-2xl bg-primary/15 text-primary"
                    href="/game"
                  >
                    Играть
                  </Link>
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                  {games.map((game) => (
                    <GameRow key={game.id} game={game} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </GameAuthGate>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-panel">
      <p className="admin-eyebrow">{label}</p>
      <p className="mt-3 font-pixel text-2xl text-primary">{value}</p>
    </div>
  );
}

function GameRow({ game }: { game: GameHistoryItem }) {
  return (
    <div className="grid gap-2 border-white/10 border-b bg-black/20 p-4 text-sm last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div>
        <p className="font-semibold text-white">{formatCompactNumber(game.score)} очков</p>
        <p className="mt-1 text-xs text-white/45">{formatDate(game.created_at)}</p>
      </div>
      <p className="text-white/65">{game.lines_cleared ?? 0} линий</p>
      <p className="text-white/65">Уровень {game.level ?? 1}</p>
    </div>
  );
}

function totalScore(games: GameHistoryItem[]) {
  return games.reduce((sum, game) => sum + game.score, 0);
}

function totalLines(games: GameHistoryItem[]) {
  return games.reduce((sum, game) => sum + (game.lines_cleared ?? 0), 0);
}
