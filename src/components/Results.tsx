"use client";

import { useAccount } from "wagmi";
import type { JudgingResult } from "@/lib/genlayer";

interface Props {
  result: JudgingResult;
  onDone: () => void;
}

const RANK_LABEL: Record<number, string> = {
  1: "Honored",
  2: "Commended",
  3: "Acknowledged",
};

export default function Results({ result, onDone }: Props) {
  const { address } = useAccount();
  const me = address?.toLowerCase();

  return (
    <div className="page-root min-h-screen px-4 sm:px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="doc-card px-8 sm:px-14 py-12 ink-rise">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="stamp mb-3">The Court Has Ruled</div>
            <div className="rule-fancy mb-4">
              <span style={{ fontFamily: "Cinzel", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
            <h1
              className="display"
              style={{ fontSize: 64, color: "var(--pc-ink)" }}
            >
              Verdict
            </h1>
            <div className="rule-fancy mt-4">
              <span style={{ fontFamily: "Cinzel", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
            <p
              className="prose-court italic mt-4"
              style={{ fontSize: 17, color: "var(--pc-ink-muted)" }}
            >
              Be it known that the Honorable{" "}
              <span
                style={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 14,
                  color: "var(--pc-oxblood)",
                  letterSpacing: "0.1em",
                }}
              >
                {shorten(result.winner)}
              </span>{" "}
              hath prevailed.
            </p>
          </div>

          {/* Wax seal across rule */}
          <div className="flex justify-center mb-10">
            <div className="wax-seal">⚖</div>
          </div>

          {/* Rankings */}
          <div className="space-y-4">
            {result.results.map((p) => {
              const isMe = p.address.toLowerCase() === me;
              const label = RANK_LABEL[p.rank] ?? `Rank ${p.rank}`;
              return (
                <div
                  key={p.address}
                  className="p-5"
                  style={{
                    background: isMe ? "rgba(122,30,45,0.07)" : "rgba(255, 250, 230, 0.5)",
                    border: "1px solid var(--pc-ink)",
                    borderLeft: isMe ? "5px solid var(--pc-oxblood)" : "1px solid var(--pc-ink)",
                  }}
                >
                  <div className="flex items-center gap-5 mb-3">
                    <div
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: "50%",
                        background:
                          p.rank === 1
                            ? "var(--pc-oxblood)"
                            : p.rank === 2
                            ? "var(--pc-brass-deep)"
                            : p.rank === 3
                            ? "var(--pc-forest)"
                            : "var(--pc-ink-soft)",
                        color: "var(--pc-vellum)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Cinzel",
                        boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.25), 0 4px 8px -4px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                        {p.rank}
                      </div>
                      <div style={{ fontSize: 7, letterSpacing: "0.2em", marginTop: 2 }}>
                        RANK
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontFamily: "Cinzel",
                          fontSize: 11,
                          letterSpacing: "0.28em",
                          textTransform: "uppercase",
                          color: "var(--pc-ink-muted)",
                          marginBottom: 4,
                        }}
                      >
                        {label}{isMe ? " · The Accused (You)" : ""}
                      </div>
                      <div
                        style={{
                          fontFamily: "IBM Plex Mono",
                          fontSize: 14,
                          color: "var(--pc-ink)",
                          letterSpacing: "0.06em",
                          marginBottom: 4,
                        }}
                      >
                        {shorten(p.address)}
                      </div>
                      <div
                        className="prose-court"
                        style={{ fontSize: 14, color: "var(--pc-ink-muted)" }}
                      >
                        Adherence <b>{p.character_adherence}</b> · Creativity{" "}
                        <b>{p.creativity}</b>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className="display"
                        style={{ fontSize: 38, lineHeight: 1, color: "var(--pc-ink)" }}
                      >
                        {p.total}
                      </div>
                      <div
                        style={{
                          fontFamily: "IBM Plex Mono",
                          fontSize: 10,
                          color: "var(--pc-ink-muted)",
                          letterSpacing: "0.2em",
                        }}
                      >
                        / 100
                      </div>
                    </div>

                    <div className="text-right" style={{ borderLeft: "1px solid var(--pc-rule)", paddingLeft: 18 }}>
                      <div
                        className="display"
                        style={{ fontSize: 24, color: "var(--pc-oxblood)" }}
                      >
                        +{p.xp_earned}
                      </div>
                      <div
                        style={{
                          fontFamily: "IBM Plex Mono",
                          fontSize: 10,
                          color: "var(--pc-ink-muted)",
                          letterSpacing: "0.2em",
                        }}
                      >
                        XP
                      </div>
                    </div>
                  </div>
                  <div
                    className="prose-court italic"
                    style={{
                      fontSize: 17,
                      paddingLeft: 4,
                      borderTop: "1px dashed var(--pc-rule)",
                      paddingTop: 10,
                    }}
                  >
                    &ldquo;{p.verdict}&rdquo;
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <button onClick={onDone} className="btn-seal">
              Return to the Hall
            </button>
          </div>

          <div className="mt-8 pt-5 border-t flex items-center justify-between" style={{ borderColor: "var(--pc-rule)" }}>
            <span
              style={{
                fontFamily: "IBM Plex Mono",
                color: "var(--pc-ink-muted)",
                letterSpacing: "0.2em",
                fontSize: 10,
              }}
            >
              ENTERED INTO THE RECORD · GENLAYER BRADBURY
            </span>
            <span
              style={{
                fontFamily: "Cinzel",
                color: "var(--pc-ink-muted)",
                letterSpacing: "0.25em",
                fontSize: 10,
              }}
            >
              SO ORDERED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function shorten(addr: string): string {
  if (!addr) return "0x…";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
