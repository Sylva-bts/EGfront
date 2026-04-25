let Img = document.querySelector(".img");
let soldeSpan = document.querySelector("#Solde span");
let coteSpan = document.querySelector("#cote span");

let Stick = document.getElementById("stick0");
let Stick1 = document.getElementById("stick1");
let Ghost = document.getElementById("Ghost");
let miseEl = document.getElementById("Mise");
let historyEl = document.getElementById("Story");
let worldFeedEl = document.getElementById("world-feed");
let worldChatMessagesEl = document.getElementById("world-chat-messages");
let worldChatFormEl = document.getElementById("world-chat-form");
let worldChatInputEl = document.getElementById("world-chat-input");
let powerAuthStatusEl = document.getElementById("power-auth-status");
let profileToggleEl = document.getElementById("profile-toggle");
let profilePanelEl = document.getElementById("profile-panel");
let profileCloseEl = document.getElementById("profile-close");
let profileFormEl = document.getElementById("profile-form");
let profileUsernameEl = document.getElementById("profile-username");
let profileBalanceEl = document.getElementById("profile-balance");
let profileEmailEl = document.getElementById("profile-email");
let profileCurrentPasswordEl = document.getElementById("profile-current-password");
let profileNewPasswordEl = document.getElementById("profile-new-password");
let profileLogoutEl = document.getElementById("profile-logout");
const ghostDefaultSrc = Ghost.getAttribute("src");
const ghostFrozenSrc = "ima/Gost_froid.png";
const APPARITION_AUDIO_SRC = "audio/ApparutionEffet.mpeg";
const PERTE_AUDIO_SRC = "audio/perteEffet.mpeg";
const JEU_MUSIQUE_SRC = "audio/jeuMusique.mpeg";

const apparitionAudio = new Audio(APPARITION_AUDIO_SRC);
const perteAudio = new Audio(PERTE_AUDIO_SRC);
const jeuMusiqueAudio = new Audio(JEU_MUSIQUE_SRC);

jeuMusiqueAudio.loop = true;
jeuMusiqueAudio.volume = 0.35;
apparitionAudio.volume = 0.8;
perteAudio.volume = 0.9;

let coteIni = 1.0;
let vitesse = 1070;
let vitesseMin = 80;
let acceleration = 70;
let jeuEnCours = false;
let gelUsed = false;
let bouclierUsed = false;
let secChanceUsed = false;
let secChanceAvailable = false;
let secondChanceTimeoutId;
let endGameTimeoutId;
let visionUsed = false;
let bouclierActive = false;
let bouclierTimeoutId;
let backgroundStyleInjected = false;
let glowStyleInjected = false;
let shieldStylesInjected = false;
let accountLoading = false;
let betRequestPending = false;
let cashoutRequestPending = false;

let gelBtn = document.getElementById("btn-gel");
let bouclierBtn = document.getElementById("btn-bouclier");
let secChanceBtn = document.getElementById("btn-sec-chance");
let visionBtn = document.getElementById("btn-vision");

const powerState = {
  token: window.AppApi.getToken(),
  user: null,
  powers: {
    freeze: 0,
    shield: 0,
    second_chance: 0,
    vision: 0
  }
};

const POWER_META = {
  freeze: { button: gelBtn, emoji: "❄️" },
  shield: { button: bouclierBtn, emoji: "🛡️" },
  second_chance: { button: secChanceBtn, emoji: "🍀" },
  vision: { button: visionBtn, emoji: "👀" }
};

let pouuf;
let mise = 0;
let gameInterval;
let ghostPos = 0;
let notificationTimeoutId;
let worldRefreshIntervalId;
let worldApiUnavailable = false;
let gameRuntimeConfig = null;

const WORLD_ACTIVITY_KEY = "ghostrWorldActivity";
const WORLD_CHAT_KEY = "ghostrWorldChat";
const WORLD_ACTIVITY_LIMIT = 20;
const WORLD_CHAT_LIMIT = 40;
const WORLD_CHAT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

