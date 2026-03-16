const OXAPAY_BASE = 'https://api.oxapay.com';
const BALANCE_KEY = 'oxapay_demo_balance_usd';

const balanceEl = document.getElementById('balance');
const merchantKeyEl = document.getElementById('merchantKey');
const callbackUrlEl = document.getElementById('callbackUrl');
const depositAmountEl = document.getElementById('depositAmount');
const depositCurrencyEl = document.getElementById('depositCurrency');
const withdrawAmountEl = document.getElementById('withdrawAmount');
const withdrawCurrencyEl = document.getElementById('withdrawCurrency');
const withdrawAddressEl = document.getElementById('withdrawAddress');
const depositResultEl = document.getElementById('depositResult');
const withdrawResultEl = document.getElementById('withdrawResult');
const logEl = document.getElementById('log');

let pendingDeposit = null;
let pendingWithdrawal = null;

document.getElementById('btnDeposit').addEventListener('click', onDeposit);
document.getElementById('btnCheckDeposit').addEventListener('click', checkDepositStatus);
document.getElementById('btnWithdraw').addEventListener('click', onWithdraw);
document.getElementById('btnCheckWithdraw').addEventListener('click', checkWithdrawStatus);

init();

function init() {
  merchantKeyEl.value = localStorage.getItem('oxapay_merchant_key') || 'V4XVPI-ACWJK7-WBS7NW-UX9BFH';
  callbackUrlEl.value = localStorage.getItem('oxapay_callback_url') || '';
  renderBalance(getBalance());
  restorePending();
  log('Page prête.');
}

function restorePending() {
  const rawDeposit = localStorage.getItem('oxapay_pending_deposit');
  if (rawDeposit) {
    pendingDeposit = JSON.parse(rawDeposit);
    depositResultEl.innerHTML = `Facture en attente. TrackId: <strong>${pendingDeposit.trackId}</strong>. Utilise “Vérifier statut dépôt”.`;
  }

  const rawWithdrawal = localStorage.getItem('oxapay_pending_withdraw');
  if (rawWithdrawal) {
    pendingWithdrawal = JSON.parse(rawWithdrawal);
    withdrawResultEl.textContent = `Retrait en attente. TrackId: ${pendingWithdrawal.trackId}. Utilise “Vérifier statut retrait”.`;
  }
}

function getBalance() {
  const raw = localStorage.getItem(BALANCE_KEY);
  return raw ? parseFloat(raw) : 0;
}

function setBalance(nextBalance) {
  localStorage.setItem(BALANCE_KEY, String(nextBalance));
  renderBalance(nextBalance);
}

function renderBalance(v) {
  balanceEl.textContent = Number(v).toFixed(2);
}

function log(message, data) {
  const row = `[${new Date().toLocaleString()}] ${message}`;
  logEl.textContent = `${row}\n${data ? JSON.stringify(data, null, 2) : ''}\n\n${logEl.textContent}`;
}

function saveConfig() {
  localStorage.setItem('oxapay_merchant_key', merchantKeyEl.value.trim());
  localStorage.setItem('oxapay_callback_url', callbackUrlEl.value.trim());
}

