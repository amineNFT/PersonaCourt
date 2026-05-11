"use client";

// Shared helper to extract a JudgingResult-shaped object from a GenLayer
// transaction receipt.
//
// On Studio (and any modern GenLayer node), the leader's return value lives at
//   receipt.consensus_data.leader_receipt[0].eq_outputs["0"].raw
// as a base64 string with a calldata-encoded payload. We must decode it via
// `genlayer-js`' calldata codec to get back the plain object/string. The older
// fallbacks (regex scan, hex-to-utf8) are kept in case Studio's response
// schema shifts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { abi } from "genlayer-js";

const calldata = abi.calldata;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!clean || clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(
    (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  let clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!clean || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Find every balanced JSON object/array substring inside `text`. Handles
// quoted strings and escapes, so trailing RLP framing (or anything else
// glued onto the JSON) is correctly skipped.
function extractJsonSubstrings(text: string): string[] {
  const out: string[] = [];
  for (let start = 0; start < text.length; start++) {
    const ch = text[start];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (escape) {
          escape = false;
        } else if (c === "\\") {
          escape = true;
        } else if (c === '"') {
          inStr = false;
        }
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          start = i; // skip past this object on the outer loop
          break;
        }
      }
    }
  }
  return out;
}

// Decode bytes to UTF-8 and return all balanced JSON substrings found.
function bytesToJsonCandidates(bytes: Uint8Array): string[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return extractJsonSubstrings(text);
}

function unwrapJson(value: unknown): unknown {
  let cur = value;
  for (let i = 0; i < 8; i++) {
    if (typeof cur !== "string") break;
    try {
      cur = JSON.parse(cur);
    } catch {
      break;
    }
  }
  return cur;
}

// Decode the various encoded payloads GenLayer nodes embed result JSON in.
// Returns every plausible decoded candidate (caller picks the one that
// matches its shape). Handles:
//   • base64  + calldata-encoded   (Studio / studionet `eq_outputs.0.raw`)
//   • hex     + RLP/length prefix  (Bradbury on-chain `eqBlocksOutputs`)
//   • plain   JSON string
function decodeEqRawAll(raw: string): unknown[] {
  if (typeof raw !== "string" || !raw) return [];
  const cands: unknown[] = [];

  const tryBytes = (bytes: Uint8Array | null) => {
    if (!bytes) return;
    try {
      const decoded = calldata.decode(bytes);
      const u = unwrapJson(decoded);
      if (u !== undefined) cands.push(u);
    } catch {
      /* ignore */
    }
    for (const sub of bytesToJsonCandidates(bytes)) {
      try {
        cands.push(JSON.parse(sub));
      } catch {
        /* ignore */
      }
    }
  };

  if (raw.startsWith("0x") || raw.startsWith("0X")) {
    tryBytes(hexToBytes(raw));
  }
  tryBytes(base64ToBytes(raw));

  // Plain-string parse last.
  cands.push(unwrapJson(raw));
  return cands;
}

function isShape<T>(obj: Any, check: (o: Any) => boolean): obj is T {
  return obj && typeof obj === "object" && check(obj);
}

/**
 * Walk every plausible location in a GenLayer receipt looking for a payload
 * that satisfies `isValid`. Returns the first match, or null.
 */
