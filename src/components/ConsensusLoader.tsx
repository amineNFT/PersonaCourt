"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Recording the filing on-chain…",
  "Convening the LLM jury…",
  "Weighing character against creativity…",
  "Drafting the verdict…",
  "Optimistic Democracy reaching consensus…",
  "Sealing the verdict into the record…",
];

export default function ConsensusLoader({ label }: { label?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 4200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page-root min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="doc-card max-w-xl w-full px-10 py-12 text-center ink-rise">
        <div className="stamp mb-6">
          {label ?? "The Court Deliberates"}
        </div>

        {/* Scales of Justice — SVG */}
        <div className="flex justify-center mb-8">
          <svg
            viewBox="0 0 120 120"
            width="120"
            height="120"
            className="scale-tilt"
            fill="none"
            stroke="var(--pc-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* center pillar */}
            <line x1="60" y1="20" x2="60" y2="100" />
            {/* base */}
            <line x1="40" y1="100" x2="80" y2="100" />
            <line x1="35" y1="105" x2="85" y2="105" strokeWidth="3" />
            {/* crossbar */}
            <line x1="22" y1="35" x2="98" y2="35" />
            {/* hanging strings */}
            <line x1="30" y1="35" x2="30" y2="55" />
            <line x1="90" y1="35" x2="90" y2="55" />
            {/* left pan */}
            <path d="M 18 55 Q 30 72 42 55 Z" fill="rgba(122,30,45,0.18)" />
            {/* right pan */}
            <path d="M 78 55 Q 90 72 102 55 Z" fill="rgba(122,30,45,0.18)" />
            {/* finial */}
            <circle cx="60" cy="18" r="3" fill="var(--pc-oxblood)" stroke="none" />
          </svg>
        </div>

        <div
          className="display mb-3"
          style={{ fontSize: 22, lineHeight: 1.3 }}
        >
          {STEPS[step]}
        </div>
        <div
          className="font-mono"
          style={{
            color: "var(--pc-ink-muted)",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          Phase {step + 1} of {STEPS.length} · 30–90 seconds
        </div>

        <div className="flex justify-center gap-1.5 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                background: i <= step ? "var(--pc-oxblood)" : "var(--pc-rule)",
                border: "1px solid var(--pc-ink)",
                transform: "rotate(45deg)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
