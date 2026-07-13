(function attachAppApi() {
  const TOKEN_KEYS = ["token", "ghostrAuthToken"];
  const USER_KEY = "ghostrUser";
  const REFERRAL_KEY = "ghostrReferralCode";
  const API_BASE_URL_KEY = "ghostrApiBaseUrl";
  const PHANTOM_SIGNUP_BALANCE = 1000;
  const DEFAULT_REMOTE_API_BASE_URL = "https://egback-1.onrender.com";

  function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
  }

  function readWindowApiBaseUrl() {
    const configUrl = window.__APP_CONFIG__ && window.__APP_CONFIG__.apiBaseUrl;
    const metaUrl = document.querySelector('meta[name="ghostr-api-base-url"]')?.getAttribute("content");
    return normalizeBaseUrl(configUrl || metaUrl);
  }

  function getStorageAreas() {
    const areas = [];
    for (const name of ["localStorage", "sessionStorage"]) {
      try {
        if (window[name]) {
          areas.push(window[name]);
        }
      } catch {
        // Storage can throw on access in restrictive browser modes.
      }
    }
    return areas;
  }

  function readStoredValue(key) {
    for (const storage of getStorageAreas()) {
      try {
        const value = storage.getItem(key);
        if (value) {
          return value;
        }
      } catch {
        // Some browser privacy modes can block one storage area; try the next one.
      }
    }
    return "";
  }

  function writeStoredValue(key, value) {
    let stored = false;
    for (const storage of getStorageAreas()) {
      try {
        storage.setItem(key, value);
        stored = true;
      } catch {
        // Keep trying other storage areas.
      }
    }
    return stored;
  }

  function removeStoredValue(key) {
    for (const storage of getStorageAreas()) {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore blocked storage.
      }
    }
  }

  function getApiBaseUrl() {
    const overrideUrl = normalizeBaseUrl(readStoredValue(API_BASE_URL_KEY));
    const windowOverrideUrl = readWindowApiBaseUrl();
    const hostname = window.location.hostname;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    const defaultRemoteApiHostname = new URL(DEFAULT_REMOTE_API_BASE_URL).hostname;

    if (overrideUrl) {
      return overrideUrl;
    }

    if (windowOverrideUrl) {
      return windowOverrideUrl;
    }

    if (window.location.protocol === "file:") {
      return "http://localhost:3000";
    }

    if (isLocalHost) {
      return window.location.origin || "http://localhost:3000";
    }

    if (hostname && hostname !== defaultRemoteApiHostname) {
      return DEFAULT_REMOTE_API_BASE_URL;
    }

    if (window.location.origin) {
      return window.location.origin;
    }

    return window.location.origin;
  }

  function addBaseUrlCandidate(baseUrls, candidate) {
    const normalizedCandidate = normalizeBaseUrl(candidate);

    if (normalizedCandidate && !baseUrls.includes(normalizedCandidate)) {
      baseUrls.push(normalizedCandidate);
    }
  }

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = normalizeToken(readStoredValue(key));
      if (value && isJwtLikeToken(value)) {
        return value;
      }

      if (value) {
        removeStoredValue(key);
      }
    }
    return "";
  }

  function normalizeToken(token) {
    return String(token || "").trim().replace(/^Bearer\s+/i, "").trim();
  }

  function isJwtLikeToken(token) {
    return String(token || "").split(".").length === 3;
  }

  function setToken(token, user) {
    const normalizedToken = normalizeToken(token);

    TOKEN_KEYS.forEach((key) => {
      if (normalizedToken && isJwtLikeToken(normalizedToken)) {
        writeStoredValue(key, normalizedToken);
      } else {
        removeStoredValue(key);
      }
    });

    if (user && typeof user === "object") {
      setUser(user);
    }
  }

  function clearToken() {
    TOKEN_KEYS.forEach((key) => removeStoredValue(key));
  }

  function getUser() {
    try {
      return JSON.parse(readStoredValue(USER_KEY) || "{}") || {};
    } catch {
      removeStoredValue(USER_KEY);
      return {};
    }
  }

  function setUser(user) {
    const safeUser = user && typeof user === "object" ? user : {};
    if (safeUser.email || safeUser.username || safeUser.id) {
      const storedUser = {
        id: safeUser.id || safeUser._id || "",
        username: safeUser.username || "",
        email: safeUser.email || ""
      };

      if (typeof safeUser.balance === "number") {
        storedUser.balance = safeUser.balance;
      }

      if (safeUser.affiliation && typeof safeUser.affiliation === "object") {
        storedUser.affiliation = safeUser.affiliation;
      }

      if (safeUser.powers && typeof safeUser.powers === "object") {
        storedUser.powers = safeUser.powers;
      }

      writeStoredValue(USER_KEY, JSON.stringify(storedUser));
      return;
    }

    removeStoredValue(USER_KEY);
  }

  function isPhantomSignupBalance(user) {
    if (!user || Number(user.balance) !== PHANTOM_SIGNUP_BALANCE) {
      return false;
    }

    const affiliation = user.affiliation || {};
    const affiliateValues = [
      affiliation.totalEarned,
      affiliation.lockedBalance,
      affiliation.unlockedTotal,
      affiliation.wageringProgress,
      affiliation.wageringRemaining
    ];

    return affiliateValues.every((value) => Number(value || 0) === 0);
  }

  function normalizeUserBalance(user) {
    if (!user || typeof user !== "object") {
      return user;
    }

    if (!isPhantomSignupBalance(user)) {
      return user;
    }

    const normalizedUser = {
      ...user,
      balance: 0
    };

    if (user.affiliation && typeof user.affiliation === "object") {
      normalizedUser.affiliation = {
        ...user.affiliation,
        withdrawableBalance: 0
      };
    }

    return normalizedUser;
  }

  function normalizePayload(path, payload) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }

    const normalizedPayload = { ...payload };

    if (normalizedPayload.user) {
      normalizedPayload.user = normalizeUserBalance(normalizedPayload.user);
    }

    if (normalizedPayload.data && typeof normalizedPayload.data === "object") {
      const normalizedData = { ...normalizedPayload.data };
      if (Number(normalizedData.balance) === PHANTOM_SIGNUP_BALANCE && String(path || "").includes("/api/payments/balance")) {
        normalizedData.balance = 0;
        normalizedData.withdrawableBalance = 0;
      }
      normalizedPayload.data = normalizedData;
    }

    return normalizedPayload;
  }

  function getReferralCode() {
    return String(readStoredValue(REFERRAL_KEY) || "").trim().toUpperCase();
  }

  function setReferralCode(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();

    if (normalizedCode) {
      writeStoredValue(REFERRAL_KEY, normalizedCode);
      return normalizedCode;
    }

    removeStoredValue(REFERRAL_KEY);
    return "";
  }

  function clearReferralCode() {
    removeStoredValue(REFERRAL_KEY);
  }

  function authHeaders(extraHeaders) {
    const token = getToken();
    return {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  function isLikelyNetworkError(error) {
    const message = String(error && error.message ? error.message : "").toLowerCase();
    return message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed");
  }

  function buildNetworkErrorMessage(baseUrls) {
    const candidates = baseUrls.map((value) => value || window.location.origin);
    const list = candidates.length ? candidates.join(" ou ") : window.location.origin;
    return `Impossible de contacter l'API. Verifiez le proxy Netlify, l'URL Render et le demarrage du backend (${list}).`;
  }

  function rememberApiBaseUrl(baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    if (normalizedBaseUrl) {
      writeStoredValue(API_BASE_URL_KEY, normalizedBaseUrl);
    }
  }

  async function readJsonResponse(response) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const text = await response.text().catch(() => "");

    if (!text) {
      return {};
    }

    if (!contentType.includes("application/json")) {
      const error = new Error("Reponse API invalide: le serveur a renvoye du HTML au lieu du JSON.");
      error.isNonJsonResponse = true;
      error.status = response.status;
      throw error;
    }

    try {
      return JSON.parse(text);
    } catch {
      const error = new Error("Reponse API invalide: JSON illisible.");
      error.isNonJsonResponse = true;
      error.status = response.status;
      throw error;
    }
  }

  function isAuthError(status, payload) {
    const message = String((payload && (payload.message || payload.error)) || "");
    return status === 401 && /token|authentification|reconnecter|session|connexion requise|acces refuse|accès refusé/i.test(message);
  }

  function hasAuthorizationHeader(options) {
    const headers = options && options.headers ? options.headers : {};
    return Boolean(headers.Authorization || headers.authorization);
  }

  function createHttpError(message, status) {
    const error = new Error(message || "Erreur serveur.");
    error.isHttpResponseError = true;
    error.status = status;
    return error;
  }

  async function fetchJson(path, options) {
    const primaryBaseUrl = getApiBaseUrl();
    const baseUrls = [];
    const configuredApiBaseUrl = readWindowApiBaseUrl();
    const storedApiBaseUrl = normalizeBaseUrl(readStoredValue(API_BASE_URL_KEY));

    addBaseUrlCandidate(baseUrls, primaryBaseUrl);
    addBaseUrlCandidate(baseUrls, configuredApiBaseUrl);
    addBaseUrlCandidate(baseUrls, storedApiBaseUrl);

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
      addBaseUrlCandidate(baseUrls, "http://localhost:3000");
      addBaseUrlCandidate(baseUrls, "http://localhost:5000");
    } else {
      addBaseUrlCandidate(baseUrls, DEFAULT_REMOTE_API_BASE_URL);
      if (window.location.protocol !== "file:") {
        addBaseUrlCandidate(baseUrls, window.location.origin);
      }
    }

    let lastPayload = {};
    let authFailureMessage = "";

    for (const baseUrl of baseUrls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, options || {});
        const payload = await readJsonResponse(response);
        lastPayload = payload;

        if (!response.ok) {
          if (response.status === 404 && baseUrl !== baseUrls[baseUrls.length - 1]) {
            continue;
          }

          const noAuthRequest = !hasAuthorizationHeader(options);
          if (response.status === 401 && noAuthRequest && baseUrl !== baseUrls[baseUrls.length - 1]) {
            continue;
          }

          if (isAuthError(response.status, payload)) {
            authFailureMessage = payload.message || payload.error || "Session invalide.";
            if (/token invalide|authentification|reconnecter|session/i.test(authFailureMessage)) {
              clearToken();
            }
            throw createHttpError(authFailureMessage, response.status);
          }

          const errorMessage = payload.message || payload.error || "Erreur serveur.";
          if (response.status === 401 && /token requis|acces refuse|accès refusé/i.test(errorMessage)) {
            throw createHttpError("Connexion requise. Veuillez vous reconnecter.", response.status);
          }

          throw createHttpError(errorMessage, response.status);
        }

        rememberApiBaseUrl(baseUrl);
        return normalizePayload(path, payload);
      } catch (error) {
        if (authFailureMessage) {
          throw new Error(authFailureMessage);
        }

        if (error && error.isHttpResponseError) {
          throw error;
        }

        if (error && error.isNonJsonResponse && baseUrl !== baseUrls[baseUrls.length - 1]) {
          continue;
        }

        if (baseUrl === baseUrls[baseUrls.length - 1]) {
          if (isLikelyNetworkError(error)) {
            throw new Error(buildNetworkErrorMessage(baseUrls));
          }
          throw new Error(authFailureMessage || lastPayload.message || lastPayload.error || error.message || "Erreur serveur.");
        }
      }
    }
  }

  window.AppApi = {
    TOKEN_KEYS,
    USER_KEY,
    REFERRAL_KEY,
    API_BASE_URL_KEY,
    getApiBaseUrl,
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    getReferralCode,
    setReferralCode,
    clearReferralCode,
    authHeaders,
    fetchJson
  };
})();
