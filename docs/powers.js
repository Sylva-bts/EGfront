const authStatusEl = document.getElementById("auth-status");
const walletBalanceEl = document.getElementById("wallet-balance");
const buyButtons = [...document.querySelectorAll("[data-power][data-method]")];
const stockLabels = [...document.querySelectorAll("[data-stock]")];
const priceLabels = [...document.querySelectorAll("[data-power-price]")];
const nameLabels = [...document.querySelectorAll("[data-power-name]")];

const storeState = {
  token: window.AppApi.getToken(),
  user: null,
  catalog: {}
};

function setStoreStatus(message, isError = false) {
  if (!authStatusEl) return;
  authStatusEl.textContent = message;
  authStatusEl.style.color = isError ? "#ff8686" : "";
}

function renderStoreUser() {
  const balance = storeState.user?.balance;
  walletBalanceEl.textContent = typeof balance === "number"
    ? `Solde global: ${balance.toFixed(2)} USD`
    : "Solde global: -- USD";

  const powers = storeState.user?.powers || {};
  stockLabels.forEach((label) => {
    const powerKey = label.dataset.stock;
    label.textContent = `Unites: ${powers[powerKey] ?? 0}`;
  });

  const enabled = Boolean(storeState.token && storeState.user);
  buyButtons.forEach((button) => {
    button.disabled = !enabled;
    button.style.opacity = enabled ? "1" : "0.5";
    button.style.cursor = enabled ? "pointer" : "not-allowed";
  });
}

function renderCatalog() {
  priceLabels.forEach((label) => {
    const powerKey = label.dataset.powerPrice;
    const power = storeState.catalog?.[powerKey];
    if (!power) return;

    label.innerHTML = `<strong>${Number(power.priceUsd || 0).toFixed(2)} USD</strong> pour ${Number(power.units || 0)} utilisations`;
  });

  nameLabels.forEach((label) => {
    const powerKey = label.dataset.powerName;
    const power = storeState.catalog?.[powerKey];
    if (!power?.name) return;
    label.textContent = power.name;
  });
}

async function refreshStoreUser() {
  storeState.token = window.AppApi.getToken();

  if (!storeState.token) {
    storeState.user = null;
    storeState.catalog = {};
    renderStoreUser();
    setStoreStatus("Aucune session active. Connectez-vous d'abord depuis connec.html.", true);
    return;
  }

  try {
    const payload = await window.AppApi.fetchJson("/api/me", {
      method: "GET",
      headers: window.AppApi.authHeaders()
    });

    storeState.user = payload.user;
    storeState.catalog = payload.catalog || {};
    renderCatalog();
    renderStoreUser();
    setStoreStatus(`Bienvenue ${payload.user.username}. Vous pouvez acheter directement.`);
  } catch (error) {
    storeState.user = null;
    storeState.catalog = {};
    window.AppApi.clearToken();
    renderCatalog();
    renderStoreUser();
    setStoreStatus(error.message, true);
  }
}

async function buyPower(powerKey, paymentMethod) {
  if (!window.AppApi.getToken()) {
    setStoreStatus("Session introuvable. Connectez-vous avant un achat.", true);
    return;
  }

  setStoreStatus(`Traitement de l'achat ${powerKey} via ${paymentMethod}...`);

  try {
    const payload = await window.AppApi.fetchJson("/api/buy-power", {
      method: "POST",
      headers: window.AppApi.authHeaders(),
      body: JSON.stringify({ powerKey, paymentMethod })
    });

    const paymentUrl = payload.paymentUrl || payload.payment_url || payload.url || payload.checkout_url;

    if (paymentMethod === "oxapay" && paymentUrl) {
      setStoreStatus("Redirection vers OxaPay...");
      window.location.href = paymentUrl;
      return;
    }

    if (paymentMethod === "oxapay" && !paymentUrl) {
      throw new Error("OxaPay n'a pas renvoye de lien de paiement.");
    } else {
      setStoreStatus("Achat confirme.");
    }

    await refreshStoreUser();
  } catch (error) {
    setStoreStatus(error.message, true);
  }
}

buyButtons.forEach((button) => {
  button.addEventListener("click", () => buyPower(button.dataset.power, button.dataset.method));
});

window.addEventListener("storage", (event) => {
  if (window.AppApi.TOKEN_KEYS.includes(event.key)) {
    refreshStoreUser();
  }
});

renderStoreUser();
renderCatalog();
refreshStoreUser();
