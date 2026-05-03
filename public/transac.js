(function initFinancePage() {
  const state = {
    depositInvoiceId: "",
    depositPollId: null,
    withdrawPollId: null,
    withdrawTransactionId: "",
    balance: 0,
    withdrawableBalance: 0,
    transactionPage: 1,
    transactionLimit: 30
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
    withdrawEmail: document.getElementById("withdraw-email"),
    withdrawPassword: document.getElementById("withdraw-password"),
    withdrawFeedback: document.getElementById("withdraw-feedback"),
    withdrawStatusBox: document.getElementById("withdraw-status-box"),
    withdrawRecipientBox: document.getElementById("withdraw-recipient-box"),
    withdrawMinBtn: document.getElementById("withdraw-min-btn"),
    withdrawMaxBtn: document.getElementById("withdraw-max-btn"),
    withdrawPasteBtn: document.getElementById("withdraw-paste-btn"),
    historyFilter: document.getElementById("history-filter"),
    historyRefreshBtn: document.getElementById("history-refresh-btn"),
    transactionList: document.getElementById("transaction-list"),
    historyFeedback: document.getElementById("history-feedback"),
    historyTotalCount: document.getElementById("history-total-count"),
    historyLastStatus: document.getElementById("history-last-status"),
    historyLastAmount: document.getElementById("history-last-amount")
  };

  const typeLabels = {
    deposit: "Depot",
    withdraw: "Retrait",
    power_purchase: "Achat pouvoir",
    game_bet: "Mise",
    game_cashout: "Gain",
    affiliate_credit: "Affiliation"
  };

  const statusLabels = {
    pending: "En attente",
    paid: "Paye",
    completed: "Termine",
    rejected: "Rejete",
    expired: "Expire",
    failed: "Echoue"
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

  function formatDate(value) {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function getTransactionSign(transaction) {
    if (transaction.type === "withdraw" || transaction.type === "game_bet" || transaction.type === "power_purchase") {
      return "-";
    }

    return "+";
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

  function loginMessage(action) {
    return `Connectez-vous avant de ${action}. Ouvrez connec.html puis revenez sur cette page.`;
  }

  function isTokenError(error) {
    return /token invalide|authentification|reconnecter|session invalide/i.test(String(error?.message || error || ""));
  }

  function friendlySessionMessage() {
    return "Session expiree. Pour un retrait, validez avec votre email et mot de passe ci-dessous.";
  }

  function hasSession() {
    return Boolean(window.AppApi.getToken());
  }

  function prefillAccountEmail() {
    const storedUser = window.AppApi.getUser ? window.AppApi.getUser() : {};
    if (els.withdrawEmail && storedUser.email && !els.withdrawEmail.value) {
      els.withdrawEmail.value = storedUser.email;
    }
  }

  function renderHistoryEmpty(message) {
    if (!els.transactionList) return;
    els.transactionList.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
  }

  function renderHistorySummary(transactions, pagination) {
    const latest = transactions[0];
    const total = pagination?.total ?? transactions.length;

    if (els.historyTotalCount) {
      els.historyTotalCount.textContent = String(total);
    }

    if (els.historyLastStatus) {
      els.historyLastStatus.textContent = latest ? (statusLabels[latest.status] || latest.status || "--") : "--";
    }

    if (els.historyLastAmount) {
      els.historyLastAmount.textContent = latest ? `${getTransactionSign(latest)}${formatMoney(latest.amount_fiat)}` : "-- USD";
    }
  }

  function renderTransactions(transactions, pagination) {
    renderHistorySummary(transactions, pagination);

    if (!transactions.length) {
      renderHistoryEmpty("Aucune transaction pour le moment.");
      return;
    }

    els.transactionList.innerHTML = transactions.map((transaction) => {
      const type = typeLabels[transaction.type] || transaction.type || "Transaction";
      const status = statusLabels[transaction.status] || transaction.status || "--";
      const sign = getTransactionSign(transaction);
      const crypto = transaction.crypto ? `<span>${escapeHtml(transaction.crypto)}</span>` : "";
      const reference = transaction.invoice_id || transaction.order_id || transaction.transaction_hash || transaction._id || "";

      return `
        <article class="transaction-item">
          <div class="transaction-main">
            <span class="transaction-type">${escapeHtml(type)}</span>
            <strong>${sign}${formatMoney(transaction.amount_fiat)}</strong>
            <small>${escapeHtml(formatDate(transaction.createdAt))}</small>
          </div>
          <div class="transaction-meta">
            <span class="status-pill status-${escapeHtml(transaction.status || "pending")}">${escapeHtml(status)}</span>
            ${crypto}
            ${reference ? `<span class="transaction-ref">Ref: ${escapeHtml(reference)}</span>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadTransactions({ allowLogoutOnAuthError = true } = {}) {
    if (!els.transactionList) return;

    if (!hasSession()) {
      renderHistorySummary([], { total: 0 });
      renderHistoryEmpty("Connectez-vous pour voir votre historique.");
      return;
    }

    const type = els.historyFilter?.value || "";
    const query = new URLSearchParams({
      limit: String(state.transactionLimit),
      page: String(state.transactionPage)
    });

    if (type) {
      query.set("type", type);
    }

    setFeedback(els.historyFeedback, "Chargement de l'historique...");

    try {
      const payload = await api(`/api/payments/transactions?${query.toString()}`, { method: "GET" });
      const data = payload.data || {};
      renderTransactions(data.transactions || [], data.pagination || {});
      setFeedback(els.historyFeedback, "");
    } catch (error) {
      renderHistoryEmpty("Historique indisponible.");
      if (isTokenError(error)) {
        if (allowLogoutOnAuthError) {
          window.AppApi.clearToken();
          setFeedback(els.historyFeedback, friendlySessionMessage(), true);
        } else {
          setFeedback(els.historyFeedback, friendlySessionMessage(), true);
        }
        return;
      }
      setFeedback(els.historyFeedback, error.message || "Impossible de charger l'historique.", true);
    }
  }

  function stopDepositPolling() {
    if (state.depositPollId) {
      clearInterval(state.depositPollId);
      state.depositPollId = null;
    }
  }

  function stopWithdrawPolling() {
    if (state.withdrawPollId) {
      clearInterval(state.withdrawPollId);
      state.withdrawPollId = null;
    }
  }

  async function api(path, options = {}) {
    return window.AppApi.fetchJson(path, {
      ...options,
      headers: window.AppApi.authHeaders(options.headers)
    });
  }

  async function apiNoAuth(path, options = {}) {
    return window.AppApi.fetchJson(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  }

  async function loadBalance({ allowLogoutOnAuthError = true } = {}) {
    if (!hasSession()) {
      els.userBalance.textContent = "0.00 USD";
      els.balanceStatus.textContent = "Connectez-vous pour charger votre solde.";
      return;
    }

    try {
      const payload = await api("/api/payments/balance", { method: "GET" });
      state.balance = Number(payload.data?.balance || 0);
      state.withdrawableBalance = Number(payload.data?.withdrawableBalance || state.balance);
      const withdrawalLockedBalance = Number(payload.data?.withdrawalLockedBalance || 0);
      els.userBalance.textContent = formatMoney(state.balance);
      els.balanceStatus.textContent = withdrawalLockedBalance > 0
        ? `Retirable: ${formatMoney(state.withdrawableBalance)} | En attente: ${formatMoney(withdrawalLockedBalance)}`
        : `Retirable: ${formatMoney(state.withdrawableBalance)}`;
    } catch (error) {
      if (isTokenError(error) && allowLogoutOnAuthError) {
        window.AppApi.clearToken();
        els.balanceStatus.textContent = friendlySessionMessage();
      }
      throw error;
    }
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
      await loadTransactions();
      return;
    }

    if (status === "expired" || status === "failed" || status === "rejected") {
      stopDepositPolling();
      setFeedback(els.depositFeedback, `Facture ${status}. Generez une nouvelle facture si besoin.`, true);
    }
  }

  function renderWithdrawStatus(data) {
    const status = String(data.status || "pending").toLowerCase();
    const statusLabel = statusLabels[status] || status;

    els.withdrawStatusBox.innerHTML = `
      <strong>Etat du retrait</strong>
      <p>${escapeHtml(statusLabel)}</p>
      ${typeof data.withdrawalLockedBalance === "number" && data.withdrawalLockedBalance > 0 ? `<p>Reserve: ${formatMoney(data.withdrawalLockedBalance)}</p>` : ""}
    `;

    els.withdrawRecipientBox.innerHTML = `
      <strong>Destinataire</strong>
      <p>${escapeHtml(data.address || els.withdrawAddress.value.trim())}</p>
      <p>${escapeHtml(data.crypto || els.withdrawCrypto.value || "USDT")} TRC20</p>
      ${data.payout_reference ? `<p>Reference: ${escapeHtml(data.payout_reference)}</p>` : ""}
      ${data.transaction_hash ? `<p>Hash: ${escapeHtml(data.transaction_hash)}</p>` : ""}
    `;
  }

  async function checkWithdrawStatus() {
    if (!state.withdrawTransactionId) return;

    const payload = await api(`/api/payments/withdraw/${encodeURIComponent(state.withdrawTransactionId)}`, { method: "GET" });
    const data = payload.data || {};
    const status = String(data.status || "pending").toLowerCase();

    renderWithdrawStatus(data);

    if (status === "completed") {
      stopWithdrawPolling();
      setFeedback(els.withdrawFeedback, "Retrait confirme.");
      await loadBalance();
      await loadTransactions();
      return;
    }

    if (status === "failed" || status === "rejected" || status === "expired") {
      stopWithdrawPolling();
      setFeedback(els.withdrawFeedback, "Retrait refuse par OxaPay. Le solde reserve a ete libere.", true);
      await loadBalance();
      await loadTransactions();
    }
  }

  async function handleDepositSubmit(event) {
    event.preventDefault();

    const amount = parseAmount(els.depositAmount.value);
    const crypto = els.depositCrypto.value;

    if (!hasSession()) {
      setFeedback(els.depositFeedback, loginMessage("deposer"), true);
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
      await loadTransactions();
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
    const email = els.withdrawEmail.value.trim().toLowerCase();
    const password = els.withdrawPassword.value;

    if (!email || !email.includes("@")) {
      setFeedback(els.withdrawFeedback, "Email du compte requis pour valider le retrait.", true);
      return;
    }

    if (!Number.isFinite(amount) || amount < 0.5) {
      setFeedback(els.withdrawFeedback, "Montant minimum: 0.50 USD.", true);
      return;
    }

    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      setFeedback(els.withdrawFeedback, "Adresse USDT TRC20 invalide.", true);
      return;
    }

    stopWithdrawPolling();
    setFeedback(els.withdrawFeedback, "Verification securisee et envoi automatique du retrait...");

    try {
      const payload = await apiNoAuth("/api/payments/withdraw/direct", {
        method: "POST",
        body: JSON.stringify({ amount, crypto, address, email, password })
      });

      const data = payload.data || {};
      if (payload.token) {
        window.AppApi.setToken(payload.token, payload.user);
      }
      state.withdrawTransactionId = data.transaction_id || "";
      setFeedback(els.withdrawFeedback, payload.message || "Demande de retrait creee.");
      renderWithdrawStatus(data);
      els.withdrawPassword.value = "";
      await loadBalance({ allowLogoutOnAuthError: false }).catch(() => {});
      await loadTransactions({ allowLogoutOnAuthError: false }).catch(() => {});

      if (state.withdrawTransactionId && String(data.status || "").toLowerCase() === "pending") {
        state.withdrawPollId = setInterval(() => {
          checkWithdrawStatus().catch((error) => setFeedback(els.withdrawFeedback, error.message, true));
        }, 5000);
      }
    } catch (error) {
      setFeedback(els.withdrawFeedback, error.message || "Retrait impossible.", true);
      await loadBalance({ allowLogoutOnAuthError: false }).catch(() => {});
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
  prefillAccountEmail();
  els.depositForm?.addEventListener("submit", handleDepositSubmit);
  els.withdrawForm?.addEventListener("submit", handleWithdrawSubmit);
  els.historyFilter?.addEventListener("change", loadTransactions);
  els.historyRefreshBtn?.addEventListener("click", loadTransactions);
  loadBalance().catch((error) => {
    if (isTokenError(error)) {
      window.AppApi.clearToken();
      els.balanceStatus.textContent = friendlySessionMessage();
      return;
    }
    els.balanceStatus.textContent = error.message || "Synchronisation impossible.";
  });
  loadTransactions().catch((error) => setFeedback(els.historyFeedback, error.message, true));
})();
