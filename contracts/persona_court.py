# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

RANK_XP = {1: 500, 2: 300, 3: 150, 4: 50, 5: 50, 6: 50}
MAX_RESPONSE_LEN = 500
MAX_PERSONA_LEN = 80
MAX_SCENARIO_LEN = 300
MAX_ROUNDS = 50
MAX_PLAYERS = 6
MIN_PLAYERS = 2

# Error prefixes so validators can classify failures during consensus.
ERROR_EXPECTED = "[EXPECTED]"   # deterministic business-logic rejection
ERROR_LLM = "[LLM_ERROR]"       # jury/LLM misbehaviour — force rotation


def _safe_address(raw: str) -> Address:
    return Address(raw.lower())


def _norm_addr(raw) -> str:
    """Validate and normalize an address to lowercase hex. Raises on bad input."""
    if not isinstance(raw, str) or len(raw) < 10:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} address must be a hex string")
    return _safe_address(raw).as_hex.lower()


def _validate_game_id(game_id: str) -> None:
    if not isinstance(game_id, str) or len(game_id) < 4 or len(game_id) > 80:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} bad game_id")


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _rank_and_validate(verdict: dict, roster: list) -> list:
    """Validate the jury verdict against the committed roster BEFORE any XP is
    awarded, then return the results annotated with a canonical rank.

    Rejects any jury result that:
      - omits a committed player,
      - duplicates a player,
      - substitutes an address that is not on the committed roster, or
      - ranks players inconsistently with the scores they were given.
    """
    if not isinstance(verdict, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} verdict is not an object")
    results = verdict.get("results")
    if not isinstance(results, list) or len(results) == 0:
        raise gl.vm.UserError(f"{ERROR_LLM} verdict has no results array")

    roster_set = set(roster)
    seen: set = set()
    norm: list = []
    for r in results:
        if not isinstance(r, dict):
            raise gl.vm.UserError(f"{ERROR_LLM} jury result entry is not an object")
        try:
            addr = _norm_addr(r.get("address"))
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury returned an invalid address")
        if addr not in roster_set:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury result includes a non-roster player")
        if addr in seen:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury result duplicates a player")
        seen.add(addr)
        entry = dict(r)
        entry["address"] = addr
        entry["total"] = int(r.get("total", 0))
        norm.append(entry)

    missing = roster_set - seen
    if missing:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} jury result omits {len(missing)} committed player(s)")
    if len(norm) != len(roster_set):
        raise gl.vm.UserError(f"{ERROR_EXPECTED} jury result size does not match roster")

    # Canonical ranking: highest total first, ties broken deterministically.
    canonical = sorted(norm, key=lambda x: (-x["total"], x["address"]))
    canonical_rank = {r["address"]: i + 1 for i, r in enumerate(canonical)}

    # If the jury declared per-player ranks, they must agree with the scores.
    provided = [r for r in norm if r.get("rank") is not None]
    if provided:
        if len(provided) != len(norm):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury ranked only some players")
        rank_values = []
        for r in norm:
            if not _is_int(r["rank"]):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} jury rank is not an integer")
            jr = int(r["rank"])
            if jr != canonical_rank[r["address"]]:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} jury ranking is inconsistent with the scores")
            rank_values.append(jr)
        if sorted(rank_values) != list(range(1, len(norm) + 1)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury ranks are not a 1..N ordering")

    # If the jury declared a winner, it must be one of the top-scoring players.
    winner = verdict.get("winner", "")
    if isinstance(winner, str) and len(winner) > 0:
        try:
            wnorm = _norm_addr(winner)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury winner is invalid")
        if wnorm not in roster_set:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury winner is not a committed player")
        top_total = canonical[0]["total"]
        winner_total = next(r["total"] for r in norm if r["address"] == wnorm)
        if winner_total < top_total:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} jury winner does not match the top score")

    for r in canonical:
        r["rank"] = canonical_rank[r["address"]]
    return canonical