async function oxapayPost(path, payload) {
  const res = await fetch(`${OXAPAY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Erreur réseau OxaPay.');
  }

  return data;
}

async function onDeposit() {
  saveConfig();

  const merchant = merchantKeyEl.value.trim();
  const amount = parseFloat(depositAmountEl.value);
  const currency = depositCurrencyEl.value;
  const callbackUrl = callbackUrlEl.value.trim();

  if (!merchant) return alert('Ajoute la clé marchand OxaPay.');
  if (!amount || amount <= 0) return alert('Montant de dépôt invalide.');

  const payload = { merchant, amount, currency, lifeTime: 30, feePaidByPayer: 1 };
  if (callbackUrl) payload.callbackUrl = callbackUrl;

  try {
    log('Création de facture dépôt…', payload);
    const data = await oxapayPost('/v1/payment/invoice', payload);

    if (data.result !== 100) {
      throw new Error(data.message || 'Erreur API OxaPay (dépôt).');
    }

    const trackId = data.trackId;
    const payLink = data.payLink || '#';

    pendingDeposit = { trackId, amount };
    localStorage.setItem('oxapay_pending_deposit', JSON.stringify(pendingDeposit));

    depositResultEl.innerHTML = `Facture créée. <a href="${payLink}" target="_blank" rel="noopener">Payer maintenant</a><br/>TrackId: <strong>${trackId}</strong><br/>Le solde sera crédité après confirmation.`;

    log('Facture créée avec succès (en attente de confirmation).', data);
  } catch (error) {
    log('Erreur dépôt.', { error: error.message });
    depositResultEl.textContent = `Erreur: ${error.message}`;
  }
}

async function checkDepositStatus() {
  const merchant = merchantKeyEl.value.trim();
  if (!merchant) return alert('Ajoute la clé marchand OxaPay.');
  if (!pendingDeposit?.trackId) {
    depositResultEl.textContent = 'Aucun dépôt en attente.';
    return;
  }

  try {
    const data = await oxapayPost('/v1/payment/inquiry', {
      merchant,
      trackId: pendingDeposit.trackId
    });

    log('Statut dépôt reçu.', data);

    const status = (data.status || '').toLowerCase();
    if (status === 'paid' || status === 'confirming' || status === 'confirmed') {
      const next = getBalance() + pendingDeposit.amount;
      setBalance(next);
      depositResultEl.textContent = `Dépôt confirmé (${status}). Solde crédité de ${pendingDeposit.amount} USD.`;
      localStorage.removeItem('oxapay_pending_deposit');
      pendingDeposit = null;
      return;
    }

    depositResultEl.textContent = `Dépôt non confirmé (${status || 'inconnu'}). Réessaie dans quelques secondes.`;
  } catch (error) {
    log('Erreur vérification dépôt.', { error: error.message });
    depositResultEl.textContent = `Erreur: ${error.message}`;
  }
}

async function onWithdraw() {
  saveConfig();

  const merchant = merchantKeyEl.value.trim();
  const amount = parseFloat(withdrawAmountEl.value);
  const currency = withdrawCurrencyEl.value;
  const address = withdrawAddressEl.value.trim();

  if (!merchant) return alert('Ajoute la clé marchand OxaPay.');
  if (!address) return alert('Ajoute une adresse de retrait.');
  if (!amount || amount <= 0) return alert('Montant de retrait invalide.');

  const current = getBalance();
  if (current < amount) {
    withdrawResultEl.textContent = 'Solde insuffisant pour ce retrait.';
    return;
  }

  const payload = { merchant, amount, currency, address };

  try {
    log('Création de payout retrait…', payload);
    const data = await oxapayPost('/v1/payout', payload);

    if (data.result !== 100) {
      throw new Error(data.message || 'Erreur API OxaPay (retrait).');
    }

    const trackId = data.trackId || data.payoutId;
    pendingWithdrawal = { trackId, amount };
    localStorage.setItem('oxapay_pending_withdraw', JSON.stringify(pendingWithdrawal));

    withdrawResultEl.textContent = `Retrait lancé. TrackId: ${trackId}. Le solde sera débité après confirmation.`;
    log('Retrait lancé (en attente de confirmation).', data);
  } catch (error) {
    log('Erreur retrait.', { error: error.message });
    withdrawResultEl.textContent = `Erreur: ${error.message}`;
  }
}

async function checkWithdrawStatus() {
  const merchant = merchantKeyEl.value.trim();
  if (!merchant) return alert('Ajoute la clé marchand OxaPay.');
  if (!pendingWithdrawal?.trackId) {
    withdrawResultEl.textContent = 'Aucun retrait en attente.';
    return;
  }

  try {
    const data = await oxapayPost('/v1/payout/inquiry', {
      merchant,
      trackId: pendingWithdrawal.trackId
    });

    log('Statut retrait reçu.', data);

    const status = (data.status || '').toLowerCase();
    if (status === 'complete' || status === 'completed' || status === 'paid') {
      const next = getBalance() - pendingWithdrawal.amount;
      setBalance(next);
      withdrawResultEl.textContent = `Retrait confirmé (${status}). Solde débité de ${pendingWithdrawal.amount} USD.`;
      localStorage.removeItem('oxapay_pending_withdraw');
      pendingWithdrawal = null;
      return;
    }

    if (status === 'rejected' || status === 'failed' || status === 'cancelled') {
      withdrawResultEl.textContent = `Retrait ${status}. Aucun débit appliqué.`;
      localStorage.removeItem('oxapay_pending_withdraw');
      pendingWithdrawal = null;
      return;
    }

    withdrawResultEl.textContent = `Retrait en attente (${status || 'inconnu'}). Réessaie dans quelques secondes.`;
  } catch (error) {
    log('Erreur vérification retrait.', { error: error.message });
    withdrawResultEl.textContent = `Erreur: ${error.message}`;
  }
}
