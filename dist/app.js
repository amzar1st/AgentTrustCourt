const SDK_URL = "https://esm.sh/genlayer-js@1.1.8?bundle";
const WEI_PER_GEN = 10n ** 18n;

const $ = (id) => document.getElementById(id);
const state = {
  sdk: null,
  sdkError: null,
  network: localStorage.getItem("atc-network") || "studionet",
  contractAddress: localStorage.getItem("atc-contract") || "",
  account: null,
  readClient: null,
  writeClient: null,
  stats: null,
  agents: {},
  claims: {},
  toastTimer: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textValue(value, fallback = "—") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function numberValue(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  try { return Number(value); } catch { return fallback; }
}

function shortAddress(value) {
  const address = textValue(value, "");
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function formatGen(wei) {
  try {
    const raw = BigInt(wei ?? 0);
    const whole = raw / WEI_PER_GEN;
    const fraction = (raw % WEI_PER_GEN).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch { return "0"; }
}

function parseGen(value) {
  const normalized = String(value || "0").trim();
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) throw new Error("GEN amount must be a positive decimal");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * WEI_PER_GEN + BigInt(fraction.padEnd(18, "0") || "0");
}

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function explorerUrl(txHash) {
  const base = chainConfig()?.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${txHash}` : "";
}

function chainConfig() {
  if (!state.sdk?.chains) return null;
  if (state.network === "bradbury") return state.sdk.chains.testnetBradbury;
  if (state.network === "localnet") return state.sdk.chains.localnet;
  return state.sdk.chains.studionet;
}

function setNetworkStatus(message, kind = "") {
  const node = $("networkStatus");
  node.textContent = message;
  node.className = `micro-status ${kind}`;
}

function toast(message, kind = "") {
  const node = $("toast");
  node.textContent = message;
  node.className = `toast show ${kind}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { node.className = "toast"; }, 4500);
}

function setReceipt(message, kind = "") {
  const node = $("claimReceipt");
  if (!message) { node.hidden = true; node.textContent = ""; return; }
  node.hidden = false;
  node.className = `receipt ${kind}`;
  node.innerHTML = message;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `${escapeHtml(label || "Working…")} <span class="spin">◌</span>`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalLabel || button.innerHTML;
  }
}

async function loadSdk() {
  try {
    state.sdk = await import(SDK_URL);
    setNetworkStatus("SDK ready · enter a deployed contract address", "ready");
    rebuildClients();
  } catch (error) {
    state.sdkError = error;
    setNetworkStatus("SDK unavailable · check browser network access", "error");
  }
}

function rebuildClients() {
  const chain = chainConfig();
  if (!chain || !state.sdk?.createClient) return;
  state.readClient = state.sdk.createClient({ chain });
  state.writeClient = state.account && window.ethereum
    ? state.sdk.createClient({ chain, account: state.account, provider: window.ethereum })
    : null;
}

function setNetwork(network) {
  state.network = network;
  localStorage.setItem("atc-network", network);
  rebuildClients();
  const selected = $("networkSelect");
  selected.value = network;
  if (state.contractAddress && isAddress(state.contractAddress)) refreshState();
  else setNetworkStatus("SDK ready · enter a deployed contract address", "ready");
}

function setContractAddress(value) {
  const address = String(value || "").trim();
  state.contractAddress = address;
  $("contractAddress").value = address;
  if (address) localStorage.setItem("atc-contract", address);
  if (!isAddress(address)) {
    setNetworkStatus("Address format not recognized", "error");
    return;
  }
  if (!state.sdk) { setNetworkStatus("Loading GenLayerJS…"); return; }
  rebuildClients();
  refreshState();
}

