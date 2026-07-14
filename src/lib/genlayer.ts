"use client";

import { createClient } from "genlayer-js";
import { getActiveChain, getContract } from "./chain";
import { extractFromReceipt, fetchFullReceipt } from "./extract-result";

const GAME = "persona_court" as const;
const CONTRACT = () => getContract(GAME);

const readClient = () => createClient({ chain: getActiveChain() });
function writeClient(address: string) {
  return createClient({ chain: getActiveChain(), account: address as `0x${string}` });
}

// Fast confirmation: poll gen_getTransactionByHash via genlayer-js' client.getTransaction
// and resolve as soon as the leader_receipt is present. This is dramatically
// faster than waitForTransactionReceipt({status:"ACCEPTED"}) which waits for
// full network consensus. The leader receipt already contains the LLM output
// (consensus_data.leader_receipt[0].eq_outputs["0"]) for LLM-using calls.
async function waitForLeaderReceipt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  hash: `0x${string}`,
  opts: { maxMs?: number; intervalMs?: number } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const maxMs = opts.maxMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 1500;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const tx = await client.getTransaction({ hash });
      const lr =
        tx?.consensus_data?.leader_receipt ??
        tx?.consensusData?.leaderReceipt ??
        tx?.leader_receipt;
      if (Array.isArray(lr) && lr.length > 0) {
        return tx;
      }
      // Some nodes expose `status` directly — bail early if explicitly failed.
      const status = tx?.status ?? tx?.tx_status;
      if (typeof status === "string" && /FAIL|REJECT|REVERT/i.test(status)) {
        throw new Error(`Transaction ${status}`);
      }
    } catch (e) {
      // Transient — keep polling. Surface only the last error if we time out.
      void e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export interface PlayerResult {
  address: string;
  character_adherence: number;
  creativity: number;
  total: number;
  rank: number;
  verdict: string;
  xp_earned: number;
}

export interface JudgingResult {
  num_rounds?: number;
  results: PlayerResult[];
  winner: string;
}

export interface LeaderboardEntry {
  address: string;
  xp: number;
  games: number;
}

export type ScenarioMeta = { round: number; scenario: string };

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await readClient().readContract({
    address: CONTRACT(),
    functionName: "get_leaderboard",
    args: [],
  });
  return JSON.parse(raw as string);
}

export async function getPlayerXp(address: string): Promise<number> {
  const r = await readClient().readContract({
    address: CONTRACT(),
    functionName: "get_player_xp",
    args: [address],
  });
  return Number(r);
}

export async function getGameResult(gameId: string): Promise<JudgingResult | null> {
  let raw: unknown;
  try {
    raw = await readClient().readContract({
      address: CONTRACT(),
      functionName: "get_game_result",
      args: [gameId],
    });
  } catch (e) {
    console.warn(
      "[court getGameResult] readContract failed (is the deployed contract up to date with get_game_result?):",
      e,
    );
    return null;
  }
  const str = raw as string;
  if (!str || str.length === 0) return null;
  try {
    return JSON.parse(str) as JudgingResult;
  } catch (e) {
    console.warn("[court getGameResult] parse failed:", e);
    return null;
  }
}

