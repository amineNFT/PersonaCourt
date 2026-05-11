"use client";

import { useState } from "react";
import MainMenu from "@/components/MainMenu";
import Lobby from "@/components/Lobby";
import GameRound from "@/components/GameRound";
import Results from "@/components/Results";
import Leaderboard from "@/components/Leaderboard";
import type { PlayerInfo } from "@/lib/network";
import type { JudgingResult, ScenarioMeta } from "@/lib/genlayer";
import type { NetworkService } from "@/lib/network";

export type Screen = "menu" | "lobby" | "game" | "results" | "leaderboard";

export interface GameContext {
  gameId: string;
  rounds: ScenarioMeta[];
  players: PlayerInfo[];
  network: NetworkService;
  isHost: boolean;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [result, setResult] = useState<JudgingResult | null>(null);

  if (screen === "menu") {
    return (
      <MainMenu
        onEnterLobby={() => setScreen("lobby")}
        onOpenLeaderboard={() => setScreen("leaderboard")}
      />
    );
  }

  if (screen === "lobby") {
    return (
      <Lobby
        onLeave={() => setScreen("menu")}
        onStart={(gc) => {
          setCtx(gc);
          setScreen("game");
        }}
      />
    );
  }

  if (screen === "game" && ctx) {
    return (
      <GameRound
        ctx={ctx}
        onFinish={(r) => {
          setResult(r);
          setScreen("results");
        }}
        onAbort={() => {
          ctx.network.destroy();
          setCtx(null);
          setScreen("menu");
        }}
      />
    );
  }

  if (screen === "results" && result && ctx) {
    return (
      <Results
        result={result}
        onDone={() => {
          ctx.network.destroy();
          setCtx(null);
          setResult(null);
          setScreen("menu");
        }}
      />
    );
  }

  if (screen === "leaderboard") {
    return <Leaderboard onBack={() => setScreen("menu")} />;
  }

  return null;
}