async function connectWallet() {
  if (!window.ethereum) {
    toast("No EVM wallet detected. Install or unlock a browser wallet.", "error");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.account = accounts?.[0] || null;
    rebuildClients();
    $("connectWallet").textContent = state.account ? shortAddress(state.account) : "Connect wallet";
    if (state.writeClient?.connect) await state.writeClient.connect(state.network === "bradbury" ? "testnetBradbury" : state.network);
    setNetworkStatus(state.account ? `Wallet ${shortAddress(state.account)} · ${state.network}` : "Wallet disconnected", state.account ? "ready" : "");
    toast(state.account ? `Connected ${shortAddress(state.account)}` : "Wallet disconnected");
  } catch (error) {
    toast(error?.message || "Wallet connection failed", "error");
  }
}

function contractReady(forWrite = false) {
  if (!isAddress(state.contractAddress)) {
    toast("Load a deployed GenLayer contract address first.", "error");
    return false;
  }
  if (!state.sdk || !state.readClient) {
    toast("GenLayerJS is still loading.", "error");
    return false;
  }
  if (forWrite && !state.writeClient) {
    toast("Connect the wallet that should sign this transaction.", "error");
    return false;
  }
  return true;
}

async function read(functionName, args = []) {
  return state.readClient.readContract({ address: state.contractAddress, functionName, args });
}