if (!localStorage.getItem("gameHistory")) {
  localStorage.setItem("gameHistory", JSON.stringify([]));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} USD`;
}

function formatWorldTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function playAudio(audio, { restart = true } = {}) {
  if (!audio) return;

  if (restart) {
    audio.currentTime = 0;
  }

  audio.play().catch(() => {});
}

function stopAudio(audio, { reset = false } = {}) {
  if (!audio) return;

  audio.pause();
  if (reset) {
    audio.currentTime = 0;
  }
}

function getDefaultRuntimeConfig() {
  return {
    features: {
      worldChatEnabled: true
    },
    ghost: {
      lowChance: 50,
      mediumChance: 30,
      highChance: 10,
      extremeChance: 10,
      lowRange: [1, 2],
      mediumRange: [2, 4],
      highRange: [4, 10],
      extremeRange: [10, 30],
      forcedCrashValue: null
    }
  };
}

function getForcedCrashValue() {
  const forcedCrashValue = Number(gameRuntimeConfig?.ghost?.forcedCrashValue);
  return Number.isFinite(forcedCrashValue) && forcedCrashValue >= 1 ? forcedCrashValue : null;
}

function isForcedCrashActive() {
  return getForcedCrashValue() !== null;
}

function randomInRange(range, fallbackMin, fallbackMax) {
  const min = Number(Array.isArray(range) ? range[0] : fallbackMin);
  const max = Number(Array.isArray(range) ? range[1] : fallbackMax);
  const safeMin = Number.isFinite(min) ? min : fallbackMin;
  const safeMax = Number.isFinite(max) ? max : fallbackMax;
  return (Math.random() * Math.max(0.01, safeMax - safeMin)) + safeMin;
}

async function loadGameRuntimeConfig() {
  try {
    const payload = await window.AppApi.fetchJson("/api/game/runtime", {
      method: "GET",
      headers: getPowerHeaders()
    });
    gameRuntimeConfig = {
      ...getDefaultRuntimeConfig(),
      ...(payload || {}),
      ghost: {
        ...getDefaultRuntimeConfig().ghost,
        ...(payload?.ghost || {})
      },
      features: {
        ...getDefaultRuntimeConfig().features,
        ...(payload?.features || {})
      }
    };
  } catch (error) {
    gameRuntimeConfig = getDefaultRuntimeConfig();
  }

  refreshPowerButtons();
}

function readWorldStore(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    const safeItems = Array.isArray(parsed) ? parsed : [];

    if (key === WORLD_CHAT_KEY) {
      return pruneExpiredWorldChatMessages(safeItems);
    }

    return safeItems;
  } catch (error) {
    return [];
  }
}

function writeWorldStore(key, items, limit) {
  let safeItems = Array.isArray(items) ? items.slice(0, limit) : [];

  if (key === WORLD_CHAT_KEY) {
    safeItems = pruneExpiredWorldChatMessages(safeItems);
  }

  localStorage.setItem(key, JSON.stringify(safeItems));
}

function isWorldChatMessageExpired(item) {
  const createdAt = item?.createdAt ? new Date(item.createdAt).getTime() : NaN;
  if (!Number.isFinite(createdAt)) return true;
  return (Date.now() - createdAt) > WORLD_CHAT_MAX_AGE_MS;
}

function pruneExpiredWorldChatMessages(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !isWorldChatMessageExpired(item));
}

function getCurrentUsername() {
  return powerState.user?.username || profileUsernameEl?.value?.trim() || "Joueur";
}

function appendLocalWorldActivity(item) {
  const items = readWorldStore(WORLD_ACTIVITY_KEY);
  items.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...item
  });
  writeWorldStore(WORLD_ACTIVITY_KEY, items, WORLD_ACTIVITY_LIMIT);
}

function appendLocalWorldChatMessage(message) {
  const items = pruneExpiredWorldChatMessages(readWorldStore(WORLD_CHAT_KEY));
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: getCurrentUsername(),
    message,
    createdAt: new Date().toISOString()
  });
  writeWorldStore(WORLD_CHAT_KEY, items.slice(-WORLD_CHAT_LIMIT), WORLD_CHAT_LIMIT);
}

Ghost.style.display = "none";
Stick.style.display = "none";
Stick1.style.display = "block";

function setPowerStatus(message, isError = false) {
  if (!powerAuthStatusEl) return;
  powerAuthStatusEl.textContent = message;
  powerAuthStatusEl.style.color = isError ? "#ff8686" : "";
}

function setDisplayedBalance(amount) {
  soldeSpan.textContent = Number(amount || 0).toFixed(2);
}

function getDisplayedBalance() {
  return Number(soldeSpan.textContent || 0);
}

function toSuperscript(value) {
  const superscriptDigits = { "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
  return String(value).split("").map((digit) => superscriptDigits[digit] || digit).join("");
}

function updateSinglePowerButton(powerKey) {
  const meta = POWER_META[powerKey];
  if (!meta || !meta.button) return;

  const units = powerState.powers[powerKey] ?? 0;
  const forcedCrashActive = isForcedCrashActive();
  meta.button.textContent = `${meta.emoji}${toSuperscript(units)}`;

  const shouldDisable = !powerState.token
    || forcedCrashActive
    || units <= 0
    || (powerKey === "freeze" && (!jeuEnCours || gelUsed))
    || (powerKey === "shield" && (!jeuEnCours || bouclierUsed || bouclierActive))
    || (powerKey === "vision" && (!jeuEnCours || visionUsed))
    || (powerKey === "second_chance" && (!secChanceAvailable || secChanceUsed));

  meta.button.disabled = shouldDisable;
  meta.button.style.opacity = shouldDisable ? "0.5" : "1";
  meta.button.style.cursor = shouldDisable ? "not-allowed" : "pointer";
  meta.button.title = "";

  if (powerKey === "second_chance") {
    meta.button.style.display = secChanceAvailable ? "block" : "none";
  }
}

function refreshPowerButtons() {
  Object.keys(POWER_META).forEach(updateSinglePowerButton);
}

function fillProfileForm(user) {
  if (!profileFormEl) return;
  profileUsernameEl.value = user?.username || "";
  profileEmailEl.value = user?.email || "";
  profileBalanceEl.value = typeof user?.balance === "number" ? `${user.balance.toFixed(2)} USD` : "0.00 USD";
  profileCurrentPasswordEl.value = "";
  profileNewPasswordEl.value = "";
}

function setProfilePanelOpen(isOpen) {
  if (!profilePanelEl || !profileToggleEl) return;
  profilePanelEl.hidden = !isOpen;
  profileToggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function getPowerHeaders() {
  return window.AppApi.authHeaders();
}

async function powerApiFetch(path, options = {}) {
  return window.AppApi.fetchJson(path, options);
}

async function refreshAccountFromServer(showStatus = true) {
  if (accountLoading) return;
  accountLoading = true;
  powerState.token = window.AppApi.getToken();

  if (!powerState.token) {
    powerState.user = null;
    powerState.powers = { freeze: 0, shield: 0, second_chance: 0, vision: 0 };
    setDisplayedBalance(0);
    fillProfileForm(null);
    refreshPowerButtons();
    if (showStatus) {
      setPowerStatus("Connectez-vous depuis connec.html pour synchroniser le compte.", true);
    }
    accountLoading = false;
    return;
  }

  try {
    const payload = await powerApiFetch("/api/me", {
      method: "GET",
      headers: getPowerHeaders()
    });

    powerState.user = payload.user;
    powerState.powers = payload.user.powers || { freeze: 0, shield: 0, second_chance: 0, vision: 0 };
    setDisplayedBalance(payload.user.balance || 0);
    fillProfileForm(payload.user);
    refreshPowerButtons();
    if (showStatus) {
      setPowerStatus(`Compte synchronise: ${payload.user.username}`);
    }
  } catch (error) {
    powerState.token = "";
    powerState.user = null;
    window.AppApi.clearToken();
    powerState.powers = { freeze: 0, shield: 0, second_chance: 0, vision: 0 };
    setDisplayedBalance(0);
    fillProfileForm(null);
    refreshPowerButtons();
    setPowerStatus(error.message, true);
  } finally {
    accountLoading = false;
  }
}

async function saveProfile(event) {
  event.preventDefault();

  if (!window.AppApi.getToken()) {
    setPowerStatus("Connectez-vous avant de modifier le profil.", true);
    return;
  }

  try {
    const payload = await powerApiFetch("/api/auth/profile", {
      method: "PATCH",
      headers: getPowerHeaders(),
      body: JSON.stringify({
        username: profileUsernameEl.value.trim(),
        email: profileEmailEl.value.trim(),
        currentPassword: profileCurrentPasswordEl.value,
        newPassword: profileNewPasswordEl.value
      })
    });

    if (payload.token) {
      window.AppApi.setToken(payload.token);
      powerState.token = payload.token;
    }

    powerState.user = payload.user;
    powerState.powers = payload.user.powers || powerState.powers;
    setDisplayedBalance(payload.user.balance || 0);
    fillProfileForm(payload.user);
    refreshPowerButtons();
    setPowerStatus("Profil mis a jour avec succes.");
  } catch (error) {
    setPowerStatus(error.message, true);
  }
}

function logoutProfile() {
  window.AppApi.clearToken();
  powerState.token = "";
  powerState.user = null;
  powerState.powers = { freeze: 0, shield: 0, second_chance: 0, vision: 0 };
  setDisplayedBalance(0);
  fillProfileForm(null);
  refreshPowerButtons();
  setProfilePanelOpen(false);
  setPowerStatus("Session fermee. Connectez-vous a nouveau pour jouer.", true);
}

async function debitGameBalance(amount) {
  const payload = await powerApiFetch("/api/game/debit", {
    method: "POST",
    headers: getPowerHeaders(),
    body: JSON.stringify({ amount })
  });
  setDisplayedBalance(payload.user.balance);
  return payload;
}

async function creditGameBalance(amount) {
  const payload = await powerApiFetch("/api/game/credit", {
    method: "POST",
    headers: getPowerHeaders(),
    body: JSON.stringify({ amount })
  });
  setDisplayedBalance(payload.user.balance);
  return payload;
}

async function fetchWorldActivity() {
  if (worldApiUnavailable) {
    return { items: readWorldStore(WORLD_ACTIVITY_KEY) };
  }

  return window.AppApi.fetchJson("/api/world/activity", {
    method: "GET",
    headers: { Accept: "application/json" }
  });
}

async function fetchWorldChat() {
  if (worldApiUnavailable) {
    return { items: readWorldStore(WORLD_CHAT_KEY) };
  }

  return window.AppApi.fetchJson("/api/world/chat", {
    method: "GET",
    headers: { Accept: "application/json" }
  });
}

async function sendWorldChatMessage(message) {
  if (worldApiUnavailable) {
    appendLocalWorldChatMessage(message);
    return { item: readWorldStore(WORLD_CHAT_KEY).slice(-1)[0] };
  }

  try {
    return await window.AppApi.fetchJson("/api/world/chat", {
      method: "POST",
      headers: getPowerHeaders(),
      body: JSON.stringify({ message })
    });
  } catch (error) {
    if (/route non trouv/i.test(error.message) || /not found/i.test(error.message)) {
      worldApiUnavailable = true;
      appendLocalWorldChatMessage(message);
      return { item: readWorldStore(WORLD_CHAT_KEY).slice(-1)[0] };
    }
    throw error;
  }
}

function renderWorldActivity(items) {
  if (!worldFeedEl) return;

  if (!Array.isArray(items) || items.length === 0) {
    worldFeedEl.innerHTML = '<p class="world-empty">Aucune mise publique pour le moment.</p>';
    return;
  }

  worldFeedEl.innerHTML = items.map((item) => {
    const itemType = item.type === "gain" ? "gain" : "bet";
    const gainLine = itemType === "gain"
      ? `<strong>Gain:</strong> ${formatMoney(item.gain)}`
      : `<strong>Gain:</strong> En attente`;
    const multiplierLine = item.multiplier ? ` | <strong>Cote:</strong> x${Number(item.multiplier).toFixed(2)}` : "";

    return `
      <article class="world-feed-item">
        <div class="world-feed-top">
          <span class="world-player">${escapeHtml(item.username || "Joueur")}</span>
          <span class="world-badge ${itemType}">${itemType === "gain" ? "Gain" : "Mise"}</span>
        </div>
        <div class="world-feed-values">
          <strong>Mise:</strong> ${formatMoney(item.betAmount)} | ${gainLine}${multiplierLine}
        </div>
        <div class="world-time">${formatWorldTimestamp(item.createdAt)}</div>
      </article>
    `;
  }).join("");
}

function renderWorldChat(items) {
  if (!worldChatMessagesEl) return;

  const freshItems = pruneExpiredWorldChatMessages(items);

  if (!Array.isArray(freshItems) || freshItems.length === 0) {
    worldChatMessagesEl.innerHTML = '<p class="world-empty">Aucun message pour le moment.</p>';
    return;
  }

  worldChatMessagesEl.innerHTML = freshItems.map((item) => `
    <article class="world-chat-item">
      <div class="world-chat-top">
        <span class="world-player">${escapeHtml(item.username || "Joueur")}</span>
        <span class="world-time">${formatWorldTimestamp(item.createdAt)}</span>
      </div>
      <div class="world-chat-text">${escapeHtml(item.message || "")}</div>
    </article>
  `).join("");
  worldChatMessagesEl.scrollTop = worldChatMessagesEl.scrollHeight;
}

async function refreshWorldPanels() {
  try {
    await loadGameRuntimeConfig();
    const [activityPayload, chatPayload] = await Promise.all([
      fetchWorldActivity(),
      fetchWorldChat()
    ]);

    renderWorldActivity(activityPayload.items || []);
    renderWorldChat(pruneExpiredWorldChatMessages(chatPayload.items || []));

    if (worldChatInputEl) {
      const chatEnabled = gameRuntimeConfig?.features?.worldChatEnabled !== false;
      worldChatInputEl.disabled = !chatEnabled;
      worldChatInputEl.placeholder = chatEnabled ? "Votre message..." : "Chat monde desactive";
    }
  } catch (error) {
    worldApiUnavailable = true;
    renderWorldActivity(readWorldStore(WORLD_ACTIVITY_KEY));
    renderWorldChat(readWorldStore(WORLD_CHAT_KEY));
  }
}

function startWorldRefreshLoop() {
  if (worldRefreshIntervalId) {
    clearInterval(worldRefreshIntervalId);
  }

  refreshWorldPanels();
  worldRefreshIntervalId = setInterval(refreshWorldPanels, 4000);
}

async function refreshPowersFromServer() {
  await refreshAccountFromServer(true);
}

async function consumePower(powerKey) {
  if (!powerState.token) {
    setPowerStatus("Connexion requise avant usage.", true);
    return false;
  }

  const forcedCrashValue = getForcedCrashValue();
  if (forcedCrashValue !== null) {
    setPowerStatus("pouvoir indisponible", true);
    refreshPowerButtons();
    return false;
  }

  try {
    const payload = await powerApiFetch("/api/use-power", {
      method: "POST",
      headers: getPowerHeaders(),
      body: JSON.stringify({ powerKey })
    });
    powerState.powers = payload.powers;
    if (typeof payload.balance === "number") {
      setDisplayedBalance(payload.balance);
    }
    refreshPowerButtons();
    return true;
  } catch (error) {
    setPowerStatus(error.message, true);
    await refreshAccountFromServer(false);
    return false;
  }
}

async function Gel() {
  if (!jeuEnCours || gelUsed) return;
  const consumed = await consumePower("freeze");
  if (!consumed) return;

  gelUsed = true;
  window.gelActive = true;
  pouuf += 0.35;
  Ghost.src = ghostFrozenSrc;
  Ghost.style.filter = "brightness(1.05)";
  refreshPowerButtons();

  setTimeout(() => {
    window.gelActive = false;
    Ghost.src = ghostDefaultSrc;
    Ghost.style.filter = "";
    refreshPowerButtons();
  }, 3000);
}

async function Bouclier() {
  if (!jeuEnCours || bouclierUsed || bouclierActive) return;
  const consumed = await consumePower("shield");
  if (!consumed) return;

  bouclierUsed = true;
  bouclierActive = true;
  window.bouclierActive = true;
  ensureShieldStyles();
  Stick.classList.add("shield-active");
  showGameNotification("Bouclier actif", "info");
  notifyShieldStatus("active");
  refreshPowerButtons();

  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
  }

  bouclierTimeoutId = setTimeout(() => {
    deactivateShield("expired");
  }, 5000);
}

async function Vision() {
  if (!jeuEnCours || visionUsed) return;
  const consumed = await consumePower("vision");
  if (!consumed) return;

  visionUsed = true;
  const dangerGap = pouuf - coteIni;
  const showDanger = dangerGap > 0 && dangerGap <= 0.2;
  refreshPowerButtons();

  if (!showDanger) return;

  ensureGlowStyle();
  Img.style.boxShadow = "0 0 28px rgba(168, 85, 247, 0.85), inset 0 0 24px rgba(126, 34, 206, 0.45)";
  Img.style.border = "3px solid rgba(196, 181, 253, 0.95)";
  Img.style.animation = "visionDangerGlow 0.9s ease-in-out infinite alternate";

  setTimeout(() => {
    Img.style.boxShadow = "";
    Img.style.border = "";
    Img.style.animation = "";
  }, 2000);
}

function showSecondChanceWindow() {
  secChanceAvailable = true;
  refreshPowerButtons();

  if (secondChanceTimeoutId) {
    clearTimeout(secondChanceTimeoutId);
  }

  secondChanceTimeoutId = setTimeout(() => {
    secChanceAvailable = false;
    refreshPowerButtons();
  }, 2000);
}

async function SecondeChance() {
  if (!secChanceAvailable || secChanceUsed) return;
  const consumed = await consumePower("second_chance");
  if (!consumed) return;

  secChanceUsed = true;
  secChanceAvailable = false;

  if (secondChanceTimeoutId) {
    clearTimeout(secondChanceTimeoutId);
    secondChanceTimeoutId = undefined;
  }
  if (endGameTimeoutId) {
    clearTimeout(endGameTimeoutId);
    endGameTimeoutId = undefined;
  }

  refreshPowerButtons();
  GameOn();
}

(function initBackgroundStyles() {
  const baseStyle = document.createElement("style");
  baseStyle.textContent = `
    .img {
      background: linear-gradient(to bottom,
        #3a3a4a 0%,
        #4a5a6a 10%,
        #5a7a8a 20%,
        #b89080 50%,
        #d4a574 60%,
        #e8b899 70%,
        #c0b8a8 80%,
        #8b7355 90%,
        #6b5344 100%);
      position: relative;
      overflow: hidden;
    }

    .img::before {
      content: "";
      position: absolute;
      top: 35%;
      left: 45%;
      width: 80px;
      height: 80px;
      background: radial-gradient(circle at 35% 35%, #e8a068, #c87840 40%, #a85820 100%);
      border-radius: 50%;
      filter: blur(6px);
      opacity: 0.6;
    }
  `;
  document.head.appendChild(baseStyle);
})();

function ensureGlowStyle() {
  if (glowStyleInjected) return;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes glow {
      0% { box-shadow: 0 0 30px rgba(255,0,0,0.8), inset 0 0 20px rgba(255,0,0,0.3); }
      100% { box-shadow: 0 0 50px rgba(255,0,0,1), inset 0 0 30px rgba(255,0,0,0.5); }
    }

    @keyframes visionDangerGlow {
      0% {
        box-shadow: 0 0 20px rgba(168, 85, 247, 0.65), inset 0 0 18px rgba(126, 34, 206, 0.25);
      }
      100% {
        box-shadow: 0 0 40px rgba(192, 132, 252, 0.95), inset 0 0 30px rgba(147, 51, 234, 0.5);
      }
    }
  `;
  document.head.appendChild(style);
  glowStyleInjected = true;
}

function ensureShieldStyles() {
  if (shieldStylesInjected) return;

  const style = document.createElement("style");
  style.textContent = `
    .stick.shield-active {
      border-radius: 50%;
      filter: drop-shadow(0 0 12px #40ffaa);
      box-shadow: 0 0 0 8px rgba(64,255,170,0.18), 0 0 30px rgba(64,255,170,0.65);
      animation: shieldPulse 0.9s ease-in-out infinite alternate;
    }

    .stick.shield-break {
      animation: shieldBreak 0.45s ease-out forwards;
    }

    .game-toast {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      padding: 10px 14px;
      border-radius: 999px;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .game-toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    .game-toast.info {
      background: rgba(20, 140, 110, 0.92);
      box-shadow: 0 0 18px rgba(64,255,170,0.28);
    }

    .game-toast.warn {
      background: rgba(200, 50, 50, 0.92);
      box-shadow: 0 0 18px rgba(255,90,90,0.3);
    }

    @keyframes shieldPulse {
      from {
        box-shadow: 0 0 0 6px rgba(64,255,170,0.12), 0 0 18px rgba(64,255,170,0.45);
      }
      to {
        box-shadow: 0 0 0 12px rgba(64,255,170,0.2), 0 0 34px rgba(64,255,170,0.78);
      }
    }

    @keyframes shieldBreak {
      0% {
        transform: scale(1);
        opacity: 1;
        box-shadow: 0 0 0 12px rgba(64,255,170,0.6), 0 0 40px rgba(255,255,255,0.95);
      }
      100% {
        transform: scale(1.22);
        opacity: 0.35;
        box-shadow: 0 0 0 28px rgba(255,120,120,0), 0 0 0 rgba(255,255,255,0);
      }
    }
  `;
  document.head.appendChild(style);
  shieldStylesInjected = true;
}

function showGameNotification(message, type = "info") {
  ensureShieldStyles();

  let toast = document.querySelector(".game-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "game-toast";
    document.querySelector(".cadreJeux").appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `game-toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  if (notificationTimeoutId) {
    clearTimeout(notificationTimeoutId);
  }

  notificationTimeoutId = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function notifyShieldStatus(status) {
  window.dispatchEvent(new CustomEvent("ghost:shield-status", {
    detail: {
      status,
      cote: coteIni,
      mise
    }
  }));
}

function deactivateShield(reason) {
  if (!bouclierActive) return;

  bouclierActive = false;
  window.bouclierActive = false;

  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
    bouclierTimeoutId = undefined;
  }

  Stick.classList.remove("shield-active");

  if (reason === "blocked") {
    Stick.classList.add("shield-break");
    showGameNotification("Bouclier brise", "warn");
    notifyShieldStatus("blocked");
    setTimeout(() => {
      Stick.classList.remove("shield-break");
    }, 500);
  } else {
    showGameNotification("Bouclier expire", "warn");
    notifyShieldStatus("expired");
  }

  refreshPowerButtons();
}

function getNextDangerCote(currentCote) {
  let nextCote = currentCote;

  while (nextCote <= currentCote) {
    nextCote = tirerCote();
  }

  return nextCote;
}

window.addEventListener("load", () => {
  loadHistory();
  loadGameRuntimeConfig().finally(() => {
    refreshWorldPanels();
  });
  refreshAccountFromServer(true);
  startWorldRefreshLoop();
});

window.addEventListener("storage", (event) => {
  if (window.AppApi.TOKEN_KEYS.includes(event.key)) {
    refreshAccountFromServer(true);
  }
});

async function Miser() {
  if (betRequestPending || jeuEnCours) return;

  powerState.token = window.AppApi.getToken();
  mise = Number(miseEl.value);
  const solde = getDisplayedBalance();

  if (!powerState.token) {
    alert("Connectez-vous d'abord depuis connec.html");
    setPowerStatus("Session requise pour jouer.", true);
    return;
  }

  if (!Number.isFinite(mise) || mise < 2) {
    alert("Mise minimale: 2");
    return;
  }

  if (mise > solde) {
    alert("Solde insuffisant");
    return;
  }

  try {
    betRequestPending = true;
    await debitGameBalance(mise);
    if (worldApiUnavailable) {
      appendLocalWorldActivity({
        type: "bet",
        username: getCurrentUsername(),
        betAmount: mise,
        gain: 0,
        multiplier: 0
      });
    }
    await refreshWorldPanels();
    GameOn();
  } catch (error) {
    alert(error.message);
    setPowerStatus(error.message, true);
    await refreshAccountFromServer(false);
  } finally {
    betRequestPending = false;
  }
}

function GameOn() {
  clearInterval(gameInterval);
  alert("Mise acceptee");

  secChanceUsed = false;
  secChanceAvailable = false;
  if (secondChanceTimeoutId) {
    clearTimeout(secondChanceTimeoutId);
    secondChanceTimeoutId = undefined;
  }
  if (endGameTimeoutId) {
    clearTimeout(endGameTimeoutId);
    endGameTimeoutId = undefined;
  }

  coteIni = 1.0;
  vitesse = 1010;
  jeuEnCours = true;
  gelUsed = false;
  bouclierUsed = false;
  visionUsed = false;
  bouclierActive = false;
  window.bouclierActive = false;
  window.gelActive = false;
  Stick.classList.remove("shield-active", "shield-break");
  Ghost.src = ghostDefaultSrc;
  Ghost.style.filter = "";

  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
    bouclierTimeoutId = undefined;
  }

  refreshPowerButtons();

  pouuf = tirerCote();
  updateCote(coteIni);
  start();
  augmenterCote();
}

function start() {
  Stick.style.display = "block";
  Ghost.style.display = "block";
  Stick1.style.display = "none";
  Stick.style.pointerEvents = "none";
  Stick.style.opacity = "1";
  Stick.style.filter = "none";
  ghostPos = 0;
  Ghost.style.position = "absolute";
  Ghost.style.right = `${ghostPos}px`;

  playAudio(apparitionAudio);
  playAudio(jeuMusiqueAudio, { restart: true });

  gameInterval = setInterval(() => {
    if (!window.gelActive) {
      ghostPos += 0.05;
      Ghost.style.right = `${ghostPos}px`;
    }

    if (ghostPos >= 150) {
      ghostPos = 150;
      Ghost.style.right = `${ghostPos}px`;
    }

    if (coteIni >= pouuf && window.bouclierActive) {
      deactivateShield("blocked");
      pouuf = getNextDangerCote(coteIni + 0.01);
      return;
    }

    if (coteIni >= pouuf) {
      clearInterval(gameInterval);
      stopAudio(jeuMusiqueAudio, { reset: true });
      playAudio(perteAudio);
      showSecondChanceWindow();
      ghostPos = 250;
      Ghost.style.right = `${ghostPos}px`;
      Stick.style.pointerEvents = "none";
      Stick.style.opacity = "0.5";
      Stick.style.filter = "grayscale(100%)";
      Stick.style.background = "red";

      endGameTimeoutId = setTimeout(() => {
        Ghost.style.display = "none";
        Stick.style.display = "none";
        Stick1.style.display = "block";
        jeuEnCours = false;
        refreshPowerButtons();
        if (!secChanceUsed) {
          saveTransaction("Perte", -mise, coteIni);
        }
      }, 5000);

      return;
    }
    animeBack();
  }, 10);
}

function augmenterCote() {
  if (!jeuEnCours) return;

  coteIni += 0.01;
  updateCote(coteIni);

  if (coteIni >= pouuf) {
    if (window.bouclierActive) {
      vitesse = Math.max(vitesseMin, vitesse - acceleration);
      setTimeout(augmenterCote, vitesse);
      return;
    }
    jeuEnCours = false;
    refreshPowerButtons();
    return;
  }

  vitesse = Math.max(vitesseMin, vitesse - acceleration);
  setTimeout(augmenterCote, vitesse);
}

function updateCote(valeur) {
  coteSpan.textContent = valeur.toFixed(2);
}

async function retrait() {
  if (!jeuEnCours || cashoutRequestPending) return;

  jeuEnCours = false;
  clearInterval(gameInterval);
  stopAudio(jeuMusiqueAudio, { reset: true });
  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
    bouclierTimeoutId = undefined;
  }
  bouclierActive = false;
  window.bouclierActive = false;
  Stick.classList.remove("shield-active", "shield-break");
  Ghost.style.display = "none";
  Stick.style.display = "none";
  Stick1.style.display = "block";
  refreshPowerButtons();

  const gain = Number((mise * coteIni).toFixed(2));

  try {
    cashoutRequestPending = true;
    await window.AppApi.fetchJson("/api/game/credit", {
      method: "POST",
      headers: getPowerHeaders(),
      body: JSON.stringify({
        amount: gain,
        betAmount: mise,
        multiplier: Number(coteIni.toFixed(2))
      })
    }).then((payload) => {
      setDisplayedBalance(payload.user.balance);
      return payload;
    });
    if (worldApiUnavailable) {
      appendLocalWorldActivity({
        type: "gain",
        username: getCurrentUsername(),
        betAmount: mise,
        gain,
        multiplier: Number(coteIni.toFixed(2))
      });
    }
    alert(`Retrait valide a x${coteIni.toFixed(2)}`);
    saveTransaction("Gain", gain, coteIni);
    await refreshWorldPanels();
  } catch (error) {
    alert(error.message);
    setPowerStatus(error.message, true);
    await refreshAccountFromServer(false);
  } finally {
    cashoutRequestPending = false;
  }
}

function tirerCote() {
  const runtime = gameRuntimeConfig || getDefaultRuntimeConfig();
  const ghost = runtime.ghost || {};
  const forcedCrashValue = Number(ghost.forcedCrashValue);

  if (Number.isFinite(forcedCrashValue) && forcedCrashValue >= 1) {
    return forcedCrashValue;
  }

  const rand = Math.random() * 100;
  const lowChance = Number(ghost.lowChance || 50);
  const mediumChance = Number(ghost.mediumChance || 30);
  const highChance = Number(ghost.highChance || 10);
  const lowLimit = lowChance;
  const mediumLimit = lowLimit + mediumChance;
  const highLimit = mediumLimit + highChance;

  if (rand < lowLimit) {
    return randomInRange(ghost.lowRange, 1, 2);
  }

  if (rand < mediumLimit) {
    return randomInRange(ghost.mediumRange, 2, 4);
  }

  if (rand < highLimit) {
    return randomInRange(ghost.highRange, 4, 10);
  }

  return randomInRange(ghost.extremeRange, 10, 30);
}

function animeBack() {
  if (backgroundStyleInjected) return;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes StarsScroll {
      from {
        background-position: 0 0;
      }
      to {
        background-position: 300px 0;
      }
    }

    .img::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 85%;
      background-image:
        radial-gradient(1.5px 1.5px at 10px 20px, #f0f0f0, rgba(255,255,255,0)),
        radial-gradient(1px 1px at 40px 50px, #ffffff, rgba(255,255,255,0)),
        radial-gradient(1.5px 1.5px at 90px 30px, #f8f8f8, rgba(255,255,255,0)),
        radial-gradient(1px 1px at 130px 70px, #ffffff, rgba(255,255,255,0)),
        radial-gradient(1.5px 1.5px at 70px 10px, #f0f0f0, rgba(255,255,255,0)),
        radial-gradient(1px 1px at 150px 40px, #ffffff, rgba(255,255,255,0)),
        radial-gradient(1.5px 1.5px at 30px 80px, #f8f8f8, rgba(255,255,255,0)),
        radial-gradient(1px 1px at 170px 80px, #ffffff, rgba(255,255,255,0));
      background-repeat: repeat;
      background-size: 200px 100px;
      background-position: 0 0;
      animation: StarsScroll 15s linear infinite;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
  backgroundStyleInjected = true;
}

function saveTransaction(type, montant, cote) {
  let history = JSON.parse(localStorage.getItem("gameHistory")) || [];

  let transaction = {
    type,
    montant,
    cote,
    timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  };

  history.push(transaction);
  localStorage.setItem("gameHistory", JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  let history = JSON.parse(localStorage.getItem("gameHistory")) || [];

  if (history.length === 0) {
    historyEl.innerHTML = '<h3>Historique des transactions</h3><p style="text-align: center; color: #888; padding: 20px;">Aucune transaction</p>';
    return;
  }

  let html = "<h3>Historique</h3>";

  for (let i = history.length - 1; i >= 0; i -= 1) {
    let transaction = history[i];
    let amountClass = transaction.type === "Gain" ? "gain" : "perte";
    let icon = transaction.type === "Gain" ? "OK" : "KO";
    let amount = transaction.type === "Gain" ? `+${transaction.montant.toFixed(2)}` : transaction.montant.toFixed(2);

    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <span class="transaction-type">${icon} ${transaction.type} (x${transaction.cote.toFixed(2)})</span>
          <span class="transaction-amount ${amountClass}">${amount} USD</span>
        </div>
        <div class="transaction-time">${transaction.timestamp}</div>
      </div>
    `;
  }

  html += '<button class="btn-clear-history" onclick="clearHistory()">Effacer l\'historique</button>';
  historyEl.innerHTML = html;
}

function clearHistory() {
  if (confirm("Etes-vous sur de vouloir effacer tout l'historique ?")) {
    localStorage.setItem("gameHistory", JSON.stringify([]));
    loadHistory();
  }
}

if (profileToggleEl) {
  profileToggleEl.addEventListener("click", () => {
    setProfilePanelOpen(profilePanelEl.hidden);
  });
}

if (profileCloseEl) {
  profileCloseEl.addEventListener("click", () => {
    setProfilePanelOpen(false);
  });
}

if (profileFormEl) {
  profileFormEl.addEventListener("submit", saveProfile);
}

if (profileLogoutEl) {
  profileLogoutEl.addEventListener("click", logoutProfile);
}

if (worldChatFormEl) {
  worldChatFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = String(worldChatInputEl?.value || "").trim();
    if (!message) return;

    if (!window.AppApi.getToken()) {
      alert("Connectez-vous pour envoyer un message dans le chat monde.");
      return;
    }

    try {
      await sendWorldChatMessage(message);
      worldChatInputEl.value = "";
      await refreshWorldPanels();
    } catch (error) {
      alert(error.message);
    }
  });
}
