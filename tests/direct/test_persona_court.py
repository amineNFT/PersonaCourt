"""Direct-mode tests for the Persona Court intelligent contract.

Focus areas required by review:
  1. The game commits host, roster, scenarios, and rounds up front.
  2. Finalization is constrained to that committed game.
  3. Any jury result that OMITS, DUPLICATES, SUBSTITUTES, or INCONSISTENTLY
     RANKS players is rejected BEFORE any XP is awarded.

Run: pytest tests/direct/ -v
"""

import json

CONTRACT = "contracts/persona_court.py"
LLM_PATTERN = r"Persona Court"
GAME_ID = "pc-test-0001"


# ── helpers ────────────────────────────────────────────────────────────────
def _hex(addr) -> str:
    """Normalize a test address (Address obj or raw bytes) to lowercase hex."""
    if isinstance(addr, str):
        return addr
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    return str(addr)


def _roster_json(*addrs):
    return json.dumps([_hex(a) for a in addrs])


def _scenarios_json(rounds=(1, 2)):
    return json.dumps([{"round": r, "scenario": f"Scenario for round {r}"} for r in rounds])


def _verdict(players, winner="", ranks=None):
    """Build a jury verdict JSON string.

    players: list of (address, character_adherence, creativity)
    winner:  address or "" to omit
    ranks:   optional list of ints (per player) to force explicit ranking
    """
    results = []
    for i, (addr, adh, cre) in enumerate(players):
        item = {
            "address": _hex(addr),
            "character_adherence": adh,
            "creativity": cre,
            "verdict": "A performance for the ages.",
        }
        if ranks is not None:
            item["rank"] = ranks[i]
        results.append(item)
    w = "" if winner == "" else _hex(winner)
    return json.dumps({"results": results, "winner": w})


def _commit(vm, contract, host, *players, rounds=(1, 2)):
    vm.sender = host
    contract.create_game(GAME_ID, _roster_json(*players), _scenarios_json(rounds))


def _submit_all(vm, contract, players, rounds=(1, 2)):
    for p in players:
        vm.sender = p
        for r in rounds:
            contract.submit_entry(GAME_ID, r, "Sir Reginald", f"I object, in round {r}!")


