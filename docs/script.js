const soldeElement = document.getElementById("solde");
const messageElement = document.getElementById("message");
const container = document.querySelector(".container");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".form-panel");
const balanceCurrencySelect = document.getElementById("devise-solde");
const depositCurrencySelect = document.getElementById("devise-depot");
const ratesMetaElement = document.getElementById("rates-meta");
const depositButton = document.getElementById("btn-depot");
const GENIUSPAY_RETURN_POLL_ATTEMPTS = 6;
const GENIUSPAY_RETURN_POLL_DELAY_MS = 2500;

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
  depositButton.textContent = isLoading ? "Creation de la facture..." : "Payer avec GeniusPay";
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

async function fetchGeniusPayStatus(orderId, reference) {
  const api = getApi();
  const query = new URLSearchParams();
  if (orderId) query.set("order_id", orderId);

  const statusPath = reference
    ? `/api/payments/geniuspay/status/${encodeURIComponent(reference)}?${query.toString()}`
    : `/api/payments/geniuspay/status?${query.toString()}`;

  return api.fetchJson(statusPath, {
    headers: api.authHeaders()
  });
}

async function refreshReturnedGeniusPayPayment() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("provider") !== "geniuspay") return;

  const orderId = params.get("order_id") || "";
  const reference = params.get("reference") || "";
  const status = params.get("status") || "";

  if (!orderId && !reference) {
    if (status === "error") {
      showMessage("Le paiement GeniusPay n'a pas abouti.", "error");
    }
    return;
  }

  try {
    showMessage("Verification du paiement GeniusPay...", "");

    let payload = null;
    let paymentStatus = "";

    for (let attempt = 1; attempt <= GENIUSPAY_RETURN_POLL_ATTEMPTS; attempt += 1) {
      payload = await fetchGeniusPayStatus(orderId, reference);
      paymentStatus = String(payload.data?.status || "").toLowerCase();

      if (paymentStatus === "paid" || paymentStatus === "completed" || ["failed", "expired", "rejected"].includes(paymentStatus)) {
        break;
      }

      if (attempt < GENIUSPAY_RETURN_POLL_ATTEMPTS) {
        showMessage("Paiement en attente de confirmation GeniusPay...", "");
        await wait(GENIUSPAY_RETURN_POLL_DELAY_MS);
      }
    }

    await loadBalanceAndRates();

    if (typeof payload?.data?.balance === "number") {
      state.balanceUsd = payload.data.balance;
      updateSolde();
    }

    if (paymentStatus === "paid" || paymentStatus === "completed") {
      const creditedTotal = Number(payload?.data?.credited_total || 0);
      const creditedText = creditedTotal > 0 ? ` Montant credite: ${formatMoney(creditedTotal, "USD")}.` : "";
      showMessage(`Depot confirme. Votre solde a ete mis a jour.${creditedText}`, "success");
    } else if (["failed", "expired", "rejected"].includes(paymentStatus)) {
      showMessage("Le paiement GeniusPay n'a pas ete valide.", "error");
    } else {
      showMessage("Paiement en attente de confirmation GeniusPay. Le solde sera mis a jour automatiquement apres validation.", "");
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    showMessage(error.message || "Verification GeniusPay impossible.", "error");
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
    showMessage("Creation de la facture GeniusPay...", "");

    const api = getApi();
    const payload = await api.fetchJson("/api/payments/geniuspay/deposit", {
      method: "POST",
      headers: api.authHeaders(),
      body: JSON.stringify({
        phone: tel,
        amount,
        currency,
        country: "CI"
      })
    });

    const checkoutUrl = normalizeGeniusPayCheckoutUrl(payload.data?.checkout_url || payload.data?.payment_url);
    if (!checkoutUrl) {
      throw new Error("Lien GeniusPay introuvable.");
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    setDepositLoading(false);
    showMessage(error.message || "Impossible de creer le depot GeniusPay.", "error");
  }
}

function effectuerRetrait() {
  showMessage("Les retraits ne sont disponibles qu'en Crypto Money pour l'instant.", "info");
}

balanceCurrencySelect?.addEventListener("change", updateSolde);

window.addEventListener("DOMContentLoaded", async () => {
  if (!window.AppApi?.getToken?.()) {
    showMessage("Connexion requise. Veuillez vous reconnecter.", "error");
    updateSolde();
    return;
  }

  await loadBalanceAndRates();
  await refreshReturnedGeniusPayPayment();
});
