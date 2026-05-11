"use client";

import * as React from "react";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

export const genlayerBradbury = {
  id: 4221,
  name: "GenLayer Bradbury",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://zksync-os-testnet-genlayer.zksync.dev"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer-bradbury.genlayer.com" },
  },
} as const;

const config = getDefaultConfig({
  appName: "Persona Court",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID",
  chains: [genlayerBradbury],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#c084fc",
            accentColorForeground: "#0b0516",
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
