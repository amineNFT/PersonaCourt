"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { NetworkService, PlayerInfo } from "@/lib/network";
import { SCENARIOS } from "@/data/scenarios";
import { rollScenario } from "@/data/personas";
import type { ScenarioMeta } from "@/lib/genlayer";
import { createGame } from "@/lib/genlayer";
import type { GameContext } from "@/app/page";

interface Props {
  onLeave: () => void;
  onStart: (ctx: GameContext) => void;
}

const ROUNDS_PER_GAME = 3;

export default function Lobby({ onLeave, onStart }: Props) {
  const { address } = useAccount();
  const [mode, setMode] = useState<"choose" | "host" | "join">("choose");
  const [roomCode, setRoomCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const networkRef = useRef<NetworkService | null>(null);

  const me: PlayerInfo | null = useMemo(() => {
    if (!address) return null;
    return {
      address,
      peerId: networkRef.current?.myPeerId ?? "",
      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
    };
  }, [address]);

  useEffect(() => {
    return () => {
      networkRef.current?.destroy();
      networkRef.current = null;
    };
  }, []);

  const playersRef = useRef<PlayerInfo[]>(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const startHost = async () => {
    if (!me) return;
    setError(null);
    setStatus("Calling the court to order…");
    const net = new NetworkService();
    networkRef.current = net;

    try {
      const code = await net.createRoom();
      const host: PlayerInfo = { ...me, peerId: net.myPeerId };
      setPlayers([host]);
      setRoomCode(code);
      setMode("host");
      setStatus("");

      net.onMessage((msg, from) => {
        if (msg.type === "PLAYER_JOIN") {
          const p = msg.payload as PlayerInfo;
          setPlayers((prev) => {
            if (prev.some((x) => x.address.toLowerCase() === p.address.toLowerCase())) return prev;
            const next = [...prev, { ...p, peerId: from }];
            net.broadcast({ type: "PLAYER_LIST", payload: next });
            return next;
          });
        }
      });

      net.onDisconnected((peerId) => {
        setPlayers((prev) => {
          const next = prev.filter((p) => p.peerId !== peerId);
          net.broadcast({ type: "PLAYER_LIST", payload: next });
          return next;
        });
      });
    } catch (e) {
      console.error(e);
      setError("The court failed to convene. Try again.");
      setStatus("");
    }
  };

  const joinRoom = async () => {
    if (!me || !joinInput) return;
    setError(null);
    setStatus("Approaching the bench…");
    const net = new NetworkService();
    networkRef.current = net;

    try {
      const code = joinInput.toUpperCase().trim();
      await net.joinRoom(code);
      setRoomCode(code);
      setMode("join");
      setStatus("");

      net.onMessage((msg) => {
        if (msg.type === "PLAYER_LIST") {
          setPlayers(msg.payload as PlayerInfo[]);
        }
        if (msg.type === "GAME_START") {
          const { scenarios, gameId } = msg.payload as {
            scenarios: ScenarioMeta[];
            gameId: string;
          };
          onStart({
            gameId,
            rounds: scenarios,
            players: playersRef.current,
            network: net,
            isHost: false,
          });
        }
      });

      setTimeout(() => {
        net.broadcast({
          type: "PLAYER_JOIN",
          payload: { ...me, peerId: net.myPeerId },
        });
      }, 400);
    } catch (e) {
      console.error(e);
      setError("The court will not admit you. Check the summons code.");
      setStatus("");
    }
  };

  const [starting, setStarting] = useState(false);

  const hostStartGame = async () => {
    const net = networkRef.current;
    if (!net || players.length < 2 || !address || starting) return;
    const used: string[] = [];
    const scenarios: ScenarioMeta[] = [];
    for (let i = 1; i <= ROUNDS_PER_GAME; i++) {
      const s = rollScenario(SCENARIOS, used);
      used.push(s);
      scenarios.push({ round: i, scenario: s });
    }
    const gameId = `pc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const roster = players.map((p) => p.address);

    setStarting(true);
    setError(null);
    setStatus("Sealing the docket on-chain…");
    try {
      // Commit host, roster, scenarios and rounds before anyone testifies.
      await createGame(address, gameId, roster, scenarios);
    } catch (e) {
      console.error(e);
      setError("The court could not open the docket. Try again.");
      setStatus("");
      setStarting(false);
      return;
    }
    setStatus("");
    setStarting(false);

    net.broadcast({ type: "GAME_START", payload: { scenarios, gameId } });
    onStart({
      gameId,
      rounds: scenarios,
      players,
      network: net,
      isHost: true,
    });
  };

  // ──────────────────────────────────────────────────────────────────────
  // CHOOSE: file a case, or answer one
  // ──────────────────────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <div className="page-root min-h-screen px-4 sm:px-6 py-6">
        <button onClick={onLeave} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 11 }}>
          ← Leave Court
        </button>

        <div className="max-w-5xl mx-auto mt-10">
          <div className="text-center mb-10 ink-rise">
            <div className="stamp-ink mb-3">Petitioner&apos;s Notice</div>
            <h2 className="display text-4xl sm:text-5xl mb-2">
              File a Case · Or Answer One
            </h2>
            <div
              className="prose-court mx-auto max-w-xl"
              style={{ fontSize: 17, color: "var(--pc-ink-muted)" }}
            >
              You may preside over your own session, or be summoned into another&apos;s.
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="doc-card-soft p-8 lift cursor-pointer" onClick={startHost}>
              <div className="stamp mb-4">Petition I</div>
              <div className="display text-2xl mb-3" style={{ fontSize: 26 }}>
                Preside as Judge
              </div>
              <p className="prose-court mb-6" style={{ fontSize: 17 }}>
                Convene the tribunal. Issue summons. Seal the verdict on-chain
                after the final round.
              </p>
              <span className="btn-seal" style={{ padding: "12px 22px", fontSize: 12 }}>
                Take the Bench →
              </span>
            </div>

            <div className="doc-card-soft p-8">
              <div className="stamp mb-4">Petition II</div>
              <div className="display text-2xl mb-3" style={{ fontSize: 26 }}>
                Answer a Summons
              </div>
              <p className="prose-court mb-5" style={{ fontSize: 17 }}>
                Enter the six-character court code issued to you by the
                presiding judge.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <input
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  placeholder="X X X X X X"
                  maxLength={6}
                  className="ink-input text-center"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={joinRoom}
                  disabled={joinInput.length !== 6}
                  className="btn-seal"
                  style={{ padding: "12px 20px", fontSize: 12 }}
                >
                  Enter
                </button>
              </div>
            </div>
          </div>

          {status && (
            <div
              className="mt-8 text-center prose-court italic"
              style={{ color: "var(--pc-ink-muted)" }}
            >
              {status}
            </div>
          )}
          {error && (
            <div
              className="mt-8 text-center prose-court"
              style={{ color: "var(--pc-oxblood)" }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // SUMMONS ISSUED: jury seating in
  // ──────────────────────────────────────────────────────────────────────
  const seats = Array.from({ length: 6 });

  return (
    <div className="page-root min-h-screen px-4 sm:px-6 py-6">
      <button onClick={onLeave} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 11 }}>
        ← Recuse Yourself
      </button>

      <div className="max-w-3xl mx-auto mt-10">
        <div className="doc-card px-8 sm:px-12 py-10 ink-rise">
          {/* Summons header */}
          <div className="text-center mb-8">
            <div className="stamp mb-3">Official Summons</div>
            <div className="rule-fancy mb-4">
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
            <div
              className="display"
              style={{
                fontSize: 64,
                letterSpacing: "0.25em",
                color: "var(--pc-oxblood)",
              }}
            >
              {roomCode}
            </div>
            <div className="rule-fancy mt-4">
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
            <p
              className="prose-court italic mt-4"
              style={{ color: "var(--pc-ink-muted)", fontSize: 16 }}
            >
              {mode === "host"
                ? "Share this code — the jury must assemble."
                : "You have entered the gallery. Await the gavel."}
            </p>
          </div>

          {/* Jury box */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-3">
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "0.06em",
                }}
              >
                The Jury Box
              </div>
              <div
                className="font-mono"
                style={{ color: "var(--pc-ink-muted)", fontSize: 12, letterSpacing: "0.2em" }}
              >
                {players.length} / 6 · MIN 2
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {seats.map((_, i) => {
                const p = players[i];
                const isJudge = i === 0 && !!p;
                return (
                  <div
                    key={i}
                    className="p-3 flex items-center gap-3"
                    style={{
                      border: "1px solid var(--pc-ink)",
                      background: p
                        ? isJudge
                          ? "rgba(224, 161, 58, 0.14)"
                          : "rgba(255, 255, 255, 0.045)"
                        : "transparent",
                      borderStyle: p ? "solid" : "dashed",
                      borderColor: p ? "var(--pc-ink)" : "var(--pc-rule)",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: p
                          ? isJudge
                            ? "var(--pc-oxblood)"
                            : "var(--pc-ink)"
                          : "transparent",
                        border: p ? "none" : "1px dashed var(--pc-rule)",
                        color: "var(--pc-vellum)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {p ? (isJudge ? "⚖" : i + 1) : ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      {p ? (
                        <>
                          <div
                            className="font-mono truncate"
                            style={{ fontSize: 12, color: "var(--pc-ink)" }}
                          >
                            {p.name}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 9,
                              letterSpacing: "0.28em",
                              textTransform: "uppercase",
                              color: isJudge ? "var(--pc-oxblood)" : "var(--pc-ink-muted)",
                            }}
                          >
                            {isJudge ? "The Honorable" : "Juror " + (i + 1)}
                          </div>
                        </>
                      ) : (
                        <div
                          className="italic"
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 14,
                            color: "var(--pc-ink-faint)",
                          }}
                        >
                          seat vacant
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Proceedings */}
          <div
            className="p-6 mb-8"
            style={{
              background: "rgba(255, 255, 255, 0.035)",
              border: "1px solid var(--pc-rule)",
            }}
          >
            <div className="stamp mb-4">Rules of Proceedings</div>
            <ol className="space-y-2 prose-court" style={{ fontSize: 17 }}>
              <li>
                <b>§1.</b> Three rounds shall be held. Each juror receives the
                same scenario.
              </li>
              <li>
                <b>§2.</b> Three personas are drawn anew each round. Pick one
                and testify in character within <b>120 seconds</b>.
              </li>
              <li>
                <b>§3.</b> Responses are submitted to the chain under your own
                wallet. The Judge cannot speak for you.
              </li>
              <li>
                <b>§4.</b> AI validators weigh adherence (60%) and creativity
                (40%). XP is awarded on-chain.
              </li>
            </ol>
          </div>

          {/* Action */}
          {mode === "host" ? (
            <button
              onClick={hostStartGame}
              disabled={players.length < 2 || starting}
              className="btn-seal w-full"
            >
              {starting
                ? "Sealing the Docket…"
                : players.length < 2
                ? `Awaiting ${2 - players.length} More Juror${players.length === 1 ? "" : "s"}`
                : "⚖  Call the Court to Order"}
            </button>
          ) : (
            <div
              className="flex items-center justify-center gap-3 py-4 prose-court italic"
              style={{ color: "var(--pc-ink-muted)" }}
            >
              <span
                className="inline-block"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--pc-oxblood)",
                  animation: "pulse 1.4s ease-in-out infinite",
                }}
              />
              Awaiting the Judge&apos;s gavel…
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
