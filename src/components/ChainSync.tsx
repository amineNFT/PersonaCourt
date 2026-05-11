"use client";

// Keeps the connected wallet's chain in sync with the app's active GenLayer
// network. If the user picks "Studionet" in the brass plaque but their wallet
// is on a different chain, this triggers a wallet switch (and falls back to
// wallet_addEthereumChain when the chain is unknown to the wallet).

import { useEffect } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import {
  getActiveNetwork,
  CHAIN_CHANGE_EVENT,
  type NetworkId,
} from "@/lib/chain";

// Kept in sync with the chain definitions in src/app/Providers.tsx.
const TARGET_CHAIN_ID: Record<NetworkId, number> = {
  studionet: 61_999,
  testnetBradbury: 4221,
};

export default function ChainSync() {
  const { isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    if (!isConnected) return;

    const sync = async () => {
      const target = TARGET_CHAIN_ID[getActiveNetwork()];
      if (!target || walletChainId === target) return;
      try {
        await switchChainAsync({ chainId: target });
      } catch (e) {
        console.warn("[ChainSync] switch failed:", e);
      }
    };

    sync();

    const handler = () => sync();
    window.addEventListener(CHAIN_CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHAIN_CHANGE_EVENT, handler);
  }, [isConnected, walletChainId, switchChainAsync]);

  return null;
}