async function refreshState() {
  if (!isAddress(state.contractAddress) || !state.readClient) {
    renderStats(null);
    return;
  }
  setNetworkStatus(`Reading ${state.network} court state…`);
  try {
    const [stats, agents, claims] = await Promise.all([
      read("get_stats"),
      read("get_agents"),
      read("get_claims"),
    ]);
    state.stats = stats || {};
    state.agents = agents || {};
    state.claims = claims || {};
    renderStats(state.stats);
    renderAgents(state.agents);
    renderClaims(state.claims);
    setNetworkStatus(`${state.network} · state synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "ready");
  } catch (error) {
    setNetworkStatus("Read failed · check network and contract address", "error");
    toast(error?.message || "Could not read contract state", "error");
    renderStats(null);
  }
}

function renderStats(stats) {
  $("statAgents").textContent = stats ? textValue(stats.agent_count, "0") : "—";
  $("statClaims").textContent = stats ? textValue(stats.claim_count, "0") : "—";
  $("statResolved").textContent = stats ? textValue(stats.resolved_claim_count, "0") : "—";
  $("statBonded").textContent = stats ? formatGen(stats.total_bonded) : "—";
}

function claimVerdictClass(verdict) {
  return verdict === "VERIFIED" ? "verified" : verdict === "FALSE" ? "false" : "unproven";
}

function claimCard(claim) {
  const verdict = textValue(claim.verdict, "PENDING");
  const status = textValue(claim.status, "OPEN");
  const evidence = [...(claim.claimant_evidence_urls || []), ...(claim.respondent_evidence_urls || [])];
  const evidenceLinks = evidence.length
    ? evidence.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join("")
    : `<span>No sources attached yet.</span>`;
  const canClaim = (claim.claimant === state.account && !claim.claimant_claimed && BigInt(claim.claimant_payout || 0) > 0n)
    || (claim.respondent === state.account && !claim.respondent_claimed && BigInt(claim.respondent_payout || 0) > 0n);
  const actions = canClaim ? `<button data-action="payout" data-claim-id="${escapeHtml(claim.claim_id)}">Claim ${formatGen(claim.claimant === state.account ? claim.claimant_payout : claim.respondent_payout)} GEN</button>` : "";
  const resolution = verdict === "PENDING"
    ? `${status} · evidence ${textValue(claim.evidence_count, "0")}`
    : `${verdict} · ${textValue(claim.confidence, "0")}/100 confidence`;
  return `<article class="claim-card">
    <div class="claim-card-header"><div><code>${escapeHtml(claim.claim_id)}</code><h4>${escapeHtml(claim.title)}</h4></div><span class="verdict ${claimVerdictClass(verdict)}">${escapeHtml(verdict)}</span></div>
    <div class="claim-card-meta"><span>RESPONDENT / ${escapeHtml(claim.respondent_agent_id)}</span><span>${escapeHtml(resolution)}</span></div>
    <p class="claim-card-summary">${escapeHtml(claim.verdict_reason || claim.failure_statement || "Awaiting the evidence record.")}</p>
    <div class="claim-card-footer"><span>BOND ${formatGen(BigInt(claim.claim_bond || 0) + BigInt(claim.respondent_bond || 0))} GEN</span><span>${evidence.length} source${evidence.length === 1 ? "" : "s"}</span><span class="spacer"></span>${actions}</div>
    <details class="claim-detail"><summary>Inspect evidence and settlement</summary><div class="claim-detail-body"><p><strong>Agreement:</strong> ${escapeHtml(claim.task_agreement)}</p><p><strong>Sources:</strong> ${evidenceLinks}</p><p><strong>Reputation:</strong> claimant ${escapeHtml(claim.claimant_delta)} · respondent ${escapeHtml(claim.respondent_delta)}</p><p><strong>Payouts:</strong> claimant ${formatGen(claim.claimant_payout)} GEN · respondent ${formatGen(claim.respondent_payout)} GEN</p></div></details>
  </article>`;
}

function renderClaims(claims) {
  const ledger = $("claimLedger");
  const values = Object.values(claims || {}).sort((a, b) => numberValue(b.opened_at) - numberValue(a.opened_at));
  if (!values.length) {
    ledger.innerHTML = `<div class="empty-state"><span class="empty-mark">01</span><p>No claims yet. Register two agents, open the first case, and attach public evidence.</p></div>`;
    return;
  }
  ledger.innerHTML = values.map(claimCard).join("");
  const first = values[0]?.claim_id;
  ["evidenceClaimId", "challengeClaimId", "adjudicateClaimId"].forEach((id) => { if (!$(id).value && first) $(id).value = first; });
}

function renderAgents(agents) {
  const list = $("agentList");
  const values = Object.values(agents || {});
  if (!values.length) {
    list.innerHTML = `<div class="empty-state small"><p>No registered agents loaded.</p></div>`;
    return;
  }
  list.innerHTML = values.map((agent) => `<div class="agent-row"><span class="agent-orb">${escapeHtml(textValue(agent.agent_id, "AG").slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(agent.display_name)}</strong><small>${escapeHtml(agent.agent_id)} · ${escapeHtml(shortAddress(agent.owner))}</small></div><span class="agent-score">${escapeHtml(agent.reputation_score)}/1000</span></div>`).join("");
}

async function sendWrite({ button, label, functionName, args = [], value = 0n }) {
  if (!contractReady(true)) return;
  setBusy(button, true, label);
  setNetworkStatus(`${label} · waiting for wallet`, "");
  try {
    const request = { address: state.contractAddress, functionName, args, value };
    let txHash;
    if (typeof state.writeClient.estimateTransactionFeesForWrite === "function") {
      const estimate = await state.writeClient.estimateTransactionFeesForWrite(request);
      const fees = { distribution: estimate.distribution, feeValue: estimate.feeValue };
      if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;
      txHash = await state.writeClient.writeContract({ ...request, fees });
    } else {
      txHash = await state.writeClient.writeContract(request);
    }
    setNetworkStatus(`${label} · consensus transaction ${String(txHash).slice(0, 12)}…`, "");
    const receipt = await state.writeClient.waitForTransactionReceipt({ hash: txHash, waitUntil: "decided", retries: 180 });
    if (state.sdk.isSuccessful && !state.sdk.isSuccessful(receipt)) throw new Error("Transaction reached a decision but the contract execution failed");
    const txUrl = explorerUrl(txHash);
    const txLabel = txUrl
      ? `<a href="${escapeHtml(txUrl)}" target="_blank" rel="noreferrer">${escapeHtml(txHash)}</a>`
      : escapeHtml(txHash);
    setReceipt(`<strong>${escapeHtml(label)}</strong> accepted.<br />Transaction: ${txLabel}`);
    toast(`${label} accepted`);
    await refreshState();
  } catch (error) {
    setReceipt(`<strong>${escapeHtml(label)}</strong> failed.<br />${escapeHtml(error?.message || error)}`, "error");
    setNetworkStatus(`${label} failed`, "error");
    toast(error?.message || `${label} failed`, "error");
  } finally {
    setBusy(button, false);
  }
}

function evidenceArrays(optional = false) {
  if (optional) {
    const url = $("challengeUrl").value.trim();
    const hash = $("challengeHash").value.trim();
    if (!url && !hash) return { urls: [], hashes: [] };
    if (!url || !hash) throw new Error("Every evidence URL needs a matching hash");
    return { urls: [url], hashes: [hash] };
  }
  const urls = [];
  const hashes = [];
  for (let index = 1; index <= 3; index += 1) {
    const url = $(`evidenceUrl${index}`)?.value.trim() || "";
    const hash = $(`evidenceHash${index}`)?.value.trim() || "";
    if (!url && !hash) continue;
    if (!url || !hash) throw new Error("Every evidence URL needs a matching hash");
    urls.push(url); hashes.push(hash);
  }
  return { urls, hashes };
}

function bindForms() {
  $("connectWallet").addEventListener("click", connectWallet);
  $("networkSelect").value = state.network;
  $("networkSelect").addEventListener("change", (event) => setNetwork(event.target.value));
  $("loadContract").addEventListener("click", () => setContractAddress($("contractAddress").value));
  $("refreshState").addEventListener("click", refreshState);
  $("claimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("openClaimButton");
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number($("claimDeadlineHours").value) * 3600);
      await sendWrite({
        button,
        label: "Open claim",
        functionName: "open_reputation_claim",
        args: [$("claimRespondent").value.trim(), $("claimTitle").value.trim(), $("claimAgreement").value.trim(), $("claimFailure").value.trim(), $("claimCriteria").value.trim(), deadline],
        value: parseGen($("claimBond").value),
      });
    } catch (error) { toast(error?.message || error, "error"); }
  });
  $("agentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendWrite({ button: event.submitter, label: "Register agent", functionName: "register_agent", args: [$("agentId").value.trim(), $("agentName").value.trim(), $("agentEndpoint").value.trim(), $("agentSummary").value.trim()] });
  });
  $("evidenceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { urls, hashes } = evidenceArrays();
      await sendWrite({ button: event.submitter, label: "Attach evidence", functionName: "submit_evidence", args: [$("evidenceClaimId").value.trim(), urls, hashes] });
    } catch (error) { toast(error?.message || error, "error"); }
  });
  $("challengeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { urls, hashes } = evidenceArrays(true);
      await sendWrite({ button: event.submitter, label: "Post challenge", functionName: "challenge_claim", args: [$("challengeClaimId").value.trim(), $("challengeResponse").value.trim(), urls, hashes], value: parseGen($("challengeBond").value) });
    } catch (error) { toast(error?.message || error, "error"); }
  });
  $("adjudicateButton").addEventListener("click", async () => {
    await sendWrite({ button: $("adjudicateButton"), label: "Run court review", functionName: "adjudicate_claim", args: [$("adjudicateClaimId").value.trim()] });
  });
  $("claimLedger").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='payout']");
    if (!button) return;
    await sendWrite({ button, label: "Claim payout", functionName: "claim_bond", args: [button.dataset.claimId] });
  });
  if (window.ethereum?.on) {
    window.ethereum.on("accountsChanged", (accounts) => {
      state.account = accounts?.[0] || null;
      $("connectWallet").textContent = state.account ? shortAddress(state.account) : "Connect wallet";
      rebuildClients();
      renderClaims(state.claims);
    });
  }
}

$("contractAddress").value = state.contractAddress;
bindForms();
renderStats(null);
loadSdk();
if (state.contractAddress && isAddress(state.contractAddress)) setTimeout(refreshState, 300);
