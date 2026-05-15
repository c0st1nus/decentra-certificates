import type { Metadata } from "next";

import { GamePageClient } from "@/components/game/GamePageClient";
import { GridBackground } from "@/components/grid-background";

export const metadata: Metadata = {
  title: "Tetris Challenge",
  description: "Play the Decentrathon Tetris minigame and save your Telegram-authenticated score.",
};

export default function GamePage() {
  return (
    <main className="relative isolate min-h-screen overflow-x-hidden">
      <GridBackground />
      <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <GamePageClient />
      </div>
    </main>
  );
}
