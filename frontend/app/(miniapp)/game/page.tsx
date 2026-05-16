import type { Metadata } from "next";

import { GamePageClient } from "@/components/game/GamePageClient";
import { GridBackground } from "@/components/grid-background";

export const metadata: Metadata = {
  title: "Tetris Challenge",
  description: "Play the Decentrathon Tetris minigame and save your Telegram-authenticated score.",
};

export default function GamePage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-x-hidden">
      <GridBackground />
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <GamePageClient />
      </div>
    </main>
  );
}
