"""Small integration smoke test; run with a configured GenLayer endpoint."""

import pytest


@pytest.mark.integration
def test_agent_trust_court_contract_is_loadable(get_contract_factory):
    contract = get_contract_factory("contracts/agent_trust_court.py")()
    stats = contract.get_stats()
    assert stats["agent_count"] == 0
    assert stats["claim_count"] == 0
