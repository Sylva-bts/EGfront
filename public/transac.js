const tabs = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll(".tab-section")];

const balanceEl = document.getElementById("user-balance");
const balanceStatusEl = document.getElementById("balance-status");

const depositForm = document.getElementById("deposit-form");
const depositAmountEl = document.getElementById("deposit-amount");
const depositCryptoEl = document.getElementById("deposit-crypto");
const depositFeedbackEl = document.getElementById("deposit-feedback");
const depositStatusBadgeEl = document.getElementById("deposit-transaction-status");
const paymentDetailsEl = document.getElementById("payment-details");

const withdrawForm = document.getElementById("withdraw-form");
const withdrawAmountEl = document.getElementById("withdraw-amount");
const withdrawCryptoEl = document.getElementById("withdraw-crypto");
const withdrawAddressEl = document.getElementById("withdraw-wallet-address");
const withdrawAddressHintEl = document.getElementById("withdraw-address-hint");
const withdrawPasswordEl = document.getElementById("withdraw-password");
const withdrawFeedbackEl = document.getElementById("withdraw-feedback");
const withdrawStatusBoxEl = document.getElementById("withdraw-status-box");
const withdrawRecipientBoxEl = document.getElementById("withdraw-recipient-box");
const withdrawMinBtn = document.getElementById("withdraw-min-btn");
const withdrawMaxBtn = document.getElementById("withdraw-max-btn");
const withdrawPasteBtn = document.getElementById("withdraw-paste-btn");

let depositPollingId;
let withdrawPollingId;
let payoutConfigHint = "";

const WITHDRAW_HINTS = {
  USDT: "Retrait disponible en USDT sur le reseau TRC20. Utilisez une adresse Tron valide commencant generalement par T.",
  TRX: "Retrait disponible en TRX sur le reseau Tron. Utilisez une adresse commencant generalement par T.",
  BTC: "Retrait disponible en BTC sur le reseau Bitcoin. Utilisez une adresse Legacy, SegWit ou Native SegWit valide.",
  ETH: "Retrait disponible en ETH sur le reseau Ethereum. Utilisez une adresse commencant par 0x."
};