# ── create_game (commit) validation ─────────────────────────────────────────
def test_create_game_commits_host_roster_scenarios_rounds(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    payload = c.create_game(GAME_ID, _roster_json(direct_alice, direct_bob), _scenarios_json((1, 2, 3)))
    meta = json.loads(payload)
    assert meta["host"] == _hex(direct_alice)
    assert set(meta["roster"]) == {_hex(direct_alice), _hex(direct_bob)}
    assert meta["rounds"] == [1, 2, 3]
    assert len(meta["scenarios"]) == 3
    assert c.is_committed(GAME_ID) is True


def test_create_game_rejects_duplicate_game(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    with direct_vm.expect_revert("already exists"):
        c.create_game(GAME_ID, _roster_json(direct_alice, direct_bob), _scenarios_json())


def test_create_game_rejects_duplicate_roster_member(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("duplicate player"):
        c.create_game(GAME_ID, _roster_json(direct_alice, direct_alice), _scenarios_json())


def test_create_game_rejects_too_few_players(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("at least"):
        c.create_game(GAME_ID, _roster_json(direct_alice), _scenarios_json())


def test_create_game_rejects_host_not_in_roster(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_charlie  # host is charlie, not on roster
    with direct_vm.expect_revert("host must be part of the roster"):
        c.create_game(GAME_ID, _roster_json(direct_alice, direct_bob), _scenarios_json())


def test_create_game_rejects_empty_scenarios(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("non-empty list"):
        c.create_game(GAME_ID, _roster_json(direct_alice, direct_bob), json.dumps([]))


# ── submit_entry constrained to committed game ──────────────────────────────
def test_submit_requires_committed_game(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("game not found"):
        c.submit_entry(GAME_ID, 1, "Knight", "hi")


def test_submit_rejects_non_roster_sender(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("not a committed player"):
        c.submit_entry(GAME_ID, 1, "Knight", "hi")


def test_submit_rejects_round_not_in_game(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob, rounds=(1, 2))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("round is not part of this game"):
        c.submit_entry(GAME_ID, 5, "Knight", "hi")


# ── finalize constrained to committed game ──────────────────────────────────
def test_finalize_requires_committed_game(direct_vm, direct_deploy, direct_alice):
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("game not found"):
        c.finalize_game(GAME_ID, 100)


def test_finalize_only_by_host(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_alice))
    direct_vm.sender = direct_bob  # not the host
    with direct_vm.expect_revert("only the host may finalize"):
        c.finalize_game(GAME_ID, 100)


# ── HAPPY PATH ───────────────────────────────────────────────────────────────
def test_finalize_happy_path_awards_xp(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])

    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_alice))
    direct_vm.sender = direct_alice
    payload = c.finalize_game(GAME_ID, 100)

    out = json.loads(payload)
    assert out["winner"] == _hex(direct_alice)
    assert c.is_finalized(GAME_ID) is True
    # rank 1 -> 500 xp, rank 2 -> 300 xp
    assert c.get_player_xp(_hex(direct_alice)) == 500
    assert c.get_player_xp(_hex(direct_bob)) == 300


def test_finalize_valid_explicit_consistent_ranks(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # alice higher total, explicit ranks agree (1 then 2)
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_alice, ranks=[1, 2]))
    direct_vm.sender = direct_alice
    c.finalize_game(GAME_ID, 100)
    assert c.get_player_xp(_hex(direct_alice)) == 500


def test_cannot_finalize_twice(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_alice))
    direct_vm.sender = direct_alice
    c.finalize_game(GAME_ID, 100)
    with direct_vm.expect_revert("already finalized"):
        c.finalize_game(GAME_ID, 100)


# ── ADVERSARIAL JURY RESULTS (the core review requirement) ───────────────────
def test_reject_jury_result_that_omits_a_player(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # bob is committed but omitted from the verdict
    direct_vm.mock_llm(LLM_PATTERN, _verdict([(direct_alice, 90, 80)], winner=direct_alice))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("omits"):
        c.finalize_game(GAME_ID, 100)
    # no XP awarded, game not finalized
    assert c.get_player_xp(_hex(direct_alice)) == 0
    assert c.get_player_xp(_hex(direct_bob)) == 0
    assert c.is_finalized(GAME_ID) is False


def test_reject_jury_result_that_duplicates_a_player(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # alice appears twice, bob missing
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_alice, 70, 60)], winner=direct_alice))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("duplicates"):
        c.finalize_game(GAME_ID, 100)
    assert c.get_player_xp(_hex(direct_alice)) == 0
    assert c.is_finalized(GAME_ID) is False


def test_reject_jury_result_that_substitutes_a_player(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # charlie is NOT on the committed roster
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_charlie, 40, 30)], winner=direct_alice))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("non-roster player"):
        c.finalize_game(GAME_ID, 100)
    assert c.get_player_xp(_hex(direct_alice)) == 0
    assert c.get_player_xp(_hex(direct_charlie)) == 0
    assert c.is_finalized(GAME_ID) is False


def test_reject_jury_result_with_inconsistent_ranks(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # alice has the higher total but is (wrongly) ranked #2
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_alice, ranks=[2, 1]))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("inconsistent"):
        c.finalize_game(GAME_ID, 100)
    assert c.get_player_xp(_hex(direct_alice)) == 0
    assert c.is_finalized(GAME_ID) is False


def test_reject_jury_result_with_inconsistent_winner(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    _commit(direct_vm, c, direct_alice, direct_alice, direct_bob)
    _submit_all(direct_vm, c, [direct_alice, direct_bob])
    # bob is clearly the lower scorer but is declared the winner
    direct_vm.mock_llm(LLM_PATTERN, _verdict(
        [(direct_alice, 90, 80), (direct_bob, 40, 30)], winner=direct_bob))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("winner does not match"):
        c.finalize_game(GAME_ID, 100)
    assert c.get_player_xp(_hex(direct_bob)) == 0
    assert c.is_finalized(GAME_ID) is False
