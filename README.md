# Persona Court

A multiplayer party game on **GenLayer's Bradbury Testnet**. Players are dropped
into the same wild scenario each round and each picks one of three random
personas to roleplay as. An Intelligent Contract runs an LLM jury (Optimistic
Democracy consensus) that scores every player on **character adherence (60%)**
and **creativity (40%)**. XP is distributed on-chain.

## Trust model

Players authenticate via their own wallet — every entry is signed by the
submitter, not the host:

- `submit_entry(game_id, round_num, persona, response)` writes the entry under
  `gl.message.sender_address`. The host cannot speak for another player.
- `finalize_game(game_id, scenarios_json, current_week)` ignores any
  caller-supplied entries; it reads `submissions[game_id]` straight from
  contract storage.
- `finalized[game_id]` flag prevents double-judging.
- XP is written only inside `finalize_game`, based on the validator-confirmed
  verdict ranking. Host has no XP injection path.

## Stack

- Next.js 16 · React 19 · Tailwind 4
- `genlayer-js` for the on-chain interactions
- `wagmi` + `@rainbow-me/rainbowkit` for wallet UX
- `peerjs` for room-based player coordination
- Python Intelligent Contract via `py-genlayer`

## Local dev

```bash
npm install
cp .env.example .env.local
# Fill in PRIVATE_KEY (used only by the deploy script)
npm run deploy             # → GenLayer Bradbury testnet
# Paste the printed NEXT_PUBLIC_* line into .env.local
npm run dev
```

## Deployment

Set the `NEXT_PUBLIC_BRADBURY_PERSONA_COURT` env var on Netlify (or just hard-code
the address in `src/lib/chain.ts`) and you're done. Never set `PRIVATE_KEY` on
the host — it's deploy-time only.

## Repo

[https://github.com/0x-normal/PersonaCourt](https://github.com/0x-normal/PersonaCourt)
