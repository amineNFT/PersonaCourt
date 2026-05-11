"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import NetworkSwitcher from "./NetworkSwitcher";

interface Props {
  onEnterLobby: () => void;
  onOpenLeaderboard: () => void;
}

const FILING_YEAR = new Date().getFullYear();

export default function MainMenu({ onEnterLobby, onOpenLeaderboard }: Props) {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="page-root min-h-screen px-4 sm:px-6 py-6">
      {/* Top utility row */}
      <div className="flex items-center justify-between mb-10">
        <NetworkSwitcher />
        {mounted && <ConnectButton chainStatus="none" showBalance={false} />}
      </div>

      {/* Court document */}
      <div className="max-w-4xl mx-auto">
        <div className="doc-card px-8 sm:px-14 py-12 sm:py-16 ink-rise">
          {/* Letterhead */}
          <div className="text-center mb-10">
            <div className="stamp-ink mb-4">
              In the Matter of · Filing No. {FILING_YEAR}-PC
            </div>
            <div className="rule-fancy mb-6">
              <span style={{ fontFamily: "Cinzel", letterSpacing: "0.4em", fontSize: 11 }}>
                ✦
              </span>
            </div>
            <h1
              className="display text-[44px] sm:text-[72px] leading-none mb-2"
              style={{ color: "var(--pc-ink)" }}
            >
              Persona Court
            </h1>
            <div
              className="font-mono uppercase tracking-[0.5em]"
              style={{ color: "var(--pc-brass-deep)", fontSize: 11, marginTop: 8 }}
            >
              An Honorable Tribunal of Improvisation
            </div>
            <div className="rule-fancy mt-6">
              <span style={{ fontFamily: "Cinzel", letterSpacing: "0.4em", fontSize: 11 }}>
                ✦
              </span>
            </div>
          </div>

          {/* Preamble */}
          <p
            className="prose-court text-center max-w-2xl mx-auto mb-12"
            style={{ fontSize: 19 }}
          >
            <em>Whereas</em> a scenario shall be put before you, and{" "}
            <em>whereas</em> you must answer in the voice of a persona of your
            choosing — let the record show that an on-chain tribunal of AI
            validators shall weigh your character and creativity, and render
            verdict accordingly.
          </p>

          {/* Articles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mb-12 border-y" style={{ borderColor: "var(--pc-ink)" }}>
            {[
              {
                n: "I",
                t: "Receive the Charge",
                s: "Three personas drawn from the bench. Choose your mask for each round.",
              },
              {
                n: "II",
                t: "Render Testimony",
                s: "Two sentences. One hundred and twenty seconds. Stay in character or fall.",
              },
              {
                n: "III",
                t: "Hear the Verdict",
                s: "LLM jurors score adherence and creativity. The chain remembers.",
              },
            ].map((a, i) => (
              <div
                key={a.n}
                className="px-6 py-8 text-center"
                style={{
                  borderRight:
                    i < 2
                      ? "1px solid var(--pc-ink)"
                      : "none",
                }}
              >
                <div
                  className="display mb-3"
                  style={{ fontSize: 36, color: "var(--pc-oxblood)" }}
                >
                  {a.n}
                </div>
                <div
                  className="stamp-ink mb-3"
                  style={{ fontSize: 10, letterSpacing: "0.28em" }}
                >
                  Article {a.n}
                </div>
                <div
                  style={{
                    fontFamily: "Cinzel",
                    fontWeight: 700,
                    fontSize: 15,
                    marginBottom: 8,
                    letterSpacing: "0.05em",
                  }}
                >
                  {a.t}
                </div>
                <p className="prose-court" style={{ fontSize: 16, lineHeight: 1.5 }}>
                  {a.s}
                </p>
              </div>
            ))}
          </div>

          {/* Action row */}
          {isConnected ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={onEnterLobby} className="btn-seal">
                Approach the Bench
              </button>
              <button onClick={onOpenLeaderboard} className="btn-ghost">
                Court Records
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div
                className="stamp-ink"
                style={{ fontSize: 12, letterSpacing: "0.28em" }}
              >
                Identify Yourself to the Court
              </div>
              {mounted && <ConnectButton chainStatus="none" showBalance={false} />}
            </div>
          )}

          {/* Footer / signatures line */}
          <div className="mt-12 pt-6 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--pc-rule)" }}>
            <span
              style={{
                fontFamily: "IBM Plex Mono",
                color: "var(--pc-ink-muted)",
                letterSpacing: "0.2em",
              }}
            >
              SEAL · GENLAYER BRADBURY
            </span>
            <span
              style={{
                fontFamily: "IBM Plex Mono",
                color: "var(--pc-ink-muted)",
                letterSpacing: "0.2em",
              }}
            >
              OPTIMISTIC DEMOCRACY CONSENSUS
            </span>
          </div>
        </div>

        {/* Wax seal floating on the corner */}
        <div className="flex justify-center -mt-10 mb-12">
          <div className="wax-seal">⚖</div>
        </div>
      </div>
    </div>
  );
}
