"""Direct-mode coverage for the deterministic court lifecycle and consensus path."""

import json

from tests.direct.conftest import deadline_from, to_hex


MIN_BOND = 10**16


def _register_pair(direct_vm, contract, direct_alice, direct_bob):
    direct_vm.deal(direct_alice, 10**18)
    direct_vm.deal(direct_bob, 10**18)
    direct_vm.sender = direct_alice
    contract.register_agent(
        "agent-alpha",
        "Alpha Worker",
        "https://alpha.example/agent.json",
        "A general-purpose research and API delivery agent.",
    )
    direct_vm.sender = direct_bob
    contract.register_agent(
        "agent-beta",
        "Beta Builder",
        "https://beta.example/agent.json",
        "An autonomous API implementation and delivery agent.",
    )


def _open_claim(direct_vm, contract, direct_alice, direct_bob):
    _register_pair(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.warp("2024-06-01T12:00:00Z")
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_BOND
    return contract.open_reputation_claim(
        "agent-beta",
        "API delivery failed",
        "Deliver a working JSON API endpoint for the agreed resource.",
        "The promised endpoint returned an error and did not expose the agreed resource.",
        "The endpoint responds with HTTP 200 and the documented JSON fields.",
        deadline_from(direct_vm),
    )


def _submit_two_sources(direct_vm, contract, claim_id):
    contract.submit_evidence(
        claim_id,
        [
            "https://evidence.example/agreement.txt",
            "https://evidence.example/api-result.json",
        ],
        ["sha256:agreement", "sha256:api-result"],
    )


def test_register_agent_and_default_score(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/agent_trust_court.py")
    direct_vm.sender = direct_alice
    contract.register_agent(
        "agent-alpha",
        "Alpha Worker",
        "https://alpha.example/agent.json",
        "A general-purpose research agent.",
    )

    address = to_hex(direct_alice)
    assert contract.get_agent_score(address) == 500
    agent = contract.get_agent(address)
    assert agent["agent_id"] == "agent-alpha"
    assert agent["claims_opened"] == 0

    with direct_vm.expect_revert("already has an agent"):
        contract.register_agent(
            "agent-other",
            "Other Worker",
            "https://other.example/agent.json",
            "Another agent profile.",
        )


def test_open_claim_requires_bond_and_records_open_state(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    _register_pair(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.warp("2024-06-01T12:00:00Z")
    direct_vm.sender = direct_alice
    direct_vm.value = 0

    with direct_vm.expect_revert("below the 0.01 GEN minimum"):
        contract.open_reputation_claim(
            "agent-beta",
            "API delivery failed",
            "Deliver a working JSON API endpoint for the agreed resource.",
            "The endpoint failed the agreed delivery.",
            "The endpoint returns HTTP 200 with documented fields.",
            deadline_from(direct_vm),
        )

    direct_vm.value = MIN_BOND
    claim_id = contract.open_reputation_claim(
        "agent-beta",
        "API delivery failed",
        "Deliver a working JSON API endpoint for the agreed resource.",
        "The endpoint failed the agreed delivery.",
        "The endpoint returns HTTP 200 with documented fields.",
        deadline_from(direct_vm),
    )
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "OPEN"
    assert claim["verdict"] == ""
    assert claim["claim_bond"] == MIN_BOND


def test_evidence_and_challenge_permissions(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    claim_id = _open_claim(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the claimant"):
        contract.submit_evidence(
            claim_id,
            ["https://evidence.example/a", "https://evidence.example/b"],
            ["sha256:a", "sha256:b"],
        )

    direct_vm.sender = direct_alice
    _submit_two_sources(direct_vm, contract, claim_id)

    direct_vm.sender = direct_bob
    direct_vm.value = MIN_BOND
    contract.challenge_claim(
        claim_id,
        "The endpoint was deployed and the accusation omits the documented path.",
        ["https://evidence.example/deployment.txt"],
        ["sha256:deployment"],
    )
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "CHALLENGED"
    assert claim["respondent_evidence_urls"] == [
        "https://evidence.example/deployment.txt"
    ]


def test_verified_adjudication_updates_scores_and_payouts(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    claim_id = _open_claim(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    _submit_two_sources(direct_vm, contract, claim_id)

    direct_vm.warp("2024-06-01T14:00:00Z")
    direct_vm.mock_web(
        r".*evidence\.example/.*",
        {"status": 200, "body": "The agreed API returned HTTP 500 and failed the acceptance test."},
    )
    direct_vm.mock_llm(
        r".*AgentTrust Court.*",
        json.dumps(
            {
                "verdict": "VERIFIED",
                "confidence": 92,
                "reason": "Both sources show the endpoint missed the agreed acceptance criteria.",
            }
        ),
    )

    direct_vm.sender = direct_bob
    contract.adjudicate_claim(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "RESOLVED"
    assert claim["verdict"] == "VERIFIED"
    assert claim["confidence"] == 92
    assert claim["claimant_payout"] == MIN_BOND
    assert claim["respondent_payout"] == 0

    assert contract.get_agent_score(to_hex(direct_alice)) == 502
    assert contract.get_agent_score(to_hex(direct_bob)) == 485

    with direct_vm.expect_revert("already been adjudicated"):
        contract.adjudicate_claim(claim_id)


def test_unproven_claim_returns_each_party_own_bond(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    claim_id = _open_claim(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    _submit_two_sources(direct_vm, contract, claim_id)
    direct_vm.warp("2024-06-01T14:00:00Z")
    direct_vm.mock_web(
        r".*evidence\.example/.*",
        {"status": 200, "body": "One source is unavailable and the other is inconclusive."},
    )
    direct_vm.mock_llm(
        r".*AgentTrust Court.*",
        json.dumps(
            {
                "verdict": "UNPROVEN",
                "confidence": 78,
                "reason": "The evidence is incomplete and does not establish failure.",
            }
        ),
    )
    contract.adjudicate_claim(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["verdict"] == "UNPROVEN"
    assert claim["claimant_payout"] == MIN_BOND
    assert claim["respondent_payout"] == 0
    assert contract.get_agent_score(to_hex(direct_alice)) == 500
    assert contract.get_agent_score(to_hex(direct_bob)) == 500


def test_false_claim_penalizes_bad_reporter(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    claim_id = _open_claim(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    _submit_two_sources(direct_vm, contract, claim_id)
    direct_vm.warp("2024-06-01T14:00:00Z")
    direct_vm.mock_web(
        r".*evidence\.example/.*",
        {"status": 200, "body": "HTTP 200 response with all documented JSON fields present."},
    )
    direct_vm.mock_llm(
        r".*AgentTrust Court.*",
        json.dumps(
            {
                "verdict": "FALSE",
                "confidence": 88,
                "reason": "The evidence shows the endpoint satisfied the stated acceptance criteria.",
            }
        ),
    )
    contract.adjudicate_claim(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["verdict"] == "FALSE"
    assert claim["claimant_delta"] == -8
    assert claim["respondent_delta"] == 4
    assert claim["claimant_payout"] == 0
    assert claim["respondent_payout"] == MIN_BOND
    assert contract.get_agent_score(to_hex(direct_alice)) == 492
    assert contract.get_agent_score(to_hex(direct_bob)) == 504


def test_deadline_and_evidence_validation(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/agent_trust_court.py")
    claim_id = _open_claim(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("between 2 and 3"):
        contract.submit_evidence(
            claim_id,
            ["https://evidence.example/only-one"],
            ["sha256:one"],
        )
    with direct_vm.expect_revert("deadline has not passed"):
        contract.adjudicate_claim(claim_id)
