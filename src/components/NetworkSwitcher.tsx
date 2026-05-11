"use client";

import { useEffect, useState } from "react";
import {
  getActiveNetwork,
  setActiveNetwork,
  isNetworkConfigured,
  listNetworks,
  NETWORK_LABELS,
  CHAIN_CHANGE_EVENT,
  type NetworkId,
} from "@/lib/chain";

export default function NetworkSwitcher() {
  const [active, setActive] = useState<NetworkId>("studionet");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActive(getActiveNetwork());
    const handler = () => setActive(getActiveNetwork());
    window.addEventListener(CHAIN_CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHAIN_CHANGE_EVENT, handler);
  }, []);

  const ok = isNetworkConfigured(active);
  const networks = listNetworks();

  const choose = (id: NetworkId) => {
    setActiveNetwork(id);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
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
          cursor: "pointer",
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
        <span style={{ marginLeft: 4, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--pc-vellum)",
            border: "1px solid var(--pc-ink)",
            boxShadow: "0 4px 12px rgba(50,30,10,0.25)",
            zIndex: 50,
            minWidth: 200,
          }}
        >
          {networks.map((id) => {
            const configured = isNetworkConfigured(id);
            const isActive = id === active;
            return (
              <button
                key={id}
                onClick={() => choose(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  background: isActive ? "rgba(122,30,45,0.08)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(50,30,10,0.15)",
                  fontFamily: "Cinzel, serif",
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--pc-ink)",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: configured ? "var(--pc-forest)" : "var(--pc-oxblood)",
                  }}
                />
                {NETWORK_LABELS[id]}
                {!configured && (
                  <span style={{ marginLeft: "auto", opacity: 0.55, fontSize: 9 }}>
                    not configured
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