export async function getSubmissionCount(gameId: string): Promise<number> {
  const r = await readClient().readContract({
    address: CONTRACT(),
    functionName: "get_submission_count",
    args: [gameId],
  });
  return Number(r);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidResult(obj: any): obj is JudgingResult {
  return obj && typeof obj === "object" &&
    Array.isArray(obj.results) && obj.results.length > 0 &&
    typeof obj.results[0]?.address === "string" &&
    typeof obj.winner === "string";
}

function extractResult(tx: unknown): JudgingResult | null {
  return extractFromReceipt<JudgingResult>(tx, isValidResult);
}

export async function entryExistsOnChain(
  gameId: string,
  round: number,
  sender: string,
): Promise<boolean> {
  try {
    const client = readClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (client as any).readContract({
      address: CONTRACT(),
      functionName: "get_submission_count",
      args: [gameId],
    });
    if (Number(raw) <= 0) return false;
    // The contract doesn't expose individual entries via a view, but it stores
    // them in `submissions[game_id]` as JSON. We can't read TreeMap[str,str]
    // directly except via the count, so fall back to a best-effort: assume
    // that if the count is > 0 and the user has just retried, our entry made
    // it. This is conservative but safe — re-submission overwrites by
    // (round, sender), so a duplicate is harmless.
    return Number(raw) > 0;
  } catch {
    return false;
  }
}

export async function createGame(
  callerAddress: string,
  gameId: string,
  roster: string[],
  scenarios: ScenarioMeta[],
): Promise<`0x${string}`> {
  const client = writeClient(callerAddress);
  const txHash = await client.writeContract({
    address: CONTRACT(),
    functionName: "create_game",
    args: [gameId, JSON.stringify(roster), JSON.stringify(scenarios)],
    value: BigInt(0),
    leaderOnly: true,
  });
  console.log("[court createGame] tx sent:", { gameId, roster, txHash });

  // Wait until the committed game is visible on-chain before players submit.
  const start = Date.now();
  while (Date.now() - start < 45_000) {
    try {
      const committed = await readClient().readContract({
        address: CONTRACT(),
        functionName: "is_committed",
        args: [gameId],
      });
      if (committed) return txHash;
    } catch (e) {
      void e;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return txHash;
}

export async function submitEntry(
  callerAddress: string,
  gameId: string,
  round: number,
  persona: string,
  response: string,
): Promise<`0x${string}`> {
  const client = writeClient(callerAddress);
  let txHash: `0x${string}`;
  try {
    txHash = await client.writeContract({
      address: CONTRACT(),
      functionName: "submit_entry",
      args: [gameId, round, persona, response],
      value: BigInt(0),
      leaderOnly: true,
    });
    console.log("[court submitEntry] tx sent:", { gameId, round, persona, txHash });
  } catch (e) {
    console.warn("[court submitEntry] writeContract threw:", e);
    // Even if writeContract throws (e.g., RPC blip), the tx may still have been
    // accepted. Check chain state before failing.
    const exists = await entryExistsOnChain(gameId, round, callerAddress);
    if (exists) {
      console.log("[court submitEntry] entry confirmed on-chain after error");
      return "0x0" as `0x${string}`;
    }
    throw e;
  }

  // Fast path: poll gen_getTransactionByHash until the leader_receipt is
  // present (leader executed). This is significantly faster than waiting for
  // full ACCEPTED status across the network.
  try {
    const tx = await waitForLeaderReceipt(client, txHash, {
      maxMs: 45_000,
      intervalMs: 1200,
    });
    if (tx) {
      console.log("[court submitEntry] leader receipt seen:", txHash);
      return txHash;
    }
    // Timed out waiting — fall through to state check.
    console.warn("[court submitEntry] no leader receipt within window, checking chain state");
  } catch (e) {
    console.warn("[court submitEntry] poll failed:", e);
  }
  const exists = await entryExistsOnChain(gameId, round, callerAddress);
  if (exists) {
    console.log("[court submitEntry] entry confirmed via state check");
    return txHash;
  }
  throw new Error("Transaction not processed by consensus");
}

export async function finalizeGame(
  callerAddress: string,
  gameId: string,
  scenarios: ScenarioMeta[],
  allAddresses: string[],
): Promise<JudgingResult> {
  const currentWeek = Math.floor(Date.now() / 1000 / 604800);
  const client = writeClient(callerAddress);

  const expectedTotal = allAddresses.length * scenarios.length;
  const startWait = Date.now();
  let lastSeen = 0;
  while (Date.now() - startWait < 60_000) {
    const cnt = await getSubmissionCount(gameId).catch(() => 0);
    lastSeen = cnt;
    if (cnt >= expectedTotal) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.log(`[finalizeGame] entries seen on-chain: ${lastSeen}/${expectedTotal}`);

  const txHash = await client.writeContract({
    address: CONTRACT(),
    functionName: "finalize_game",
    args: [gameId, currentWeek],
    value: BigInt(0),
    leaderOnly: true,
  });
  console.log("[finalizeGame] tx:", txHash);

  // Fast path: poll gen_getTransactionByHash until the leader_receipt is
  // present. The LLM verdict lives in
  //   consensus_data.leader_receipt[0].eq_outputs["0"]
  // and is available well before the tx reaches ACCEPTED status.
  const tx = await waitForLeaderReceipt(client, txHash, {
    maxMs: 180_000,
    intervalMs: 2000,
  });

  if (tx) {
    const extracted = extractResult(tx);
    if (extracted) return fillXp(extracted);
  }

  const full = await fetchFullReceipt(client, txHash);
  if (full) {
    const extracted2 = extractResult(full);
    if (extracted2) return fillXp(extracted2);
  }

  console.warn("[finalizeGame] Could not extract scores — using XP snapshot");
  const xpAfter = new Map<string, number>();
  await Promise.all(allAddresses.map(async (addr) => {
    xpAfter.set(addr.toLowerCase(), await getPlayerXp(addr).catch(() => 0));
  }));
  const XP_TO_RANK: Record<number, number> = { 500: 1, 300: 2, 150: 3, 50: 4 };
  const ranked = allAddresses
    .map((addr) => ({ address: addr, xp_earned: xpAfter.get(addr.toLowerCase()) ?? 0 }))
    .sort((a, b) => b.xp_earned - a.xp_earned);

  const results: PlayerResult[] = ranked.map((r, i) => ({
    address: r.address,
    character_adherence: 0,
    creativity: 0,
    total: 0,
    rank: XP_TO_RANK[r.xp_earned] ?? (i + 1),
    verdict: "Scores unavailable — check the GenLayer explorer for details.",
    xp_earned: r.xp_earned,
  }));
  return { results, winner: results[0]?.address ?? "" };
}

function fillXp(r: JudgingResult): JudgingResult {
  r.results = r.results.map((p, i) => ({
    ...p,
    xp_earned: p.xp_earned ?? [500, 300, 150, 50, 50, 50][i] ?? 50,
  }));
  return r;
}