class PersonaCourt(gl.Contract):
    xp:        TreeMap[Address, u256]
    games:     TreeMap[Address, u256]
    last_week: TreeMap[Address, u256]
    submissions: TreeMap[str, str]
    finalized:   TreeMap[str, u256]
    results:     TreeMap[str, str]
    committed:   TreeMap[str, str]

    def __init__(self) -> None:
        pass

    # ── Commit the game up front: host, roster, scenarios, rounds ──────────
    @gl.public.write
    def create_game(self, game_id: str, roster_json: str, scenarios_json: str) -> str:
        _validate_game_id(game_id)
        if self.committed.get(game_id, "") != "":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game already exists")
        if self.finalized.get(game_id, u256(0)) != u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game already finalized")

        host = gl.message.sender_address.as_hex.lower()

        try:
            roster_raw = json.loads(roster_json)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bad roster json")
        if not isinstance(roster_raw, list):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} roster must be a list")

        roster: list = []
        roster_seen: set = set()
        for a in roster_raw:
            addr = _norm_addr(a)
            if addr in roster_seen:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} duplicate player in roster")
            roster_seen.add(addr)
            roster.append(addr)

        if len(roster) < MIN_PLAYERS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} need at least {MIN_PLAYERS} players")
        if len(roster) > MAX_PLAYERS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} at most {MAX_PLAYERS} players")
        if host not in roster_seen:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} host must be part of the roster")

        try:
            scenarios_raw = json.loads(scenarios_json)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bad scenarios json")
        if not isinstance(scenarios_raw, list) or len(scenarios_raw) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} scenarios must be a non-empty list")

        scenarios: list = []
        rounds: list = []
        round_seen: set = set()
        for meta in scenarios_raw:
            if not isinstance(meta, dict):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} scenario must be an object")
            rn = meta.get("round")
            if not _is_int(rn) or rn < 1 or rn > MAX_ROUNDS:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} bad scenario round")
            if rn in round_seen:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} duplicate round in scenarios")
            round_seen.add(rn)
            text = meta.get("scenario")
            if not isinstance(text, str) or len(text) == 0 or len(text) > MAX_SCENARIO_LEN:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} bad scenario text")
            scenarios.append({"round": rn, "scenario": text})
            rounds.append(rn)

        payload = json.dumps({
            "host": host,
            "roster": roster,
            "scenarios": scenarios,
            "rounds": sorted(rounds),
        }, sort_keys=True)
        self.committed[game_id] = payload
        return payload

    @gl.public.write
    def submit_entry(self, game_id: str, round_num: int, persona: str, response: str) -> None:
        _validate_game_id(game_id)
        if not _is_int(round_num) or round_num < 1 or round_num > MAX_ROUNDS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bad round")
        if not isinstance(persona, str) or len(persona) == 0 or len(persona) > MAX_PERSONA_LEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bad persona")
        if not isinstance(response, str) or len(response) == 0 or len(response) > MAX_RESPONSE_LEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} bad response")

        committed_raw = self.committed.get(game_id, "")
        if committed_raw == "":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game not found")
        if self.finalized.get(game_id, u256(0)) != u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game already finalized")

        meta = json.loads(committed_raw)
        roster = meta["roster"]
        rounds = meta["rounds"]

        sender = gl.message.sender_address.as_hex.lower()
        if sender not in roster:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} sender is not a committed player")
        if round_num not in rounds:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} round is not part of this game")

        existing = self.submissions.get(game_id, "")
        entries = json.loads(existing) if existing else []

        replaced = False
        for e in entries:
            if int(e.get("round", 0)) == round_num and e.get("addr", "").lower() == sender:
                e["persona"] = persona
                e["response"] = response
                replaced = True
                break
        if not replaced:
            entries.append({
                "round": round_num,
                "addr": sender,
                "persona": persona,
                "response": response,
            })

        self.submissions[game_id] = json.dumps(entries)

    @gl.public.write
    def finalize_game(self, game_id: str, current_week: int) -> str:
        _validate_game_id(game_id)
        committed_raw = self.committed.get(game_id, "")
        if committed_raw == "":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game not found")
        if self.finalized.get(game_id, u256(0)) != u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} game already finalized")

        meta = json.loads(committed_raw)
        host = meta["host"]
        roster = meta["roster"]                 # committed lowercase hex addresses
        scenarios_meta = meta["scenarios"]      # committed [{round, scenario}]

        sender = gl.message.sender_address.as_hex.lower()
        if sender != host:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the host may finalize this game")

        existing = self.submissions.get(game_id, "")
        entries = json.loads(existing) if existing else []

        by_round: dict = {}
        for e in entries:
            rn = int(e.get("round", 0))
            addr = str(e.get("addr", "")).lower()
            persona = e.get("persona", "")
            response = e.get("response", "")
            if rn < 1 or not addr or not persona or not response:
                continue
            if addr not in roster:
                continue  # ignore anything not tied to the committed roster
            by_round.setdefault(rn, {})[addr] = {"persona": persona, "response": response}

        num_players = len(roster)
        num_rounds = len(scenarios_meta)

        rounds = []
        for m in scenarios_meta:
            rn = int(m["round"])
            round_entries = []
            for addr in roster:
                sub = by_round.get(rn, {}).get(addr)
                if sub:
                    round_entries.append({"address": addr, "persona": sub["persona"], "response": sub["response"]})
                else:
                    round_entries.append({"address": addr, "persona": "(none)", "response": "(no submission filed)"})
            rounds.append({"round": rn, "scenario": str(m["scenario"]), "entries": round_entries})

        rounds_text = ""
        for r in rounds:
            rounds_text += f"\n--- Round {r['round']} | Scenario: {r['scenario']} ---\n"
            for e in r["entries"]:
                rounds_text += f"  [{e['address']}] persona=\"{e['persona']}\" response=\"{e['response']}\"\n"

        roster_text = "\n".join(f"  - {a}" for a in roster)

        prompt = f"""You are an impartial AI judge presiding over Persona Court, a {num_rounds}-round improv-roleplay battle on the GenLayer blockchain.

Each round, every player is assigned the SAME scenario but writes a 1-2 sentence response while staying in a self-chosen WILD PERSONA. Your job is to evaluate each player's OVERALL performance across ALL rounds.

The committed roster for this game is EXACTLY these {num_players} players. You MUST score every one of them and NO ONE else, using these EXACT addresses:
{roster_text}

{rounds_text}

For EACH of the {num_players} players, score their overall performance with TWO metrics on a 0-100 scale:
1. character_adherence (0-100) - How well did they STAY in their chosen persona's voice, mannerisms, and worldview across all rounds? A medieval knight should sound medieval; a sentient toaster should sound mechanical and obsessed with toast.
2. creativity (0-100) - How surprising, fresh, and entertaining were their responses overall? Boring but in-character beats clever but breaking character only slightly.

Final per-player score formula (you compute it):
  total = round(0.6 * character_adherence + 0.4 * creativity)

Rules:
- Judge each player HOLISTICALLY across all rounds
- Be fair but discriminating - avoid clustering everyone at the same score
- You MUST include ALL {num_players} roster players EXACTLY ONCE, using the EXACT full addresses listed above
- Do NOT invent, drop, duplicate, or substitute any player
- The winner is the player with the highest total

Return ONLY valid JSON with this exact schema:
{{"results": [{{"address": "0xFULL_ADDRESS", "character_adherence": 78, "creativity": 65, "total": 73, "verdict": "short witty one-line verdict on their courtroom performance"}}], "winner": "0xWINNER_ADDRESS"}}"""

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise gl.vm.UserError(f"{ERROR_LLM} LLM returned non-dict")
            raw_results = result.get("results")
            if not isinstance(raw_results, list) or len(raw_results) == 0:
                raise gl.vm.UserError(f"{ERROR_LLM} missing results array")
            clean = []
            for r in raw_results:
                if not isinstance(r, dict):
                    raise gl.vm.UserError(f"{ERROR_LLM} result item is not an object")
                adh = max(0, min(100, int(round(float(r.get("character_adherence", 50))))))
                cre = max(0, min(100, int(round(float(r.get("creativity", 50))))))
                item = {
                    "address": str(r.get("address", "")),
                    "character_adherence": adh,
                    "creativity": cre,
                    "total": int(round(0.6 * adh + 0.4 * cre)),
                    "verdict": r.get("verdict") if isinstance(r.get("verdict"), str) and len(r.get("verdict", "")) > 0 else "The court reserves comment.",
                }
                # Preserve any jury-declared rank so the deterministic check can
                # reject inconsistent rankings before XP is awarded.
                if "rank" in r:
                    item["rank"] = r["rank"]
                clean.append(item)
            winner = result.get("winner", "")
            return json.dumps(
                {"results": clean, "winner": winner if isinstance(winner, str) else ""},
                sort_keys=True,
            )

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
            except Exception:
                return False
            if not isinstance(data, dict):
                return False
            results = data.get("results")
            if not isinstance(results, list) or len(results) == 0:
                return False
            for r in results:
                if not isinstance(r, dict):
                    return False
                if not isinstance(r.get("address"), str) or len(r.get("address", "")) < 10:
                    return False
                for key in ("character_adherence", "creativity"):
                    val = r.get(key)
                    if not isinstance(val, (int, float)):
                        return False
                    if val < 0 or val > 100:
                        return False
                if not isinstance(r.get("verdict"), str):
                    return False
            if not isinstance(data.get("winner"), str):
                return False
            return True

        verdict_str = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        verdict = json.loads(verdict_str)

        # Gate: reject omit / duplicate / substitute / inconsistent-rank jury
        # results BEFORE any XP is written to storage.
        ranked = _rank_and_validate(verdict, roster)

        xp_awards = []
        for result in ranked:
            addr = _safe_address(result["address"])
            rank = min(int(result["rank"]), 6)
            xp_earned = RANK_XP.get(rank, 50)

            self.xp[addr]        = self.xp.get(addr, u256(0)) + u256(xp_earned)
            self.games[addr]     = self.games.get(addr, u256(0)) + u256(1)
            self.last_week[addr] = u256(current_week)

            result["xp_earned"] = xp_earned
            xp_awards.append(result)

        self.finalized[game_id] = u256(1)
        final_payload = json.dumps({
            "num_rounds": num_rounds,
            "results": xp_awards,
            "winner": xp_awards[0]["address"],
        })
        self.results[game_id] = final_payload
        return final_payload

    # ── Views ──────────────────────────────────────────────────────────────
    @gl.public.view
    def get_game_info(self, game_id: str) -> str:
        return self.committed.get(game_id, "")

    @gl.public.view
    def is_committed(self, game_id: str) -> bool:
        return self.committed.get(game_id, "") != ""

    @gl.public.view
    def get_game_result(self, game_id: str) -> str:
        return self.results.get(game_id, "")

    @gl.public.view
    def get_submission_count(self, game_id: str) -> int:
        existing = self.submissions.get(game_id, "")
        if not existing:
            return 0
        try:
            return len(json.loads(existing))
        except Exception:
            return 0

    @gl.public.view
    def is_finalized(self, game_id: str) -> bool:
        return self.finalized.get(game_id, u256(0)) != u256(0)

    @gl.public.view
    def get_leaderboard(self) -> str:
        players = [{"address": addr.as_hex, "xp": int(xp), "games": int(self.games.get(addr, u256(0)))}
                   for addr, xp in self.xp.items()]
        players.sort(key=lambda p: p["xp"], reverse=True)
        return json.dumps(players)

    @gl.public.view
    def get_player_xp(self, player: str) -> int:
        return int(self.xp.get(_safe_address(player), u256(0)))

    @gl.public.view
    def get_player_stats(self, player: str) -> str:
        addr = _safe_address(player)
        return json.dumps({"xp": int(self.xp.get(addr, u256(0))), "games": int(self.games.get(addr, u256(0)))})

    @gl.public.view
    def get_last_played_week(self, player: str) -> int:
        return int(self.last_week.get(_safe_address(player), u256(0)))
