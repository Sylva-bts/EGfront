const soldeElement = document.getElementById("solde");
const messageElement = document.getElementById("message");
const container = document.querySelector(".container");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".form-panel");
const balanceCurrencySelect = document.getElementById("devise-solde");
const depositCurrencySelect = document.getElementById("devise-depot");
const ratesMetaElement = document.getElementById("rates-meta");
const depositButton = document.getElementById("btn-depot");
const historyListElement = document.getElementById("history-list");
const historyRefreshButton = document.getElementById("btn-history-refresh");
const GENIUSPAY_RETURN_POLL_ATTEMPTS = 10;
const GENIUSPAY_RETURN_POLL_DELAY_MS = 2500;
const GENIUSPAY_DEPOSIT_PATHS = [
  "/api/geniuspay/deposit",
  "/api/payments/geniuspay/deposit",
  "/api/payments/geniuspay/create"
];
const GENIUSPAY_STATUS_PATHS = [
  "/api/geniuspay/status",
  "/api/payments/geniuspay/status"
];

const state = {
  balanceUsd: 0,
  rates: { USD: 1, EUR: 0.92, XOF: 600 },
  ratesSource: "fallback"
};

if (container) {
  container.classList.add("show");
}

function switchTab(tabName) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${tabName}`));

  panels.forEach((panel) => {
    const isActive = panel.id === `form-${tabName}`;
    panel.classList.toggle("hidden", !isActive);
  });

  if (messageElement) {
    messageElement.textContent = "";
    messageElement.className = "";
  }
}

function getSelectedBalanceCurrency() {
  return String(balanceCurrencySelect?.value || "USD").toUpperCase();
}

function formatMoney(value, currency) {
  const normalizedCurrency = String(currency || "USD").toUpperCase();
  const locale = normalizedCurrency === "XOF" ? "fr-CI" : "fr-FR";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: normalizedCurrency === "XOF" ? 0 : 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getTransactionLabel(type) {
  const labels = {
    deposit: "Depot",
    withdraw: "Retrait",
    power_purchase: "Achat de pouvoir"
  };

  return labels[type] || "Transaction";
}

function getTransactionStatusLabel(status) {
  const labels = {
    pending: "en attente",
    paid: "paye",
    completed: "termine",
    rejected: "refuse",
    expired: "expire",
    failed: "echoue"
  };

  return labels[status] || status || "";
}

function getStatusClass(status) {
  return String(status || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function renderTransactionHistory(transactions) {
  if (!historyListElement) return;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    historyListElement.innerHTML = '<p class="history-empty">Aucun historique pour le moment.</p>';
    return;
  }

  historyListElement.innerHTML = transactions.map((transaction) => {
    const type = String(transaction.type || "");
    const status = String(transaction.status || "");
    const amount = Number(transaction.amount_fiat || 0);
    const signedAmount = type === "withdraw" || type === "power_purchase" ? -amount : amount;
    const amountText = `${signedAmount < 0 ? "-" : "+"}${formatMoney(Math.abs(signedAmount), "USD")}`;
    const dateText = formatDate(transaction.createdAt || transaction.updatedAt);
    return `
      <article class="history-item">
        <div class="history-title">${escapeHtml(getTransactionLabel(type))}</div>
        <div class="history-amount">${escapeHtml(amountText)}</div>
        <div class="history-date">${escapeHtml(dateText)}</div>
        <div class="history-status ${getStatusClass(status)}">${escapeHtml(getTransactionStatusLabel(status))}</div>
      </article>
    `;
  }).join("");
}

function convertFromUsd(amountUsd, currency) {
  const rate = Number(state.rates[currency] || 1);
  return Number((Number(amountUsd || 0) * rate).toFixed(currency === "XOF" ? 0 : 2));
}

function updateSolde() {
  if (!soldeElement) return;
  const currency = getSelectedBalanceCurrency();
  soldeElement.textContent = formatMoney(convertFromUsd(state.balanceUsd, currency), currency);
}

function showMessage(text, type = "") {
  if (!messageElement) return;
  messageElement.textContent = text;
  messageElement.className = type;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeGeniusPayCheckoutUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("//")) return `https:${rawUrl}`;

  try {
    return new URL(rawUrl, "https://geniuspay.ci/").href;
  } catch {
    return rawUrl;
  }
}

function setDepositLoading(isLoading) {
  if (!depositButton) return;
  depositButton.disabled = isLoading;
  depositButton.textContent = isLoading ? "Creation de la facture..." : "Payer maintenant";
}

function getApi() {
  if (!window.AppApi?.fetchJson) {
    throw new Error("API de l'application indisponible.");
  }

  return window.AppApi;
}

async function loadBalanceAndRates() {
  try {
    const api = getApi();
    let payload;

    try {
      payload = await api.fetchJson("/api/payments/rates", {
        headers: api.authHeaders()
      });
    } catch (ratesError) {
      const balancePayload = await api.fetchJson("/api/payments/balance", {
        headers: api.authHeaders()
      });
      const balanceData = balancePayload.data || {};

      payload = {
        data: {
          balance: {
            USD: Number(balanceData.balance || balanceData.withdrawableBalance || 0)
          },
          rates: state.rates,
          source: "secours"
        }
      };
    }

    const data = payload.data || {};
    state.balanceUsd = Number(data.balance?.USD || 0);
    state.rates = {
      USD: Number(data.rates?.USD || 1),
      EUR: Number(data.rates?.EUR || state.rates.EUR),
      XOF: Number(data.rates?.XOF || state.rates.XOF)
    };
    state.ratesSource = data.source || "serveur";

    updateSolde();
    if (ratesMetaElement) {
      ratesMetaElement.textContent = `Taux ${state.ratesSource}`;
    }
  } catch (error) {
    updateSolde();
    if (ratesMetaElement) {
      ratesMetaElement.textContent = "Taux de secours";
    }
    showMessage(error.message || "Impossible de charger le solde.", "error");
  }
}

async function loadTransactionHistory() {
  if (!historyListElement) return;

  try {
    const api = getApi();
    if (historyRefreshButton) {
      historyRefreshButton.disabled = true;
      historyRefreshButton.textContent = "Chargement...";
    }

    const payload = await api.fetchJson("/api/payments/transactions?limit=10", {
      headers: api.authHeaders()
    });

    renderTransactionHistory(payload.data?.transactions || []);
  } catch (error) {
    historyListElement.innerHTML = `<p class="history-empty">${escapeHtml(error.message || "Historique indisponible.")}</p>`;
  } finally {
    if (historyRefreshButton) {
      historyRefreshButton.disabled = false;
      historyRefreshButton.textContent = "Actualiser";
    }
  }
}

async function fetchGeniusPayStatus(orderId, reference) {
  const api = getApi();
  const query = new URLSearchParams();
  if (orderId) query.set("order_id", orderId);

  let lastError = null;

  for (const basePath of GENIUSPAY_STATUS_PATHS) {
    const statusPath = reference
      ? `${basePath}/${encodeURIComponent(reference)}${query.toString() ? `?${query.toString()}` : ""}`
      : `${basePath}${query.toString() ? `?${query.toString()}` : ""}`;

    try {
      return await api.fetchJson(statusPath, {
        headers: api.authHeaders()
      });
    } catch (error) {
      lastError = error;
      if (!isMissingRouteError(error)) {
        throw error;
      }
    }
  }

  throw new Error(lastError?.message || "Verification du paiement indisponible.");
}

function isMissingRouteError(error) {
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.status) === 404 || message.includes("route non trouve") || message.includes("route non trouv");
}

async function createGeniusPayDeposit(api, body) {
  let lastError = null;

  for (const path of GENIUSPAY_DEPOSIT_PATHS) {
    try {
      return await api.fetchJson(path, {
        method: "POST",
        headers: api.authHeaders(),
        body: JSON.stringify(body)
      });
    } catch (error) {
      lastError = error;
      if (!isMissingRouteError(error)) {
        throw error;
      }
    }
  }

  throw new Error(lastError?.message || "Paiement indisponible sur le backend de production.");
}

async function refreshReturnedGeniusPayPayment() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("provider") !== "geniuspay") return;

  const orderId = params.get("order_id") || "";
  const reference = params.get("reference") || "";
  const status = params.get("status") || "";

  if (!orderId && !reference) {
    if (status === "error") {
      showMessage("Le paiement n'a pas abouti.", "error");
    }
    return;
  }

  try {
    showMessage("Verification du paiement...", "");

    let payload = null;
    let paymentStatus = "";

    for (let attempt = 1; attempt <= GENIUSPAY_RETURN_POLL_ATTEMPTS; attempt += 1) {
      payload = await fetchGeniusPayStatus(orderId, reference);
      paymentStatus = String(payload.data?.status || "").toLowerCase();

      if (paymentStatus === "paid" || paymentStatus === "completed" || ["failed", "expired", "rejected"].includes(paymentStatus)) {
        break;
      }

      if (attempt < GENIUSPAY_RETURN_POLL_ATTEMPTS) {
        showMessage("Paiement en attente de confirmation...", "");
        await wait(GENIUSPAY_RETURN_POLL_DELAY_MS);
      }
    }

    await loadBalanceAndRates();
    await loadTransactionHistory();

    if (typeof payload?.data?.balance === "number") {
      state.balanceUsd = payload.data.balance;
      updateSolde();
    }

    if (paymentStatus === "paid" || paymentStatus === "completed") {
      const creditedTotal = Number(payload?.data?.credited_total || 0);
      const creditedText = creditedTotal > 0 ? ` Montant credite: ${formatMoney(creditedTotal, "USD")}.` : "";
      showMessage(`Depot confirme. Votre solde a ete mis a jour.${creditedText}`, "success");
    } else if (["failed", "expired", "rejected"].includes(paymentStatus)) {
      showMessage("Le paiement n'a pas ete valide.", "error");
    } else {
      showMessage("Paiement en attente de confirmation. Le solde sera mis a jour automatiquement apres validation.", "");
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    showMessage(error.message || "Verification du paiement impossible.", "error");
  }
}

async function effectuerDepot() {
  const tel = document.getElementById("tel-depot")?.value.trim() || "";
  const amount = Number(document.getElementById("montant-depot")?.value || 0);
  const currency = String(depositCurrencySelect?.value || "XOF").toUpperCase();

  if (!tel || !Number.isFinite(amount) || amount <= 0) {
    showMessage("Veuillez saisir un numero et un montant valides.", "error");
    return;
  }

  try {
    setDepositLoading(true);
    showMessage("Creation de la facture de paiement...", "");

    const api = getApi();
    const payload = await createGeniusPayDeposit(api, {
      phone: tel,
      amount,
      currency,
      country: "CI"
    });

    const checkoutUrl = normalizeGeniusPayCheckoutUrl(payload.data?.checkout_url || payload.data?.payment_url);
    if (!checkoutUrl) {
      throw new Error("Lien de paiement introuvable.");
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    setDepositLoading(false);
    showMessage(error.message || "Impossible de creer le depot.", "error");
  }
}

function effectuerRetrait() {
  showMessage("Les retraits ne sont disponibles qu'en Crypto Money pour l'instant.", "info");
}

balanceCurrencySelect?.addEventListener("change", updateSolde);

window.addEventListener("DOMContentLoaded", async () => {
  if (!window.AppApi?.getToken?.()) {
    showMessage("Connexion requise. Veuillez vous reconnecter.", "error");
    if (historyListElement) {
      historyListElement.innerHTML = '<p class="history-empty">Connectez-vous pour afficher vos historiques.</p>';
    }
    updateSolde();
    return;
  }

  await loadBalanceAndRates();
  await loadTransactionHistory();
  await refreshReturnedGeniusPayPayment();
});
