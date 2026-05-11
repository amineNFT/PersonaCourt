import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./Providers";

export const metadata: Metadata = {
  title: "Persona Court — AI-Judged Roleplay Battles on GenLayer",
  description:
    "Multiplayer party game where each player is handed a wild scenario and a chosen persona, and an on-chain AI judges character adherence + creativity via GenLayer's Optimistic Democracy consensus.",
  openGraph: {
    title: "Persona Court — AI-Judged Roleplay Battles on GenLayer",
    description:
      "Stay in character or perish. On-chain AI verdicts, earned XP, and a rolling leaderboard.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
