import type { Metadata } from "next";

import { LeaderboardPageClient } from "@/components/game/LeaderboardPageClient";
import { GridBackground } from "@/components/grid-background";

export const metadata: Metadata = {
  title: "Game Leaderboard",
};

export default function GameLeaderboardPage() {
  return (
    <main className="relative isolate min-h-screen overflow-x-hidden">
      <GridBackground />
      <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <LeaderboardPageClient />
      </div>
    </main>
  );
}
