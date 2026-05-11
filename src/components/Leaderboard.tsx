"use client";

import { useEffect, useState } from "react";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/genlayer";
import { CHAIN_CHANGE_EVENT } from "@/lib/chain";

interface Props {
  onBack: () => void;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export default function Leaderboard({ onBack }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setEntries(null);
    try {
      const list = await getLeaderboard();
      setEntries(list);
    } catch (e) {
      console.error(e);
      setError("The court record is sealed on this chain. Has the contract been deployed?");
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener(CHAIN_CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHAIN_CHANGE_EVENT, handler);
  }, []);

  return (
    <div className="page-root min-h-screen px-4 sm:px-6 py-6">
      <button onClick={onBack} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 11 }}>
        ← Back to the Hall
      </button>

      <div className="max-w-3xl mx-auto mt-8">
        <div className="doc-card px-8 sm:px-12 py-10 ink-rise">
          <div className="text-center mb-8">
            <div className="stamp mb-3">All-Time Court Records</div>
            <div className="rule-fancy mb-4">
              <span style={{ fontFamily: "Cinzel", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
            <h1 className="display" style={{ fontSize: 56 }}>
              The Register
            </h1>
            <div className="rule-fancy mt-4">
              <span style={{ fontFamily: "Cinzel", fontSize: 11, letterSpacing: "0.4em" }}>
                ✦
              </span>
            </div>
          </div>

          {error && (
            <div
              className="p-5"
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

          {!error && entries === null && (
            <div
              className="text-center py-12 prose-court italic"
              style={{ color: "var(--pc-ink-muted)" }}
            >
              Consulting the archives…
            </div>
          )}

          {entries !== null && entries.length === 0 && (
            <div
              className="text-center py-14"
              style={{ border: "1px dashed var(--pc-rule)" }}
            >
              <div className="display mb-2" style={{ fontSize: 28 }}>
                The Register is Blank
              </div>
              <p className="prose-court italic" style={{ color: "var(--pc-ink-muted)" }}>
                No verdict has yet been entered into the record.
              </p>
            </div>
          )}

          {entries !== null && entries.length > 0 && (
            <div>
              {/* Table header */}
              <div
                className="grid grid-cols-[60px_1fr_120px_100px] gap-3 px-3 py-2 border-b-2"
                style={{ borderColor: "var(--pc-ink)" }}
              >
                <div className="stamp-ink" style={{ fontSize: 10 }}>
                  Rank
                </div>
                <div className="stamp-ink" style={{ fontSize: 10 }}>
                  Litigant
                </div>
                <div className="stamp-ink text-right" style={{ fontSize: 10 }}>
                  XP
                </div>
                <div className="stamp-ink text-right" style={{ fontSize: 10 }}>
                  Trials
                </div>
              </div>

              {entries.map((e, i) => (
                <div
                  key={e.address}
                  className="grid grid-cols-[60px_1fr_120px_100px] gap-3 px-3 py-4 items-center"
                  style={{
                    borderBottom: "1px solid var(--pc-rule)",
                    background: i < 3 ? "rgba(255, 250, 230, 0.4)" : "transparent",
                  }}
                >
                  <div
                    className="display"
                    style={{
                      fontSize: 22,
                      color:
                        i === 0
                          ? "var(--pc-oxblood)"
                          : i === 1
                          ? "var(--pc-brass-deep)"
                          : i === 2
                          ? "var(--pc-forest)"
                          : "var(--pc-ink)",
                    }}
                  >
                    {ROMAN[i] ?? i + 1}
                  </div>
                  <div
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: 13,
                      color: "var(--pc-ink)",
                      letterSpacing: "0.05em",
                      wordBreak: "break-all",
                    }}
                  >
                    {e.address}
                  </div>
                  <div
                    className="display text-right"
                    style={{ fontSize: 22, color: "var(--pc-ink)" }}
                  >
                    {e.xp.toLocaleString()}
                  </div>
                  <div
                    className="text-right"
                    style={{
                      fontFamily: "EB Garamond, serif",
                      fontSize: 18,
                      color: "var(--pc-ink-muted)",
                    }}
                  >
                    {e.games}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
