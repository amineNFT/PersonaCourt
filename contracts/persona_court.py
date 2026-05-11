# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

RANK_XP = {1: 500, 2: 300, 3: 150, 4: 50, 5: 50, 6: 50}
MAX_RESPONSE_LEN = 500
MAX_PERSONA_LEN = 80
MAX_ROUNDS = 50
MAX_PLAYERS = 6


def _safe_address(raw: str) -> Address:
    return Address(raw.lower())


def _validate_game_id(game_id: str) -> None:
    if not isinstance(game_id, str) or len(game_id) < 4 or len(game_id) > 80:
        raise Exception("bad game_id")


class PersonaCourt(gl.Contract):
    xp:        TreeMap[Address, u256]
    games:     TreeMap[Address, u256]
    last_week: TreeMap[Address, u256]
    submissions: TreeMap[str, str]
    finalized:   TreeMap[str, u256]
    results:     TreeMap[str, str]

    def __init__(self) -> None:
        pass

    @gl.public.write
    def submit_entry(self, game_id: str, round_num: int, persona: str, response: str) -> None:
        _validate_game_id(game_id)
        if not isinstance(round_num, int) or round_num < 1 or round_num > MAX_ROUNDS:
            raise Exception("bad round")
        if not isinstance(persona, str) or len(persona) == 0 or len(persona) > MAX_PERSONA_LEN:
            raise Exception("bad persona")
        if not isinstance(response, str) or len(response) == 0 or len(response) > MAX_RESPONSE_LEN:
            raise Exception("bad response")
        if self.finalized.get(game_id, u256(0)) != u256(0):
            raise Exception("game already finalized")

        sender = gl.message.sender_address.as_hex.lower()
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
    def finalize_game(self, game_id: str, scenarios_json: str, current_week: int) -> str:
        _validate_game_id(game_id)
        if self.finalized.get(game_id, u256(0)) != u256(0):
            raise Exception("game already finalized")

        scenarios_meta = json.loads(scenarios_json)
        if not isinstance(scenarios_meta, list) or len(scenarios_meta) == 0:
            raise Exception("empty scenarios")

        existing = self.submissions.get(game_id, "")
        if not existing:
            raise Exception("no entries for this game")
        entries = json.loads(existing)

        by_round: dict = {}
        all_addresses = set()
        for e in entries:
            rn = int(e.get("round", 0))
            addr = e.get("addr", "")
            persona = e.get("persona", "")
            response = e.get("response", "")
            if rn < 1 or not addr or not persona or not response:
                continue
            by_round.setdefault(rn, []).append({
                "address": addr,
                "persona": persona,
                "response": response,
            })
            all_addresses.add(addr)

        if len(all_addresses) < 2:
            raise Exception("Need at least 2 players")
        if len(all_addresses) > MAX_PLAYERS:
            raise Exception(f"Maximum {MAX_PLAYERS} players per game")

        rounds = []
        for meta in scenarios_meta:
            rn = int(meta.get("round", 0))
            rounds.append({
                "round": rn,
                "scenario": str(meta.get("scenario", "")),
                "entries": by_round.get(rn, []),
            })

        num_players = len(all_addresses)
        num_rounds = len(rounds)

        rounds_text = ""
        for r in rounds:
            rounds_text += f"\n--- Round {r['round']} | Scenario: {r['scenario']} ---\n"
            for e in r["entries"]:
                rounds_text += f"  [{e['address']}] persona=\"{e['persona']}\" response=\"{e['response']}\"\n"

        prompt = f"""You are an impartial AI judge presiding over Persona Court, a {num_rounds}-round improv-roleplay battle on the GenLayer blockchain.

Each round, every player is assigned the SAME scenario but writes a 1-2 sentence response while staying in a self-chosen WILD PERSONA. Your job is to evaluate each player's OVERALL performance across ALL rounds.

{rounds_text}

For EACH of the {num_players} players, score their overall performance with TWO metrics on a 0-100 scale:
1. character_adherence (0-100) - How well did they STAY in their chosen persona's voice, mannerisms, and worldview across all rounds? A medieval knight should sound medieval; a sentient toaster should sound mechanical and obsessed with toast.
2. creativity (0-100) - How surprising, fresh, and entertaining were their responses overall? Boring but in-character beats clever but breaking character only slightly.

Final per-player score formula (you compute it):
  total = round(0.6 * character_adherence + 0.4 * creativity)

Rules:
- Judge each player HOLISTICALLY across all rounds
- Be fair but discriminating - avoid clustering everyone at the same score
- You MUST include ALL {num_players} players in the results, using the EXACT full addresses provided above
- Rank players by total score (highest first)

Return ONLY valid JSON with this exact schema:
{{"results": [{{"address": "0xFULL_ADDRESS", "character_adherence": 78, "creativity": 65, "total": 73, "verdict": "short witty one-line verdict on their courtroom performance"}}], "winner": "0xWINNER_ADDRESS"}}"""

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise Exception("LLM returned non-dict")
            results = result.get("results")
            if not isinstance(results, list) or len(results) == 0:
                raise Exception("Missing results array")
            for r in results:
                adh = max(0, min(100, int(round(float(r.get("character_adherence", 50))))))
                r["character_adherence"] = adh
                cre = max(0, min(100, int(round(float(r.get("creativity", 50))))))
                r["creativity"] = cre
                r["total"] = int(round(0.6 * adh + 0.4 * cre))
                if not isinstance(r.get("verdict"), str) or len(r.get("verdict", "")) == 0:
                    r["verdict"] = "The court reserves comment."
            results = sorted(results, key=lambda x: x["total"], reverse=True)
            for i, r in enumerate(results):
                r["rank"] = i + 1
            return json.dumps({"results": results, "winner": results[0].get("address", "")}, sort_keys=True)

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

        xp_awards = []
        for result in verdict["results"]:
            try:
                addr = _safe_address(result["address"])
            except Exception:
                result["xp_earned"] = 50
                xp_awards.append(result)
                continue

            rank = min(result.get("rank", 6), 6)
            xp_earned = RANK_XP.get(rank, 50)

            self.xp[addr]        = self.xp.get(addr, u256(0)) + u256(xp_earned)
            self.games[addr]     = self.games.get(addr, u256(0)) + u256(1)
            self.last_week[addr] = u256(current_week)

            result["xp_earned"] = xp_earned
            xp_awards.append(result)

        self.finalized[game_id] = u256(1)
        final_payload = json.dumps({"num_rounds": num_rounds, "results": xp_awards, "winner": verdict["winner"]})
        self.results[game_id] = final_payload
        return final_payload

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
