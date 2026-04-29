(function initFinancePage() {
  const state = {
    depositInvoiceId: "",
    depositPollId: null,
    balance: 0,
    withdrawableBalance: 0
  };

  const els = {
    userBalance: document.getElementById("user-balance"),
    balanceStatus: document.getElementById("balance-status"),
    depositForm: document.getElementById("deposit-form"),
    depositAmount: document.getElementById("deposit-amount"),
    depositCrypto: document.getElementById("deposit-crypto"),
    depositFeedback: document.getElementById("deposit-feedback"),
    depositStatus: document.getElementById("deposit-transaction-status"),
    paymentDetails: document.getElementById("payment-details"),
    withdrawForm: document.getElementById("withdraw-form"),
    withdrawAmount: document.getElementById("withdraw-amount"),
    withdrawCrypto: document.getElementById("withdraw-crypto"),
    withdrawAddress: document.getElementById("withdraw-wallet-address"),
    withdrawPassword: document.getElementById("withdraw-password"),
    withdrawFeedback: document.getElementById("withdraw-feedback"),
    withdrawStatusBox: document.getElementById("withdraw-status-box"),
    withdrawRecipientBox: document.getElementById("withdraw-recipient-box"),
    withdrawMinBtn: document.getElementById("withdraw-min-btn"),
    withdrawMaxBtn: document.getElementById("withdraw-max-btn"),
    withdrawPasteBtn: document.getElementById("withdraw-paste-btn")
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function parseAmount(value) {
    return Number(String(value || "").replace(",", ".").trim());
  }

  function formatMoney(value) {
    return `${Number(value || 0).toFixed(2)} USD`;
  }

  function setFeedback(element, message, isError = false) {
    if (!element) return;
    element.textContent = message || "";
    element.style.color = isError ? "#ff8c8c" : "";
  }

  function setDepositStatus(status) {
    if (!els.depositStatus) return;
    els.depositStatus.textContent = status || "Aucune transaction";
  }

  function stopDepositPolling() {
    if (state.depositPollId) {
      clearInterval(state.depositPollId);
      state.depositPollId = null;
    }
  }

  async function api(path, options = {}) {
    return window.AppApi.fetchJson(path, {
      ...options,
      headers: window.AppApi.authHeaders(options.headers)
    });
  }

  async function loadBalance() {
    if (!window.AppApi.getToken()) {
      els.userBalance.textContent = "0.00 USD";
      els.balanceStatus.textContent = "Connectez-vous pour charger votre solde.";
      return;
    }

    const payload = await api("/api/payments/balance", { method: "GET" });
    state.balance = Number(payload.data?.balance || 0);
    state.withdrawableBalance = Number(payload.data?.withdrawableBalance || state.balance);
    els.userBalance.textContent = formatMoney(state.balance);
    els.balanceStatus.textContent = `Retirable: ${formatMoney(state.withdrawableBalance)}`;
  }

  function renderPaymentDetails(data) {
    const paymentUrl = data.payment_url || data.paymentUrl || data.url || "";
    const invoiceId = data.invoice_id || data.track_id || "";
    const address = data.payment_address || data.address || "";
    const cryptoAmount = data.amount_crypto || data.pay_amount || "";

    els.paymentDetails.innerHTML = `
      <div class="instruction-placeholder">
        <p><strong>Facture:</strong> ${escapeHtml(invoiceId)}</p>
        <p><strong>Montant:</strong> ${formatMoney(data.amount_fiat)}${cryptoAmount ? ` (${escapeHtml(cryptoAmount)} ${escapeHtml(data.currency)})` : ""}</p>
        ${address ? `<p><strong>Adresse:</strong> ${escapeHtml(address)}</p>` : ""}
        ${paymentUrl ? `<a class="primary-btn" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener">Ouvrir la facture OxaPay</a>` : ""}
        <p>Le solde sera credite automatiquement quand OxaPay confirmera le paiement.</p>
      </div>
    `;
  }

  async function checkDepositStatus() {
    if (!state.depositInvoiceId) return;

    const payload = await api(`/api/payments/status/${encodeURIComponent(state.depositInvoiceId)}`, { method: "GET" });
    const data = payload.data || {};
    const status = String(data.status || "pending").toLowerCase();

    setDepositStatus(status);

    if (status === "paid" || status === "completed") {
      stopDepositPolling();
      setFeedback(els.depositFeedback, `Depot confirme. Solde credite: ${formatMoney(data.credited_total || data.amount_fiat)}.`);

      if (typeof data.balance === "number") {
        state.balance = data.balance;
        els.userBalance.textContent = formatMoney(state.balance);
      } else {
        await loadBalance();
      }
      return;
    }

    if (status === "expired" || status === "failed" || status === "rejected") {
      stopDepositPolling();
      setFeedback(els.depositFeedback, `Facture ${status}. Generez une nouvelle facture si besoin.`, true);
    }
  }

  async function handleDepositSubmit(event) {
    event.preventDefault();

    const amount = parseAmount(els.depositAmount.value);
    const crypto = els.depositCrypto.value;

    if (!window.AppApi.getToken()) {
      setFeedback(els.depositFeedback, "Connectez-vous avant de deposer.", true);
      return;
    }

    if (!Number.isFinite(amount) || amount < 0.5) {
      setFeedback(els.depositFeedback, "Montant minimum: 0.50 USD.", true);
      return;
    }

    stopDepositPolling();
    setFeedback(els.depositFeedback, "Generation de la facture OxaPay...");
    setDepositStatus("creation");

    try {
      const payload = await api("/api/payments/deposit", {
        method: "POST",
        body: JSON.stringify({ amount, crypto })
      });

      const data = payload.data || {};
      state.depositInvoiceId = data.invoice_id || data.track_id || "";

      renderPaymentDetails(data);
      setDepositStatus(data.status || "pending");
      setFeedback(els.depositFeedback, "Facture creee. Ouvrez le lien OxaPay puis revenez ici: le solde se mettra a jour apres confirmation.");

      if (state.depositInvoiceId) {
        state.depositPollId = setInterval(() => {
          checkDepositStatus().catch((error) => setFeedback(els.depositFeedback, error.message, true));
        }, 5000);
        await checkDepositStatus();
      }
    } catch (error) {
      setDepositStatus("erreur");
      setFeedback(els.depositFeedback, error.message || "Generation de facture impossible.", true);
    }
  }

  async function handleWithdrawSubmit(event) {
    event.preventDefault();

    const amount = parseAmount(els.withdrawAmount.value);
    const crypto = els.withdrawCrypto.value;
    const address = els.withdrawAddress.value.trim();
    const password = els.withdrawPassword.value;

    setFeedback(els.withdrawFeedback, "Creation de la demande de retrait...");

    try {
      const payload = await api("/api/payments/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount, crypto, address, password })
      });

      const data = payload.data || {};
      setFeedback(els.withdrawFeedback, payload.message || "Retrait cree.");
      els.withdrawStatusBox.innerHTML = `<strong>Etat du retrait</strong><p>${escapeHtml(data.status || "pending")}</p>`;
      els.withdrawRecipientBox.innerHTML = `<strong>Destinataire</strong><p>${escapeHtml(data.address || address)}</p><p>${escapeHtml(data.crypto || crypto)}</p>`;
      await loadBalance();
    } catch (error) {
      setFeedback(els.withdrawFeedback, error.message || "Retrait impossible.", true);
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
        document.querySelectorAll(".tab-section").forEach((section) => section.classList.toggle("active", section.id === `${button.dataset.tab}-panel`));
      });
    });
  }

  function bindQuickActions() {
    els.withdrawMinBtn?.addEventListener("click", () => {
      els.withdrawAmount.value = "0.50";
    });

    els.withdrawMaxBtn?.addEventListener("click", () => {
      els.withdrawAmount.value = Math.max(0, state.withdrawableBalance).toFixed(2);
    });

    els.withdrawPasteBtn?.addEventListener("click", async () => {
      try {
        els.withdrawAddress.value = await navigator.clipboard.readText();
      } catch (error) {
        setFeedback(els.withdrawFeedback, "Collage impossible depuis le navigateur.", true);
      }
    });
  }

  bindTabs();
  bindQuickActions();
  els.depositForm?.addEventListener("submit", handleDepositSubmit);
  els.withdrawForm?.addEventListener("submit", handleWithdrawSubmit);
  loadBalance().catch((error) => {
    els.balanceStatus.textContent = error.message || "Synchronisation impossible.";
  });
})();