const ADDRESS_VALIDATORS = {
  USDT: (value) => /^T[a-zA-Z0-9]{33}$/.test(value),
  TRX: (value) => /^T[a-zA-Z0-9]{33}$/.test(value),
  BTC: (value) => /^(bc1[a-zA-HJ-NP-Z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value),
  ETH: (value) => /^0x[a-fA-F0-9]{40}$/.test(value),
};

function setFeedback(element, message, type = "") {
  element.textContent = message || "";
  element.className = "feedback";
  if (type) {
    element.classList.add(type);
  }
}

function switchTab(targetTab) {
  tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === targetTab);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${targetTab}-panel`);
  });
}

tabs.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

function setBalanceStatus(message, isError = false) {
  balanceStatusEl.textContent = message;
  balanceStatusEl.style.color = isError ? "#ff7a9c" : "";
}

function getDisplayedBalance() {
  const numericValue = String(balanceEl.textContent || "")
    .replace("USD", "")
    .replace(",", ".")
    .trim();
  return Number(numericValue);
}

async function refreshBalance() {
  if (!window.AppApi.getToken()) {
    balanceEl.textContent = "-- USD";
    setBalanceStatus("Connectez-vous pour acceder a votre wallet.", true);
    return;
  }

  try {
    const payload = await window.AppApi.fetchJson("/api/payments/balance", {
      method: "GET",
      headers: window.AppApi.authHeaders()
    });

    const balance = Number(payload?.data?.balance || 0);
    balanceEl.textContent = `${balance.toFixed(2)} USD`;
    setBalanceStatus("Solde synchronise en temps reel.");
  } catch (error) {
    balanceEl.textContent = "-- USD";
    setBalanceStatus(error.message, true);
  }
}

async function loadPayoutConfigHint() {
  try {
    const payload = await window.AppApi.fetchJson("/api/payments/config-check", {
      method: "GET",
      headers: window.AppApi.authHeaders()
    });

    const diagnostics = payload?.data || {};
    const hints = [...(diagnostics.issues || []), ...(diagnostics.hints || [])].filter(Boolean);
    payoutConfigHint = hints.join(" ");

    if (hints.length) {
      withdrawStatusBoxEl.innerHTML = `
        <strong>Etat du retrait</strong>
        <p>${hints[0]}</p>
      `;
    }
  } catch (error) {
    payoutConfigHint = "";
  }
}

function updateWithdrawHint() {
  const crypto = withdrawCryptoEl.value;
  withdrawAddressHintEl.textContent = WITHDRAW_HINTS[crypto] || "Verifiez attentivement l'adresse de destination.";
  withdrawAddressEl.placeholder = {
    USDT: "Collez votre adresse wallet USDT TRC20",
    TRX: "Collez votre adresse wallet TRX",
    BTC: "Collez votre adresse wallet BTC",
    ETH: "Collez votre adresse wallet ETH"
  }[crypto] || "Collez votre adresse wallet";
}

function validateWithdrawAddress(crypto, address) {
  const validator = ADDRESS_VALIDATORS[crypto];
  if (!validator) {
    return false;
  }
  return validator(address);
}

function parseAmountInput(value) {
  if (typeof value === "number") {
    return value;
  }

  return Number(String(value || "").replace(",", ".").trim());
}

function buildQrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
}

function renderPaymentInstructions(data) {
  const paymentAddress = data.payment_address || data.address || "--";
  const amountCrypto = data.amount_crypto || "--";
  const invoiceId = data.invoice_id || "--";
  const paymentUrl = data.payment_url || data.paymentUrl || "";
  const currency = data.currency || depositCryptoEl.value;
  const qrSource = paymentUrl || paymentAddress;

  paymentDetailsEl.innerHTML = `
    <div class="payment-card">
      <div class="payment-row">
        <span class="payment-label">Montant a envoyer</span>
        <div class="payment-value">
          <span>${amountCrypto} ${currency}</span>
        </div>
      </div>

      <div class="payment-row">
        <span class="payment-label">Identifiant facture</span>
        <div class="payment-value">
          <span>${invoiceId}</span>
        </div>
      </div>

      <div class="qr-wrap">
        <img src="${buildQrUrl(qrSource)}" alt="QR code de paiement">
      </div>

      ${paymentUrl ? `
      <button class="primary-btn" type="button" id="open-oxapay-btn">Payer sur OxaPay</button>
      ` : ""}
    </div>
  `;

  const openButton = document.getElementById("open-oxapay-btn");
  if (openButton && paymentUrl) {
    openButton.addEventListener("click", () => {
      window.location.href = paymentUrl;
    });
  }
}

async function pollDepositStatus(invoiceId) {
  if (depositPollingId) {
    clearInterval(depositPollingId);
  }

  depositPollingId = setInterval(async () => {
    try {
      const payload = await window.AppApi.fetchJson(`/api/payments/status/${invoiceId}`, {
        method: "GET",
        headers: window.AppApi.authHeaders()
      });

      const status = payload?.data?.status || "pending";
      depositStatusBadgeEl.textContent = status;

      if (status === "paid" || status === "completed") {
        clearInterval(depositPollingId);
        const bonusAmount = Number(payload?.data?.bonus_amount || 0);
        const creditedTotal = Number(payload?.data?.credited_total || 0);
        const successMessage = bonusAmount > 0
          ? `Premier depot confirme. Bonus de bienvenue: +${bonusAmount.toFixed(2)} USD. Total credite: ${creditedTotal.toFixed(2)} USD.`
          : "Depot confirme. Le solde a bien ete incremente.";
        setFeedback(depositFeedbackEl, successMessage, "success");
        refreshBalance();
      }

      if (status === "expired" || status === "failed") {
        clearInterval(depositPollingId);
        setFeedback(depositFeedbackEl, `Transaction ${status}.`, "error");
      }
    } catch (error) {
      setFeedback(depositFeedbackEl, error.message, "error");
    }
  }, 6000);
}

async function pollWithdrawalStatus(transactionId) {
  if (!transactionId) {
    return;
  }

  if (withdrawPollingId) {
    clearInterval(withdrawPollingId);
  }

  withdrawPollingId = setInterval(async () => {
    try {
      const payload = await window.AppApi.fetchJson(`/api/payments/withdraw/${transactionId}`, {
        method: "GET",
        headers: window.AppApi.authHeaders()
      });

      const status = payload?.data?.status || "pending";
      withdrawStatusBoxEl.innerHTML = `
        <strong>Etat du retrait</strong>
        <p>Suivi en direct: ${status}.</p>
      `;
      withdrawRecipientBoxEl.innerHTML = `
        <strong>Destinataire</strong>
        <p>Adresse crypto: ${withdrawAddressEl.value.trim() || "--"}</p>
        <p>Statut de transaction: ${status}</p>
      `;

      if (status === "completed" || status === "rejected") {
        clearInterval(withdrawPollingId);
        refreshBalance();
      }
    } catch (error) {
      clearInterval(withdrawPollingId);
      withdrawStatusBoxEl.innerHTML = `
        <strong>Etat du retrait</strong>
        <p>${error.message}</p>
      `;
    }
  }, 6000);
}

depositForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amount = parseAmountInput(depositAmountEl.value);
  const crypto = depositCryptoEl.value;

  if (!window.AppApi.getToken()) {
    setFeedback(depositFeedbackEl, "Connectez-vous avant d'effectuer un depot.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount < 0.5) {
    setFeedback(depositFeedbackEl, "Le montant minimum de depot est de 0,5 USD.", "error");
    return;
  }

  setFeedback(depositFeedbackEl, "Creation de la facture en cours...");
  depositStatusBadgeEl.textContent = "Generation...";

  try {
    const payload = await window.AppApi.fetchJson("/api/payments/deposit", {
      method: "POST",
      headers: window.AppApi.authHeaders(),
      body: JSON.stringify({ amount, crypto })
    });

    renderPaymentInstructions(payload.data || {});
    depositStatusBadgeEl.textContent = payload?.data?.status || "pending";
    setFeedback(depositFeedbackEl, "Facture OxaPay generee avec succes.", "success");

    if (payload?.data?.invoice_id) {
      pollDepositStatus(payload.data.invoice_id);
    }

    const paymentUrl = payload?.data?.payment_url;
    if (paymentUrl) {
      setTimeout(() => {
        window.location.href = paymentUrl;
      }, 700);
    }
  } catch (error) {
    setFeedback(depositFeedbackEl, error.message, "error");
    depositStatusBadgeEl.textContent = "Erreur";
  }
});

withdrawForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amount = parseAmountInput(withdrawAmountEl.value);
  const crypto = withdrawCryptoEl.value;
  const address = withdrawAddressEl.value.trim();
  const password = withdrawPasswordEl.value;

  if (!window.AppApi.getToken()) {
    setFeedback(withdrawFeedbackEl, "Connectez-vous avant d'effectuer un retrait.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount < 0.5) {
    setFeedback(withdrawFeedbackEl, "Le montant minimum de retrait est de 0,5 USD.", "error");
    return;
  }

  if (!address) {
    setFeedback(withdrawFeedbackEl, "L'adresse de reception est obligatoire.", "error");
    return;
  }

  if (!validateWithdrawAddress(crypto, address)) {
    setFeedback(withdrawFeedbackEl, `L'adresse saisie n'est pas valide pour ${crypto}.`, "error");
    return;
  }

  if (!password || password.length < 6) {
    setFeedback(withdrawFeedbackEl, "Le mot de passe de validation est obligatoire.", "error");
    return;
  }

  setFeedback(withdrawFeedbackEl, "Validation du retrait en cours...");
  withdrawStatusBoxEl.innerHTML = `
    <strong>Etat du retrait</strong>
    <p>Verification des donnees et transmission securisee...</p>
  `;
  withdrawRecipientBoxEl.innerHTML = `
    <strong>Destinataire</strong>
    <p>Adresse crypto: ${address}</p>
    <p>Statut de transaction: verification en cours</p>
  `;

  try {
    const payload = await window.AppApi.fetchJson("/api/payments/withdraw", {
      method: "POST",
      headers: window.AppApi.authHeaders(),
      body: JSON.stringify({ amount, address, crypto, password })
    });

    setFeedback(withdrawFeedbackEl, payload.message || "Retrait initie avec succes. Le solde a ete decremente.", "success");
    withdrawStatusBoxEl.innerHTML = `
      <strong>Etat du retrait</strong>
      <p>Demande envoyee. Statut: ${payload?.data?.status || "pending"}.</p>
    `;
    withdrawRecipientBoxEl.innerHTML = `
      <strong>Destinataire</strong>
      <p>Adresse crypto: ${payload?.data?.address || address}</p>
      <p>Statut de transaction: ${payload?.data?.status || "pending"}</p>
    `;
    withdrawPasswordEl.value = "";
    if (payload?.data?.transaction_id) {
      pollWithdrawalStatus(payload.data.transaction_id);
    }
    refreshBalance();
  } catch (error) {
    const rawMessage = String(error.message || "");
    const friendlyMessage = rawMessage.includes("There was an issue with the submitted data")
      ? `Le prestataire de paiement a refuse la demande. ${payoutConfigHint || "Verifiez l'adresse USDT TRC20, l'IP publique autorisee chez OxaPay, la cle Payout, la 2FA et les limites de transfert."}`
      : rawMessage;

    setFeedback(withdrawFeedbackEl, friendlyMessage, "error");
    withdrawStatusBoxEl.innerHTML = `
      <strong>Etat du retrait</strong>
      <p>${friendlyMessage}</p>
    `;
    withdrawRecipientBoxEl.innerHTML = `
      <strong>Destinataire</strong>
      <p>Adresse crypto: ${address || "--"}</p>
      <p>Statut de transaction: erreur</p>
    `;
  }
});

refreshBalance();
loadPayoutConfigHint();
setInterval(refreshBalance, 15000);
updateWithdrawHint();
if (withdrawAddressEl) {
  withdrawAddressEl.value = "";
}
withdrawCryptoEl.addEventListener("change", updateWithdrawHint);

if (withdrawMinBtn) {
  withdrawMinBtn.addEventListener("click", () => {
    withdrawAmountEl.value = "0.50";
    withdrawAmountEl.focus();
  });
}

if (withdrawMaxBtn) {
  withdrawMaxBtn.addEventListener("click", () => {
    const balance = getDisplayedBalance();
    if (Number.isFinite(balance) && balance >= 0.5) {
      withdrawAmountEl.value = balance.toFixed(2);
      withdrawAmountEl.focus();
    } else {
      setFeedback(withdrawFeedbackEl, "Solde indisponible ou inferieur au minimum de retrait.", "error");
    }
  });
}

if (withdrawPasteBtn) {
  withdrawPasteBtn.addEventListener("click", async () => {
    try {
      const pastedText = await navigator.clipboard.readText();
      if (pastedText) {
        withdrawAddressEl.value = pastedText.trim();
        withdrawAddressEl.focus();
      }
    } catch (error) {
      setFeedback(withdrawFeedbackEl, "Le collage automatique n'est pas disponible sur ce navigateur.", "error");
    }
  });
}
