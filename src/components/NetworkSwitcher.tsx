"use client";

import { useEffect, useState } from "react";
import {
  getActiveNetwork,
  isNetworkConfigured,
  NETWORK_LABELS,
  CHAIN_CHANGE_EVENT,
  type NetworkId,
} from "@/lib/chain";

export default function NetworkSwitcher() {
  const [active, setActive] = useState<NetworkId>("testnetBradbury");

  useEffect(() => {
    setActive(getActiveNetwork());
    const handler = () => setActive(getActiveNetwork());
    window.addEventListener(CHAIN_CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHAIN_CHANGE_EVENT, handler);
  }, []);

  const ok = isNetworkConfigured(active);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: "var(--pc-vellum)",
        border: "1px solid var(--pc-ink)",
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.1), 0 2px 0 rgba(50,30,10,0.15)",
        fontFamily: "Cinzel, serif",
        fontSize: 10,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--pc-ink)",
        fontWeight: 700,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: ok ? "var(--pc-forest)" : "var(--pc-oxblood)",
          boxShadow: ok
            ? "0 0 0 2px rgba(47,77,54,0.2)"
            : "0 0 0 2px rgba(122,30,45,0.25)",
        }}
      />
      Seal: {NETWORK_LABELS[active]}
    </div>
  );
}
