"use client";

import { RotateCcw, TimerReset, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin-page-header";
import { AdminPanel } from "@/components/admin-panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AdminGameLeaderboardEntry,
  type AdminGameLeaderboardResponse,
  fetchAdminGameLeaderboard,
  resetGameLeaderboard,
  scheduleGameLeaderboardReset,
} from "@/lib/admin-api";
import { formatCompactNumber } from "@/lib/utils";

export default function AdminGamePage() {
  const [entries, setEntries] = useState<AdminGameLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState("");

  const loadLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, response } = await fetchAdminGameLeaderboard();
      if (!response.ok || !data) {
        throw new Error("Admin leaderboard unavailable");
      }
      setEntries(normalizeLeaderboard(data));
    } catch {
      setError("Не удалось загрузить игровой лидерборд.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  async function handleReset() {
    const confirmed = window.confirm("Сбросить лидерборд прямо сейчас?");
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const { response } = await resetGameLeaderboard();
      if (!response.ok) {
        throw new Error("Reset failed");
      }
      toast.success("Лидерборд сброшен.");
      await loadLeaderboard();
    } catch {
      toast.error("Не удалось сбросить лидерборд.");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleSchedule() {
    setIsScheduling(true);
    try {
      const resetAtIso = resetAt ? new Date(resetAt).toISOString() : undefined;
      const { response } = await scheduleGameLeaderboardReset({ reset_at: resetAtIso });
      if (!response.ok) {
        throw new Error("Schedule failed");
      }
      toast.success("Сброс лидерборда запланирован.");
      setResetAt("");
    } catch {
      toast.error("Не удалось запланировать сброс.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        description="Управляйте игровым лидербордом Tetris Challenge, просматривайте лучшие результаты и запускайте сбросы."
        title="Игра и лидерборд"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <AdminPanel className="overflow-hidden p-0">
          <div className="border-white/10 border-b p-5">
            <p className="admin-eyebrow">Admin leaderboard</p>
            <h2 className="mt-2 text-2xl font-black text-white">Лучшие результаты</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : error ? (
            <div className="p-5">
              <p className="text-sm text-red-100">{error}</p>
              <button
                className="btn-hero mt-4 rounded-2xl border border-primary/25 bg-primary/10 text-primary"
                type="button"
                onClick={() => void loadLeaderboard()}
              >
                Повторить
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <Trophy className="size-12 text-primary/80" />
              <h3 className="mt-4 text-lg font-black text-white">Результатов пока нет</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                Когда игроки завершат партии, записи появятся здесь.
              </p>
            </div>
          ) : (
            entries.map((entry, index) => (
              <LeaderboardRow
                entry={entry}
                key={leaderboardKey(entry)}
                rank={entry.rank ?? index + 1}
              />
            ))
          )}
        </AdminPanel>

        <AdminPanel className="space-y-5">
          <div>
            <p className="admin-eyebrow">Reset controls</p>
            <h2 className="mt-2 text-2xl font-black text-white">Сброс лидерборда</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Быстрый сброс доступен сразу. Запланированный сброс можно отправить без даты, если
              сервер использует своё расписание по умолчанию.
            </p>
          </div>

          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isResetting}
            type="button"
            onClick={() => void handleReset()}
          >
            <RotateCcw className="size-4" />
            {isResetting ? "Сбрасываем..." : "Reset Leaderboard Now"}
          </button>

          <div>
            <label className="text-sm font-semibold text-white" htmlFor="game-reset-at">
              Время сброса
            </label>
            <input
              className="admin-input mt-2"
              id="game-reset-at"
              type="datetime-local"
              value={resetAt}
              onChange={(event) => setResetAt(event.target.value)}
            />
          </div>

          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isScheduling}
            type="button"
            onClick={() => void handleSchedule()}
          >
            <TimerReset className="size-4" />
            {isScheduling ? "Планируем..." : "Schedule Reset"}
          </button>
        </AdminPanel>
      </div>
    </section>
  );
}

function LeaderboardRow({
  entry,
  rank,
}: {
  entry: AdminGameLeaderboardEntry;
  rank: number;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-white/10 border-b bg-black/20 p-4 text-sm last:border-b-0">
      <span className="font-pixel text-primary">#{rank}</span>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar entry={entry} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">@{entry.username}</p>
          <p className="text-xs text-white/45">
            {entry.games_played ?? 1} игр
            {entry.last_played_at ? ` · ${entry.last_played_at}` : ""}
          </p>
        </div>
      </div>
      <p className="font-pixel text-primary">{formatCompactNumber(entry.score)}</p>
    </div>
  );
}

function Avatar({ entry }: { entry: AdminGameLeaderboardEntry }) {
  if (entry.avatar_url) {
    return (
      <img
        alt={`Аватар ${entry.username}`}
        className="size-10 rounded-2xl border border-white/10 object-cover"
        height={40}
        src={entry.avatar_url}
        width={40}
      />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-sm font-bold text-primary">
      {entry.username.slice(0, 2).toUpperCase()}
    </div>
  );
}

function normalizeLeaderboard(
  data: AdminGameLeaderboardResponse | AdminGameLeaderboardEntry[],
): AdminGameLeaderboardEntry[] {
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? data.leaders ?? data.leaderboard ?? [];
}

function leaderboardKey(entry: AdminGameLeaderboardEntry) {
  return [entry.user_id, entry.username, entry.score, entry.last_played_at]
    .filter(Boolean)
    .join(":");
}
