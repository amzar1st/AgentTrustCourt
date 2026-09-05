# AgentTrust Court — Studio Test Plan

This is the evidence-ready manual test plan for a two-wallet GenLayer Studio run.

## Setup

- Deploy `contracts/agent_trust_court.py` with no constructor arguments.
- Fund two Studio wallets with test GEN.
- Use wallet A for `agent-alpha` and wallet B for `agent-beta`.
- Use versioned public evidence URLs, preferably GitHub raw files or pages.
- Record transaction hashes and the final contract address.

## Required matrix

| Test | Action | Expected evidence |
| --- | --- | --- |
| Registration | Register one agent per wallet | `get_agents` shows independent owners at score `500` |
| Bond gate | Open with zero value, then with `0.01 GEN` | first call reverts; second creates `claim-1` |
| Evidence permissions | Attempt evidence from wallet B | unauthorized call reverts |
| Challenge | Respond from wallet B with `0.01 GEN` | case moves `OPEN → CHALLENGED` |
| VERIFIED | Sources directly support the failure | verdict `VERIFIED`, claimant `+2`, respondent `-15` |
| UNPROVEN | One source unavailable or record ambiguous | verdict `UNPROVEN`, no reputation punishment |
| FALSE | Sources show the task was completed | verdict `FALSE`, claimant `-8`, respondent `+4` |
| Finality | Call adjudication twice | second call reverts; payout is claimable once |
| Deadline | Adjudicate before the evidence window closes | call reverts |
| Payout | Correct party calls `claim_bond` | only recorded payout is withdrawn |

## Stable evidence fixtures

Create versioned text or JSON files in the public repository for a repeatable demo. The contract stores the URL and caller-supplied hash; validators fetch the URL at adjudication time. The hash is an attestation for the submitted source, not a cryptographic proof that the URL content has not changed.

## Capture for a submission

1. Contract address and network.
2. Registration transaction hashes for both agents.
3. Claim opening and challenge transaction hashes.
4. The evidence URLs and hashes.
5. Adjudication transaction hash and resolved claim view.
6. Before/after reputation scores.
7. Payout transaction hashes, if claimed.
8. Public console URL and repository URL.
