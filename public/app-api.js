(function attachAppApi() {
  const TOKEN_KEYS = ["token", "ghostrAuthToken"];
  const USER_KEY = "ghostrUser";
  const REFERRAL_KEY = "ghostrReferralCode";
  const META_API_BASE_SELECTOR = 'meta[name="ghostr-api-base-url"]';
  const DEFAULT_RENDER_API_BASE_URL = "https://egback-1.onrender.com";

  function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
  }

  function readMetaApiBaseUrl() {
    const meta = document.querySelector(META_API_BASE_SELECTOR);
    return normalizeBaseUrl(meta ? meta.getAttribute("content") : "");
  }

  function readWindowApiBaseUrl() {
    return normalizeBaseUrl(window.__APP_CONFIG__ && window.__APP_CONFIG__.apiBaseUrl);
  }

  function getApiBaseUrl() {
    const overrideUrl = normalizeBaseUrl(localStorage.getItem("ghostrApiBaseUrl"));
    const windowOverrideUrl = readWindowApiBaseUrl();
    const metaApiBaseUrl = readMetaApiBaseUrl();
    const hostname = window.location.hostname;

    if (overrideUrl) {
      return overrideUrl;
    }

    if (windowOverrideUrl) {
      return windowOverrideUrl;
    }

    if (metaApiBaseUrl) {
      return metaApiBaseUrl;
    }

    if (window.location.protocol === "file:") {
      return "http://localhost:5000";
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:5000";
    }

    return window.location.origin;
  }

  function addBaseUrlCandidate(baseUrls, candidate) {
    const normalizedCandidate = normalizeBaseUrl(candidate);

    if (!baseUrls.includes(normalizedCandidate)) {
      baseUrls.push(normalizedCandidate);
    }
  }

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = normalizeToken(localStorage.getItem(key));
      if (value && isJwtLikeToken(value)) {
        return value;
      }

      if (value) {
        localStorage.removeItem(key);
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
        localStorage.setItem(key, normalizedToken);
      } else {
        localStorage.removeItem(key);
      }
    });

    if (user && typeof user === "object") {
      setUser(user);
    }
  }

  function clearToken() {
    TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "{}") || {};
    } catch {
      localStorage.removeItem(USER_KEY);
      return {};
    }
  }

  function setUser(user) {
    const safeUser = user && typeof user === "object" ? user : {};
    if (safeUser.email || safeUser.username || safeUser.id) {
      localStorage.setItem(USER_KEY, JSON.stringify({
        id: safeUser.id || safeUser._id || "",
        username: safeUser.username || "",
        email: safeUser.email || ""
      }));
      return;
    }

    localStorage.removeItem(USER_KEY);
  }

  function getReferralCode() {
    return String(localStorage.getItem(REFERRAL_KEY) || "").trim().toUpperCase();
  }

  function setReferralCode(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();

    if (normalizedCode) {
      localStorage.setItem(REFERRAL_KEY, normalizedCode);
      return normalizedCode;
    }

    localStorage.removeItem(REFERRAL_KEY);
    return "";
  }

  function clearReferralCode() {
    localStorage.removeItem(REFERRAL_KEY);
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

  function isAuthError(status, payload) {
    const message = String((payload && (payload.message || payload.error)) || "");
    return status === 401 && /token|authentification|reconnecter|session|connexion requise|acces refuse|accès refusé/i.test(message);
  }

  function hasAuthorizationHeader(options) {
    const headers = options && options.headers ? options.headers : {};
    return Boolean(headers.Authorization || headers.authorization);
  }

  async function fetchJson(path, options) {
    const primaryBaseUrl = getApiBaseUrl();
    const baseUrls = [];
    const configuredRenderUrl = readMetaApiBaseUrl() || DEFAULT_RENDER_API_BASE_URL;

    addBaseUrlCandidate(baseUrls, primaryBaseUrl);

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
      addBaseUrlCandidate(baseUrls, "http://localhost:5000");
      addBaseUrlCandidate(baseUrls, "http://localhost:3000");
      addBaseUrlCandidate(baseUrls, configuredRenderUrl);
    } else {
      if (primaryBaseUrl !== configuredRenderUrl) {
        addBaseUrlCandidate(baseUrls, configuredRenderUrl);
      }
      if (window.location.protocol !== "file:") {
        addBaseUrlCandidate(baseUrls, window.location.origin);
      }
    }

    let lastPayload = {};
    let authFailureMessage = "";

    for (const baseUrl of baseUrls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, options || {});
        const payload = await response.json().catch(() => ({}));
        lastPayload = payload;

        if (!response.ok) {
          if (response.status === 404 && baseUrl !== baseUrls[baseUrls.length - 1]) {
            continue;
          }

          const noAuthRequest = !hasAuthorizationHeader(options);
          if (response.status === 401 && noAuthRequest && baseUrl !== baseUrls[baseUrls.length - 1]) {
            continue;
          }

          const canRetryRenderFallback = baseUrl !== configuredRenderUrl && baseUrls.includes(configuredRenderUrl);
          if (response.status >= 500 && canRetryRenderFallback) {
            continue;
          }

          if (isAuthError(response.status, payload)) {
            authFailureMessage = payload.message || payload.error || "Session invalide.";
            if (/token invalide|authentification|reconnecter|session/i.test(authFailureMessage)) {
              clearToken();
            }
            throw new Error(authFailureMessage);
          }

          const errorMessage = payload.message || payload.error || "Erreur serveur.";
          if (response.status === 401 && /token requis|acces refuse|accès refusé/i.test(errorMessage)) {
            throw new Error("Connexion requise. Veuillez vous reconnecter.");
          }

          throw new Error(errorMessage);
        }

        return payload;
      } catch (error) {
        if (authFailureMessage) {
          throw new Error(authFailureMessage);
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
