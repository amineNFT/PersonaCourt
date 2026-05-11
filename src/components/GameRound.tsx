"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { GameContext } from "@/app/page";
import { submitEntry, finalizeGame, getSubmissionCount, getGameResult } from "@/lib/genlayer";
import type { JudgingResult } from "@/lib/genlayer";
import { rollPersonaOptions } from "@/data/personas";
import ConsensusLoader from "./ConsensusLoader";

interface Props {
  ctx: GameContext;
  onFinish: (r: JudgingResult) => void;
  onAbort: () => void;
}

type RoundState = "input" | "submitting" | "submitted";

const MAX_RESPONSE_LEN = 500;
const ROUND_SECONDS = 120;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export default function GameRound({ ctx, onFinish, onAbort }: Props) {
  const { address } = useAccount();
  const totalRounds = ctx.rounds.length;
  const [roundIdx, setRoundIdx] = useState(0);
  const [state, setState] = useState<RoundState>("input");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string>("");

  const personaOptions = useMemo(() => {
    const out: string[][] = [];
    const used: string[] = [];
    for (let i = 0; i < totalRounds; i++) {
      const opts = rollPersonaOptions(3, used);
      out.push(opts);
      used.push(...opts);
    }
    return out;
  }, [totalRounds]);

  const round = ctx.rounds[roundIdx];
  const myOptions = personaOptions[roundIdx] ?? [];

  // ── Per-round countdown ───────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  useEffect(() => {
    setSecondsLeft(ROUND_SECONDS);
  }, [roundIdx]);
  useEffect(() => {
    if (state !== "input") return;
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [state, secondsLeft]);
  useEffect(() => {
    if (state !== "input") return;
    if (secondsLeft > 0) return;
    if (chosen && response.trim().length > 0) {
      submitThisRound(true);
    } else {
      if (roundIdx < totalRounds - 1) {
        setRoundIdx((i) => i + 1);
        setState("input");
        setResponse("");
        setChosen("");
      } else {
        setWaitingForOthers(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, state]);

  // ── Finalize flow (host only, after all rounds submitted) ──────────────
  const [finalizing, setFinalizing] = useState(false);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const finalizeStartedRef = useRef(false);

  const submitThisRound = async (auto = false) => {
    if (!address) return;
    if (!chosen) {
      if (auto) return;
      setError("Choose a persona before testifying.");
      return;
    }
    if (response.trim().length === 0) {
      if (auto) return;
      setError("The court demands a written response.");
      return;
    }
    setError(null);
    setState("submitting");
    try {
      await submitEntry(
        address,
        ctx.gameId,
        round.round,
        chosen,
        response.trim(),
      );
      setState("submitted");
      setTimeout(() => {
        if (roundIdx < totalRounds - 1) {
          setRoundIdx((i) => i + 1);
          setState("input");
          setResponse("");
          setChosen("");
        } else {
          setWaitingForOthers(true);
        }
      }, 1200);
    } catch (e) {
      console.error(e);
      setError(
        "The clerk did not confirm your filing. Strike the gavel again — duplicates are stricken from the record.",
      );
      setState("input");
    }
  };

  useEffect(() => {
    if (!waitingForOthers || !ctx.isHost || finalizeStartedRef.current) return;
    const expected = ctx.players.length * totalRounds;
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const cnt = await getSubmissionCount(ctx.gameId).catch(() => 0);
        if (cnt >= expected) {
          if (finalizeStartedRef.current) return;
          finalizeStartedRef.current = true;
          setFinalizing(true);
          try {
            const result = await finalizeGame(
              address!,
              ctx.gameId,
              ctx.rounds,
              ctx.players.map((p) => p.address),
            );
            ctx.network.broadcast({ type: "JUDGING_RESULT", payload: result });
            onFinish(result);
          } catch (e) {
            console.error(e);
            setError("The court could not seal the verdict. Try again.");
            setFinalizing(false);
            finalizeStartedRef.current = false;
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waitingForOthers, ctx, address, totalRounds, onFinish]);

  useEffect(() => {
    if (!waitingForOthers || ctx.isHost) return;
    let cancelled = false;
    let done = false;

    ctx.network.onMessage((msg) => {
      if (done) return;
      if (msg.type === "JUDGING_RESULT") {
        done = true;
        onFinish(msg.payload as JudgingResult);
      }
    });

    (async () => {
      while (!cancelled && !done) {
        const r = await getGameResult(ctx.gameId).catch(() => null);
        if (!cancelled && !done && r) {
          done = true;
          onFinish(r);
          return;
        }
        await new Promise((res) => setTimeout(res, 4000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waitingForOthers, ctx, onFinish]);

  if (finalizing) {
    return <ConsensusLoader label="The Court Deliberates" />;
  }

  if (waitingForOthers) {
    return (
      <div className="page-root min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="doc-card max-w-xl w-full px-10 py-12 text-center ink-rise">
          <div className="stamp mb-4">All Testimony Filed</div>
          <h2 className="display text-4xl mb-3">Awaiting the Court</h2>
          <p className="prose-court italic mb-8" style={{ color: "var(--pc-ink-muted)" }}>
            Once every juror has filed all {totalRounds} rounds on-chain, the
            judge shall seal the verdict.
          </p>
          <div className="flex justify-center mb-2">
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid var(--pc-rule)",
                borderTopColor: "var(--pc-oxblood)",
                borderRadius: "50%",
                animation: "spin 1.2s linear infinite",
              }}
            />
          </div>
          {error && (
            <div className="prose-court mt-4" style={{ color: "var(--pc-oxblood)" }}>
              {error}
            </div>
          )}
        </div>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const timerWarn = secondsLeft <= 15;
  const timerCaution = !timerWarn && secondsLeft <= 45;

  return (
    <div className="page-root min-h-screen px-4 sm:px-6 py-6">
      <button onClick={onAbort} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 11 }}>
        ← Abandon Cause
      </button>

      <div className="max-w-3xl mx-auto mt-8">
        <div className="doc-card px-7 sm:px-12 py-10 ink-rise">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <div className="stamp">
              Round {ROMAN[round.round - 1]} of {ROMAN[totalRounds - 1]}
            </div>
            <div
              className="font-mono tabular-nums px-3 py-1"
              style={{
                fontSize: 14,
                letterSpacing: "0.15em",
                border: "1px solid",
                borderColor: timerWarn
                  ? "var(--pc-oxblood)"
                  : timerCaution
                  ? "var(--pc-brass-deep)"
                  : "var(--pc-ink)",
                color: timerWarn
                  ? "var(--pc-oxblood)"
                  : timerCaution
                  ? "var(--pc-brass-deep)"
                  : "var(--pc-ink)",
                background: timerWarn ? "rgba(122,30,45,0.08)" : "transparent",
              }}
            >
              {String(Math.floor(secondsLeft / 60))}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </div>
          </div>

          {/* Round progress ticks */}
          <div className="flex gap-1.5 mb-7">
            {ctx.rounds.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  flex: 1,
                  background:
                    i < roundIdx
                      ? "var(--pc-oxblood)"
                      : i === roundIdx
                      ? "var(--pc-ink)"
                      : "var(--pc-rule)",
                }}
              />
            ))}
          </div>

          {/* Scenario */}
          <div className="text-center mb-8">
            <div className="stamp-ink mb-3">The Charge</div>
            <h2
              className="display"
              style={{ fontSize: 28, lineHeight: 1.25 }}
            >
              &ldquo;{round.scenario}&rdquo;
            </h2>
          </div>

          {/* Persona choice */}
          <div className="mb-6">
            <div
              className="rule-fancy mb-4"
              style={{ fontSize: 11 }}
            >
              <span className="stamp-ink">Choose Your Mask</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {myOptions.map((p) => {
                const isSelected = p === chosen;
                return (
                  <button
                    key={p}
                    onClick={() => setChosen(p)}
                    disabled={state !== "input"}
                    className="text-left p-4 transition-all"
                    style={{
                      background: isSelected
                        ? "var(--pc-ink)"
                        : "rgba(255, 250, 230, 0.4)",
                      color: isSelected ? "var(--pc-vellum)" : "var(--pc-ink)",
                      border: "1px solid var(--pc-ink)",
                      fontFamily: "EB Garamond, serif",
                      fontSize: 17,
                      lineHeight: 1.3,
                      cursor: state === "input" ? "pointer" : "default",
                      boxShadow: isSelected ? "0 4px 0 var(--pc-oxblood-deep)" : "none",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "Cinzel",
                        fontSize: 9,
                        letterSpacing: "0.25em",
                        textTransform: "uppercase",
                        color: isSelected ? "var(--pc-brass)" : "var(--pc-ink-muted)",
                        marginBottom: 6,
                      }}
                    >
                      {isSelected ? "Sworn" : "Available"}
                    </div>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Testimony */}
          <div className="mb-6">
            <div className="flex items-end justify-between mb-2">
              <div className="stamp-ink">Sworn Testimony</div>
              <div
                className="font-mono"
                style={{ fontSize: 11, color: "var(--pc-ink-muted)", letterSpacing: "0.15em" }}
              >
                {response.length} / {MAX_RESPONSE_LEN}
              </div>
            </div>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value.slice(0, MAX_RESPONSE_LEN))}
              disabled={state !== "input"}
              placeholder={
                chosen
                  ? `I, the ${chosen.toLowerCase()}, do solemnly attest…`
                  : "Choose a mask first. Then speak."
              }
              rows={5}
              className="ink-textarea"
            />
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-3"
              style={{
                background: "rgba(122,30,45,0.08)",
                border: "1px solid var(--pc-oxblood)",
                color: "var(--pc-oxblood-deep)",
                fontFamily: "EB Garamond, serif",
                fontSize: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={() => submitThisRound(false)}
            disabled={state !== "input" || !chosen || response.trim().length === 0}
            className="btn-seal w-full"
          >
            {state === "submitting"
              ? "Filing on the Chain…"
              : state === "submitted"
              ? "✓ Entered into the Record"
              : `Testify — Round ${ROMAN[round.round - 1]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
