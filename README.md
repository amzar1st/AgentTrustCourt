# AgentTrust Court

**Decentralized evidence-based reputation adjudication for autonomous AI agents.**

AgentTrust Court is a GenLayer Intelligent Contract and wallet-connected web console for disputes between autonomous agents. A claimant opens a case against a registered respondent, commits a GEN bond, and submits an agreement plus public evidence. The respondent can challenge with a response and counter-evidence. After the evidence window closes, any account can trigger a validator-consensus review:

```text
Agreement + claim + public evidence
              ↓
     independent web rendering
              ↓
       structured LLM review
              ↓
    validator equivalence check
              ↓
 VERIFIED / UNPROVEN / FALSE
              ↓
 reputation deltas + bond payout
```

The court intentionally defaults to `UNPROVEN` when the record is incomplete, ambiguous, conflicting, or unavailable. Webpage content is treated as untrusted data and cannot redefine the adjudication rubric.

## What is included

- `contracts/agent_trust_court.py` — the no-argument Intelligent Contract.
- `tests/direct/` — direct-mode tests for registration, bonds, permissions, evidence, the three verdict labels, and time gates.
- `tests/integration/` — a small localnet/Studionet loadability smoke test.
- `dist/` — a static, public-facing dApp console using GenLayerJS `1.1.8` from a browser ESM CDN.
- `deploy/deployScript.ts` — fee-aware deployment script for localnet, Studionet, or testnet.
- `.openai/hosting.json` — Sites configuration serving `dist/`.
- `STUDIO_TEST_PLAN.md` — the manual two-wallet test matrix and evidence checklist.

## Contract surface

| Method | Purpose | Value |
| --- | --- | --- |
| `register_agent` | Bind one agent identity to the caller wallet | — |
| `open_reputation_claim` | Create an `OPEN` case and lock claimant bond | payable, minimum `0.01 GEN` |
| `submit_evidence` | Attach 2–3 public URLs and source hashes | — |
| `challenge_claim` | Move a case to `CHALLENGED` with a response and optional counter-source | payable, minimum `0.01 GEN` |
| `adjudicate_claim` | Fetch sources, run LLM rubric, and settle after deadline | — |
| `claim_bond` | Withdraw the caller’s resolved payout once | — |
| `get_agent`, `get_agent_score` | Read identity and reputation | view |
| `get_agents` | Read the agent register | view |
| `get_claim`, `get_claims`, `get_claim_ids` | Read the public case ledger | view |
| `get_stats` | Read aggregate court state | view |

Scores start at `500 / 1000`. The demonstration policy is intentionally small and legible:

- `VERIFIED`: claimant `+2`, respondent `-15`; claimant receives both bonds.
- `UNPROVEN`: both parties get their own bond back; reputation is unchanged.
- `FALSE`: claimant `-8`, respondent `+4`; respondent receives both bonds.

Payouts are recorded during adjudication and claimed separately. This keeps the consensus decision and the external value transfer in distinct transactions.

## Run the checks

Python 3.12 is the supported version for the current GenLayer toolchain.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

genvm-lint check contracts/agent_trust_court.py
pytest tests/direct/ -v
node --check dist/app.js
```

The direct tests use the GenLayer testing suite’s web and LLM mocks. They do not require a live RPC. The integration smoke test is run only when a localnet or Studionet endpoint is configured.

## Deploy the contract

### Verified Studionet deployment

- Contract: [`0x65967F7Cc6b3BE9a1D49B0852ec1d5a29c8Bd155`](https://explorer-studio.genlayer.com/address/0x65967F7Cc6b3BE9a1D49B0852ec1d5a29c8Bd155)
- Deployment transaction: [`0xdd30da58e94fcff2d246f9c82ea92a4f4437aa29ff2b9143473a25b6fe59e02e`](https://explorer-studio.genlayer.com/tx/0xdd30da58e94fcff2d246f9c82ea92a4f4437aa29ff2b9143473a25b6fe59e02e)
- Status: `FINALIZED`
- Constructor: no arguments
- Smoke test: `get_stats` returned the expected empty court state with zero agents, claims, resolved claims, verified claims, bonded GEN, and contract balance.

The contract constructor takes no arguments. With the GenLayer CLI configured:

```bash
genlayer deploy
```

Or use the included TypeScript deploy script through the project tooling. After the transaction reaches an accepted/finalized state, copy the printed address into the web console’s **Contract address** field. Fund the wallet with test GEN before opening or challenging a case; the browser app estimates the current protocol fee separately from the bond value.

For a manual Studio flow:

1. Open GenLayer Studio and load `contracts/agent_trust_court.py`.
2. Deploy with no constructor arguments.
3. Use two funded wallets to register `agent-alpha` and `agent-beta`.
4. Open a claim from wallet A with a one-hour evidence deadline and `0.01 GEN`.
5. Submit two stable public evidence URLs and matching hashes.
6. Optionally challenge from wallet B with a second `0.01 GEN` bond.
7. Advance time past the deadline, configure web/LLM mocks or stable public pages, and call `adjudicate_claim`.
8. Inspect the resolved claim, score deltas, and each party’s payout before calling `claim_bond`.

Stable evidence sources should be immutable GitHub raw files or versioned pages. Never use a URL that contains secrets or private personal data.

## Public console

The source of the console is tracked in `dist/` so it can be served as a static Site without a build step. It starts on Studionet with the verified deployment address above and preserves a replacement address in local browser storage if the user loads another deployment.

The console provides:

- wallet connection and network selection;
- live reads for agents, claims, balances, and case counts;
- register, open, submit-evidence, challenge, adjudicate, and payout actions;
- transaction receipts with explorer links;
- explicit protocol copy explaining the evidence and consensus path.

## Design and safety notes

- The LLM only returns a strict verdict, confidence, and reason. The contract validates the schema and the allowed verdict set.
- Validators independently rerun the web fetch and LLM review. They must agree on the verdict and stay within a confidence tolerance of 15 points; explanations are intentionally not compared exactly.
- Evidence excerpts are bounded before entering the prompt, and page instructions are explicitly ignored.
- One missing URL becomes `[SOURCE UNAVAILABLE]`; it does not automatically become proof of failure.
- A failed consensus attempt reverts the transaction, leaving the case open for a later retry.
- The current MVP has no appeals or governance layer. For high-stakes disputes, add an appeal mechanism and human review before production use.

## Official references

- [GenLayer Intelligent Contracts](https://docs.genlayer.com/developers/intelligent-contracts/introduction)
- [Web access](https://docs.genlayer.com/developers/intelligent-contracts/features/web-access)
- [Calling LLMs](https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms)
- [The Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [Value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers)
- [GenLayerJS](https://docs.genlayer.com/developers/decentralized-applications/genlayer-js)

## Submission line

> Decentralized evidence-based reputation adjudication for autonomous AI agents.
