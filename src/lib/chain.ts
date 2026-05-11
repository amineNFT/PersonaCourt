"use client";

// Central GenLayer chain & contract registry for Persona Court.
//
// Networks: GenLayer Studionet (fast, dev) and Bradbury Testnet (public).

import { chains } from "genlayer-js";

export type GameKey = "persona_court";

export type NetworkId = "studionet" | "testnetBradbury";

const STORAGE_KEY = "pc.network";
export const CHAIN_CHANGE_EVENT = "pc:chainchange";

// ── Per-network contract addresses ────────────────────────────────────────────────────────
const CONTRACTS: Record<NetworkId, Record<GameKey, string>> = {
  studionet: {
    persona_court:
      process.env.NEXT_PUBLIC_STUDIONET_PERSONA_COURT || "",
  },
  testnetBradbury: {
    persona_court:
      process.env.NEXT_PUBLIC_BRADBURY_PERSONA_COURT ||
      "0x0AFDfDb00bFf2bE38Ddb1928fF62d3B40A0B0105",
  },
};

export const NETWORK_LABELS: Record<NetworkId, string> = {
  studionet: "Studionet",
  testnetBradbury: "Bradbury Testnet",
};

export const NETWORK_DESCRIPTIONS: Record<NetworkId, string> = {
  studionet: "GenLayer Studionet — fast dev network.",
  testnetBradbury: "GenLayer Bradbury — long-lived public testnet.",
};

const DEFAULT_NETWORK: NetworkId = "studionet";

function readStored(): NetworkId {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "studionet" || v === "testnetBradbury") return v;
  return DEFAULT_NETWORK;
}

export function getActiveNetwork(): NetworkId {
  return readStored();
}

export function setActiveNetwork(id: NetworkId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(CHAIN_CHANGE_EVENT, { detail: id }));
}

export function getActiveChain() {
  return chains[getActiveNetwork()];
}

export function getContract(game: GameKey): `0x${string}` {
  const id = getActiveNetwork();
  const addr = CONTRACTS[id][game];
  if (!addr) {
    throw new Error(
      `Contract for "${game}" is not configured on ${id}. ` +
        `Run \`npm run deploy\` to deploy and fill .env.local, or switch network.`,
    );
  }
  return addr as `0x${string}`;
}

export function isNetworkConfigured(id: NetworkId): boolean {
  return Object.values(CONTRACTS[id]).every((a) => a && a.length > 0);
}

export function listNetworks(): NetworkId[] {
  return ["studionet", "testnetBradbury"];
}