export function extractFromReceipt<T>(
  tx: Any,
  isValid: (obj: Any) => obj is T,
): T | null {
  if (!tx) return null;
  const candidates: unknown[] = [];

  // 1. Modern path: consensus_data.leader_receipt[*].eq_outputs[*].raw
  const lr =
    tx.consensus_data?.leader_receipt ??
    tx.consensusData?.leaderReceipt ??
    tx.leader_receipt ??
    null;
  if (Array.isArray(lr)) {
    for (const r of lr) {
      const eq = r?.eq_outputs ?? r?.eqOutputs;
      if (eq && typeof eq === "object") {
        for (const v of Object.values(eq) as Any[]) {
          if (typeof v === "string") {
            candidates.push(...decodeEqRawAll(v));
          } else if (v && typeof v === "object") {
            if (typeof v.raw === "string")
              candidates.push(...decodeEqRawAll(v.raw));
            if (typeof v.value === "string")
              candidates.push(unwrapJson(v.value));
          }
        }
      }
      // Also check the leader's direct `result` / `readable`.
      if (r?.result) candidates.push(unwrapJson(r.result));
      if (r?.readable) candidates.push(unwrapJson(r.readable));
    }
  }

  // 2. Older / simplified-receipt fields.
  if (tx.readable) candidates.push(unwrapJson(tx.readable));
  if (tx.calldata) {
    candidates.push(unwrapJson(tx.calldata));
    if (typeof tx.calldata === "string")
      candidates.push(unwrapJson(hexToUtf8(tx.calldata)));
  }
  const eqOut = tx._eqBlocksOutputs ?? tx.eqBlocksOutputs ?? [];
  if (Array.isArray(eqOut)) {
    for (const block of eqOut) {
      const cd = block?.calldata ?? block?.data ?? block?.result;
      if (cd) {
        candidates.push(unwrapJson(cd));
        if (typeof cd === "string") candidates.push(unwrapJson(hexToUtf8(cd)));
      }
    }
  }
  if (tx.result) candidates.push(unwrapJson(tx.result));
  if (tx.data) candidates.push(unwrapJson(tx.data));

  for (const c of candidates) {
    if (isShape<T>(c, isValid)) return c;
  }

  // 3. Recursive walk: try every string node (might be base64+calldata or
  // plain JSON), and every `.raw` field, regardless of where it lives in the
  // tree. This is what catches schemas we haven't enumerated above.
  const seen = new WeakSet<object>();
  const walk = (node: Any): T | null => {
    if (node == null) return null;
    if (typeof node === "string") {
      // Try every decoder (hex+RLP, base64+calldata, plain JSON) and check
      // each candidate against the caller's shape predicate.
      for (const cand of decodeEqRawAll(node)) {
        if (isShape<T>(cand, isValid)) return cand;
      }
      return null;
    }
    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) {
        const r = walk(v);
        if (r) return r;
      }
      return null;
    }
    for (const v of Object.values(node)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  };
  const walked = walk(tx);
  if (walked) return walked;

  // 4. Last-resort regex scan over a stringified receipt — useful when the
  // payload is leaked verbatim somewhere we didn't expect.
  try {
    const str = JSON.stringify(tx, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const matches = str.match(/\{[^{}]*"results"[\s\S]{0,4000}?\}/g);
    if (matches) {
      for (const m of matches) {
        const u = unwrapJson(m);
        if (isShape<T>(u, isValid)) return u;
      }
    }
  } catch {
    /* ignore */
  }

  // Nothing matched — dump enough of the structure so we can extend the
  // extractor for whatever shape the node returned. Trims big strings.
  try {
    const safe = JSON.stringify(
      tx,
      (_k, v) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "string" && v.length > 400)
          return v.slice(0, 400) + `…(+${v.length - 400} chars)`;
        return v;
      },
      2,
    );
    console.warn("[extract] FAILED to find a valid result. Receipt dump:\n" + safe);
  } catch (e) {
    console.warn("[extract] FAILED and could not stringify receipt:", e);
  }
  return null;
}

/**
 * Try to reach the GenLayer-native receipt that contains
 * `consensus_data.leader_receipt`. `client.getTransaction` returns a richer
 * object than `waitForTransactionReceipt` on some Studio versions.
 */
export async function fetchFullReceipt(
  client: Any,
  hash: string,
): Promise<Any | null> {
  try {
    const tx = await client.getTransaction({ hash });
    if (tx) return tx;
  } catch (e) {
    console.warn("[extract] getTransaction failed:", e);
  }
  return null;
}
