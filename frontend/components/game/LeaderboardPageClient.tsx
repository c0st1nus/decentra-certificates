"use client";

import { ArrowLeft, Ellipsis, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  type LeaderboardEntry,
  type LeaderboardResponse,
  fetchGameLeaderboard,
} from "@/lib/game-api";
import { cn, formatCompactNumber } from "@/lib/utils";

const TOP_N = 10;

type LeaderboardPayload = {
  entries: LeaderboardEntry[];
  total_players: number;
  viewer?: LeaderboardEntry;
};

export function LeaderboardPageClient() {
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, response } = await fetchGameLeaderboard();
      if (!response.ok || !data) {
        throw new Error("Leaderboard unavailable");
      }
      setPayload(parseLeaderboardPayload(data));
    } catch {
      setError("Не удалось загрузить лидерборд.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const entries = payload?.entries ?? [];
  const total_players = payload?.total_players ?? 0;
  const viewer = payload?.viewer;

  const podium = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3, TOP_N), [entries]);

  const showManyMoreTeaser = total_players > TOP_N;
  const othersBeyondTop = Math.max(0, total_players - TOP_N);

  return (
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
          <p className="admin-eyebrow">Public leaderboard</p>
          <h1 className="heading-hero text-gradient mt-3 text-left">Лидерборд</h1>
          <p className="mt-4 text-sm leading-6 text-white/70 sm:text-base">
            Лучшие игроки Tetris Challenge. Публично показываются только username, аватар и счёт.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <div className="admin-panel">
          <h2 className="text-lg font-black text-white">Лидерборд не загрузился</h2>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <button
            className="btn-hero mt-5 rounded-2xl border border-primary/25 bg-primary/10 text-primary"
            type="button"
            onClick={() => void loadLeaderboard()}
          >
            Повторить
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="admin-panel flex flex-col items-center justify-center p-10 text-center">
          <Trophy className="size-12 text-primary/80" />
          <h2 className="mt-4 text-xl font-black text-white">Лидерборд пока пуст</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
            Станьте первым игроком с сохранённым результатом.
          </p>
          <Link className="btn-hero mt-5 rounded-2xl bg-primary/15 text-primary" href="/game">
            Играть
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {podium.map((entry, index) => (
              <PodiumCard entry={entry} index={index} key={leaderboardKey(entry)} />
            ))}
          </div>
          {rest.length > 0 ? (
            <div className="admin-panel overflow-hidden p-0">
              {rest.map((entry, index) => (
                <LeaderboardRow
                  entry={entry}
                  key={leaderboardKey(entry)}
                  rank={entry.rank ?? index + 4}
                />
              ))}
            </div>
          ) : null}
          {showManyMoreTeaser ? (
            <ManyMorePlayersRow othersBeyondTop={othersBeyondTop} totalPlayers={total_players} />
          ) : null}
          {viewer ? <ViewerResultCard entry={viewer} /> : null}
        </div>
      )}
    </section>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

function ManyMorePlayersRow({
  othersBeyondTop,
  totalPlayers,
}: {
  othersBeyondTop: number;
  totalPlayers: number;
}) {
  return (
    <div className="admin-panel flex flex-col items-center justify-center gap-2 border border-dashed border-primary/25 bg-primary/[0.04] py-6 text-center">
      <div className="flex items-center gap-2 text-primary/90">
        <Ellipsis className="size-6" strokeWidth={2.5} />
        <span className="font-pixel text-lg tracking-wide">···</span>
        <Ellipsis className="size-6" strokeWidth={2.5} />
      </div>
      <p className="text-base font-semibold text-white/85">И ещё сотни игроков…</p>
      <p className="max-w-md px-4 text-sm leading-6 text-white/55">
        Всего в таблице уже{" "}
        <span className="font-medium text-primary/90">{formatCompactNumber(totalPlayers)}</span>
        {othersBeyondTop > 0 ? (
          <>
            {" "}
            — за пределами топ-{TOP_N} ещё минимум{" "}
            <span className="font-medium text-white/75">
              {formatCompactNumber(othersBeyondTop)}
            </span>
            .
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}

function ViewerResultCard({ entry }: { entry: LeaderboardEntry }) {
  const rank = entry.rank;
  return (
    <div className="admin-panel relative overflow-hidden border-primary/35 bg-gradient-to-br from-primary/[0.14] via-black/25 to-black/40 shadow-[0_0_40px_rgba(140,216,18,0.08)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(140,216,18,0.12),transparent_55%)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="admin-eyebrow text-primary/90">Ваш результат</p>
          <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
            {typeof rank === "number" ? (
              <>
                Вы на <span className="text-primary">#{rank}</span> месте
              </>
            ) : (
              <>Вы вне топ-{TOP_N}</>
            )}
          </h2>
          <p className="mt-1 text-sm text-white/55">
            Так держать — в следующий раз пробьётесь выше.
          </p>
        </div>
        <div className="flex items-center gap-4 sm:shrink-0">
          <Avatar className="size-14 sm:size-16" entry={entry} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">@{entry.username}</p>
            <p className="font-pixel text-lg text-primary sm:text-xl">
              {formatCompactNumber(entry.score)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const rank = entry.rank ?? index + 1;
  return (
    <div
      className={cn(
        "admin-panel text-center",
        rank === 1 && "border-primary/30 bg-primary/10 shadow-[0_0_32px_rgba(140,216,18,0.12)]",
      )}
    >
      <p className="font-pixel text-lg text-primary">#{rank}</p>
      <Avatar className="mx-auto mt-4 size-20" entry={entry} />
      <h2 className="mt-4 truncate text-xl font-black text-white">@{entry.username}</h2>
      <p className="mt-2 font-pixel text-2xl text-primary">{formatCompactNumber(entry.score)}</p>
    </div>
  );
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-white/10 border-b bg-black/20 p-4 last:border-b-0">
      <span className="font-pixel text-sm text-primary">#{rank}</span>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10" entry={entry} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">@{entry.username}</p>
          <p className="text-xs text-white/45">{entry.games_played ?? 1} игр</p>
        </div>
      </div>
      <p className="font-pixel text-sm text-primary">{formatCompactNumber(entry.score)}</p>
    </div>
  );
}

function Avatar({ className, entry }: { className?: string; entry: LeaderboardEntry }) {
  if (entry.avatar_url) {
    return (
      <img
        alt={`Аватар ${entry.username}`}
        className={cn("rounded-2xl border border-white/10 object-cover", className)}
        height={80}
        src={entry.avatar_url}
        width={80}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 font-bold text-primary",
        className,
      )}
    >
      {entry.username.slice(0, 2).toUpperCase()}
    </div>
  );
}

function parseLeaderboardPayload(
  data: LeaderboardResponse | LeaderboardEntry[],
): LeaderboardPayload {
  if (Array.isArray(data)) {
    const entries = data.slice(0, TOP_N);
    return {
      entries,
      total_players: data.length,
    };
  }
  const rawItems = data.items ?? data.leaders ?? data.leaderboard ?? [];
  const entries = rawItems.slice(0, TOP_N);
  const total_players =
    typeof data.total_players === "number" && Number.isFinite(data.total_players)
      ? data.total_players
      : rawItems.length;
  const viewerRaw = data.viewer;
  const viewer =
    viewerRaw && typeof viewerRaw === "object" && viewerRaw.username ? viewerRaw : undefined;

  return { entries, total_players, viewer };
}

function leaderboardKey(entry: LeaderboardEntry) {
  return [entry.user_id, entry.username, entry.score, entry.achieved_at].filter(Boolean).join(":");
}
