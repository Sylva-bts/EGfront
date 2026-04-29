(function attachAppApi() {
  const TOKEN_KEYS = ["token", "ghostrAuthToken"];
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
    const hostname = window.location.hostname;

    if (overrideUrl) {
      return overrideUrl;
    }

    if (windowOverrideUrl) {
      return windowOverrideUrl;
    }

    if (window.location.protocol === "file:") {
      return "http://localhost:5000";
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return window.location.origin;
    }

    return "";
  }

  function addBaseUrlCandidate(baseUrls, candidate) {
    const normalizedCandidate = normalizeBaseUrl(candidate);

    if (!baseUrls.includes(normalizedCandidate)) {
      baseUrls.push(normalizedCandidate);
    }
  }

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) {
        return value;
      }
    }
    return "";
  }

  function setToken(token) {
    TOKEN_KEYS.forEach((key) => {
      if (token) {
        localStorage.setItem(key, token);
      } else {
        localStorage.removeItem(key);
      }
    });
  }

  function clearToken() {
    TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
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

  async function fetchJson(path, options) {
    const primaryBaseUrl = getApiBaseUrl();
    const baseUrls = [];
    const configuredRenderUrl = readMetaApiBaseUrl() || DEFAULT_RENDER_API_BASE_URL;

    addBaseUrlCandidate(baseUrls, primaryBaseUrl);

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      ["http://localhost:5000", "http://localhost:3000"].forEach((candidate) => {
        addBaseUrlCandidate(baseUrls, candidate);
      });
    } else if (primaryBaseUrl !== configuredRenderUrl) {
      addBaseUrlCandidate(baseUrls, configuredRenderUrl);
    }

    let lastPayload = {};

    for (const baseUrl of baseUrls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, options || {});
        const payload = await response.json().catch(() => ({}));
        lastPayload = payload;

        if (!response.ok) {
          if (response.status === 404 && baseUrl !== baseUrls[baseUrls.length - 1]) {
            continue;
          }

          throw new Error(payload.message || payload.error || "Erreur serveur.");
        }

        return payload;
      } catch (error) {
        if (baseUrl === baseUrls[baseUrls.length - 1]) {
          if (isLikelyNetworkError(error)) {
            throw new Error(buildNetworkErrorMessage(baseUrls));
          }
          throw new Error(lastPayload.message || lastPayload.error || error.message || "Erreur serveur.");
        }
      }
    }
  }

  window.AppApi = {
    TOKEN_KEYS,
    REFERRAL_KEY,
    getApiBaseUrl,
    getToken,
    setToken,
    clearToken,
    getReferralCode,
    setReferralCode,
    clearReferralCode,
    authHeaders,
    fetchJson
  };
})();
