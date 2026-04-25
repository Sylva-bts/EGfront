(function initAdminPanel() {
  const ADMIN_TOKEN_KEY = "escapeGhostAdminToken";
  const state = {
    token: localStorage.getItem(ADMIN_TOKEN_KEY) || "",
    admin: null,
    dashboard: null,
    settings: null,
    users: [],
    selectedUser: null,
    transactions: [],
    logs: [],
    alerts: []
  };
  let alertsIntervalId = null;

  const els = {
    loginShell: document.getElementById("admin-login-shell"),
    shell: document.getElementById("admin-shell"),
    loginForm: document.getElementById("admin-login-form"),
    loginStatus: document.getElementById("admin-login-status"),
    profileLabel: document.getElementById("admin-profile-label"),
    alertsCount: document.getElementById("alerts-count"),
    globalRtpTop: document.getElementById("global-rtp-top"),
    dashboardCards: document.getElementById("dashboard-cards"),
    activityChart: document.getElementById("activity-chart"),
    topOddsList: document.getElementById("top-odds-list"),
    alertsList: document.getElementById("alerts-list"),
    dashboardLogs: document.getElementById("dashboard-logs"),
    usersTableBody: document.getElementById("users-table-body"),
    userDetailTitle: document.getElementById("user-detail-title"),
    userDetailContent: document.getElementById("user-detail-content"),
    transactionsTableBody: document.getElementById("transactions-table-body"),
    logsList: document.getElementById("logs-list"),
    toastStack: document.getElementById("toast-stack"),
    refreshBootstrap: document.getElementById("refresh-bootstrap"),
    logout: document.getElementById("admin-logout"),
    featureSettingsForm: document.getElementById("feature-settings-form"),
    ghostSettingsForm: document.getElementById("ghost-settings-form"),
    powersSettingsForm: document.getElementById("powers-settings-form"),
    forceCrashForm: document.getElementById("force-crash-form"),
    forceCrashStatus: document.getElementById("force-crash-status"),
    clearForceCrash: document.getElementById("clear-force-crash"),
    worldChatDeleteForm: document.getElementById("world-chat-delete-form"),
    worldChatDeleteStatus: document.getElementById("world-chat-delete-status"),
    usersFilterForm: document.getElementById("users-filter-form"),
    transactionsFilterForm: document.getElementById("transactions-filter-form")
  };

  function formatMoney(value) {
    return `${Number(value || 0).toFixed(2)} USD`;
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

  function formatDate(value) {
    if (!value) return "N/A";
    return new Date(value).toLocaleString("fr-FR");
  }

  function setToken(token) {
    state.token = token || "";
    if (state.token) localStorage.setItem(ADMIN_TOKEN_KEY, state.token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  }

  function showToast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    els.toastStack.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function setAuthView(isAuthenticated) {
    els.loginShell.classList.toggle("hidden", isAuthenticated);
    els.shell.classList.toggle("hidden", !isAuthenticated);
  }

  async function adminFetch(path, options = {}) {
    const response = await fetch(`${window.AppApi.getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Erreur serveur");
    return payload;
  }

  function statusPill(status) {
    const value = String(status || "").toLowerCase();
    const tone = value === "completed" || value === "paid"
      ? "success"
      : value === "pending"
        ? "pending"
        : value === "rejected" || value === "failed" || value === "banned"
          ? "danger"
          : "";
    return `<span class="status-pill ${tone}">${status || "N/A"}</span>`;
  }

  function renderDashboard() {
    const cards = state.dashboard?.cards || {};
    const items = [
      ["Utilisateurs", cards.totalUsers || 0],
      ["Joueurs actifs", cards.activePlayers || 0],
      ["Depots", formatMoney(cards.totalDeposits || 0)],
      ["Retraits", formatMoney(cards.totalWithdrawals || 0)],
      ["Profit estime", formatMoney(cards.estimatedProfit || 0)],
      ["House edge", `${Number(cards.houseEdge || 0).toFixed(2)}%`]
    ];

    els.dashboardCards.innerHTML = items.map(([label, value]) => `
      <article class="stat-card"><span>${label}</span><strong>${value}</strong></article>
    `).join("");
    els.alertsCount.textContent = String(cards.pendingWithdraws || 0);
    els.globalRtpTop.textContent = `${Number(cards.globalRtp || 0).toFixed(2)}%`;

    const chartRows = state.dashboard?.charts || [];
    const maxPlayers = Math.max(...chartRows.map((item) => item.activePlayers || 0), 1);
    const maxMoney = Math.max(...chartRows.flatMap((item) => [item.gains || 0, item.losses || 0]), 1);
    els.activityChart.innerHTML = chartRows.map((item) => `
      <article class="chart-row">
        <div class="metric-line"><span>${item.day}</span><strong>${item.activePlayers} joueurs</strong></div>
        <div class="chart-bar-stack">
          <div class="chart-bar players"><span style="width:${(item.activePlayers / maxPlayers) * 100}%"></span></div>
          <div class="chart-bar losses"><span style="width:${(item.losses / maxMoney) * 100}%"></span></div>
          <div class="chart-bar gains"><span style="width:${(item.gains / maxMoney) * 100}%"></span></div>
        </div>
        <div class="metric-line"><span>Pertes: ${formatMoney(item.losses)}</span><span>Gains: ${formatMoney(item.gains)}</span></div>
      </article>
    `).join("") || '<div class="empty-state">Pas encore assez de donnees.</div>';

    els.topOddsList.innerHTML = (state.dashboard?.topOdds || []).map((item) => `
      <article class="odds-item metric-line"><span>x${Number(item.multiplier || 0).toFixed(1)}</span><strong>${item.hits} fois</strong></article>
    `).join("") || '<div class="empty-state">Aucune cote enregistree.</div>';

    els.alertsList.innerHTML = state.alerts.map((alert) => `
      <article class="feed-item"><strong>${alert.message}</strong><div>${formatDate(alert.createdAt)}</div></article>
    `).join("") || '<div class="empty-state">Aucune alerte.</div>';

    els.dashboardLogs.innerHTML = state.logs.slice(0, 8).map((log) => `
      <article class="feed-item"><strong>${log.summary}</strong><div>${log.admin} • ${formatDate(log.createdAt)}</div></article>
    `).join("") || '<div class="empty-state">Aucune action admin.</div>';
  }

  function renderUsers() {
    els.usersTableBody.innerHTML = state.users.map((user) => `
      <tr class="js-open-user-row" data-user-id="${user.id}">
        <td><strong>${escapeHtml(user.username)}</strong><br><span>${escapeHtml(user.email)}</span></td>
        <td>${formatMoney(user.balance)}</td>
        <td>${user.adminGameControl?.forcedCrashValue ? `x${Number(user.adminGameControl.forcedCrashValue).toFixed(2)}` : "Auto"}</td>
        <td>${Number(user.gameStats?.rtp || 0).toFixed(2)}%</td>
        <td>${statusPill(user.isBanned ? "banned" : "active")}</td>
        <td>${formatDate(user.lastSeenAt)}</td>
        <td><button type="button" data-user-id="${user.id}" class="ghost-button js-open-user">Voir</button></td>
      </tr>
    `).join("") || '<tr><td colspan="7">Aucun utilisateur.</td></tr>';
  }

  function renderUserDetail() {
    const selected = state.selectedUser;
    if (!selected) {
      els.userDetailTitle.textContent = "Selectionnez un joueur";
      els.userDetailContent.className = "detail-stack empty-state";
      els.userDetailContent.textContent = "Aucun joueur selectionne.";
      return;
    }

    const user = selected.user;
    els.userDetailTitle.textContent = `${user.username} (${user.email})`;
    els.userDetailContent.className = "detail-stack";
    els.userDetailContent.innerHTML = `
      <article class="detail-card">
        <div class="metric-line"><span>Solde</span><strong>${formatMoney(user.balance)}</strong></div>
        <div class="metric-line"><span>Statut</span><strong>${user.isBanned ? "Banni" : "Actif"}</strong></div>
        <div class="metric-line"><span>Cote forcee</span><strong>${user.adminGameControl?.forcedCrashValue ? `x${Number(user.adminGameControl.forcedCrashValue).toFixed(2)}` : "Automatique"}</strong></div>
        <div class="metric-line"><span>RTP</span><strong>${Number(user.gameStats?.rtp || 0).toFixed(2)}%</strong></div>
        <div class="metric-line"><span>Derniere activite</span><strong>${formatDate(user.lastSeenAt)}</strong></div>
        <div class="metric-line"><span>Mot de passe</span><strong>${selected.passwordInfo || "Hash bcrypt uniquement"}</strong></div>
      </article>
      <form id="user-odds-form" class="stack-form">
        <label><span>Cote forcee pour ce joueur</span><input type="number" step="0.01" min="1" name="forcedCrashValue" value="${user.adminGameControl?.forcedCrashValue ?? ""}" placeholder="Laisser vide pour automatique"></label>
        <label><span>Note admin</span><input type="text" name="note" value="${escapeHtml(user.adminGameControl?.notes || "")}" placeholder="Optionnel"></label>
        <button type="submit">Enregistrer la cote joueur</button>
      </form>
      <form id="user-balance-form" class="stack-form">
        <label><span>Mode</span><select name="mode"><option value="set">Fixer le solde</option><option value="delta">Ajouter / retirer</option></select></label>
        <label><span>Montant</span><input type="number" step="0.01" name="amount" required></label>
        <label><span>Raison</span><input type="text" name="reason" placeholder="Ajustement admin"></label>
        <button type="submit">Appliquer au solde</button>
      </form>
      <div class="action-row"><button class="ghost-button ${user.isBanned ? "" : "danger"}" id="toggle-ban-button">${user.isBanned ? "Debannir" : "Bannir"}</button></div>
      <article class="detail-card">
        <h4>Historique recent</h4>
        ${(selected.history || []).slice(0, 12).map((item) => `<div class="metric-line"><span>${item.type} • ${item.status}</span><strong>${formatMoney(item.amount_fiat)}</strong></div>`).join("") || '<div class="empty-state">Aucun historique.</div>'}
      </article>
    `;

    document.getElementById("user-odds-form").addEventListener("submit", handleUserOddsSubmit);
    document.getElementById("user-balance-form").addEventListener("submit", handleUserBalanceSubmit);
    document.getElementById("toggle-ban-button").addEventListener("click", handleUserBanToggle);
  }

  function setUserDetailMessage(title, message, isError = false) {
    els.userDetailTitle.textContent = title;
    els.userDetailContent.className = `detail-stack empty-state${isError ? " error-state" : ""}`;
    els.userDetailContent.textContent = message;
  }

  function renderTransactions() {
    els.transactionsTableBody.innerHTML = state.transactions.map((transaction) => {
      const canModerate = transaction.type === "withdraw" && transaction.status === "pending";
      const actions = canModerate
        ? `<div class="table-actions"><button class="js-approve-withdraw" data-transaction-id="${transaction._id}">Valider</button><button class="ghost-button danger js-reject-withdraw" data-transaction-id="${transaction._id}">Refuser</button></div>`
        : "Aucune";
      return `
        <tr>
          <td>${transaction.type}</td>
          <td><strong>${transaction.user?.username || "Joueur"}</strong><br><span>${transaction.user?.email || ""}</span></td>
          <td>${formatMoney(transaction.amount_fiat)}</td>
          <td>${statusPill(transaction.status)}</td>
          <td>${formatDate(transaction.createdAt)}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join("") || '<tr><td colspan="6">Aucune transaction.</td></tr>';
  }

  function renderLogs() {
    els.logsList.innerHTML = state.logs.map((log) => `
      <article class="feed-item"><strong>${log.summary}</strong><div>${log.action}</div><div>${log.admin} • ${formatDate(log.createdAt)}</div></article>
    `).join("") || '<div class="empty-state">Aucun log.</div>';
  }

  function fillSettingsForms() {
    const settings = state.settings;
    if (!settings) return;
    els.featureSettingsForm.depositsEnabled.checked = Boolean(settings.features?.depositsEnabled);
    els.featureSettingsForm.withdrawalsEnabled.checked = Boolean(settings.features?.withdrawalsEnabled);
    els.featureSettingsForm.worldChatEnabled.checked = Boolean(settings.features?.worldChatEnabled);
    els.ghostSettingsForm.lowChance.value = settings.ghost?.lowChance ?? 50;
    els.ghostSettingsForm.mediumChance.value = settings.ghost?.mediumChance ?? 30;
    els.ghostSettingsForm.highChance.value = settings.ghost?.highChance ?? 10;
    els.ghostSettingsForm.extremeChance.value = settings.ghost?.extremeChance ?? 10;
    els.ghostSettingsForm.lowRangeMin.value = settings.ghost?.lowRange?.[0] ?? 1;
    els.ghostSettingsForm.lowRangeMax.value = settings.ghost?.lowRange?.[1] ?? 2;
    els.ghostSettingsForm.mediumRangeMin.value = settings.ghost?.mediumRange?.[0] ?? 2;
    els.ghostSettingsForm.mediumRangeMax.value = settings.ghost?.mediumRange?.[1] ?? 4;
    els.ghostSettingsForm.highRangeMin.value = settings.ghost?.highRange?.[0] ?? 4;
    els.ghostSettingsForm.highRangeMax.value = settings.ghost?.highRange?.[1] ?? 10;
    els.ghostSettingsForm.extremeRangeMin.value = settings.ghost?.extremeRange?.[0] ?? 10;
    els.ghostSettingsForm.extremeRangeMax.value = settings.ghost?.extremeRange?.[1] ?? 30;
    els.powersSettingsForm.visionEnabled.checked = Boolean(settings.powers?.vision?.enabled);
    els.powersSettingsForm.visionPrice.value = settings.powers?.vision?.priceUsd ?? 10;
    els.powersSettingsForm.visionUnits.value = settings.powers?.vision?.units ?? 2;
    els.powersSettingsForm.freezeEnabled.checked = Boolean(settings.powers?.freeze?.enabled);
    els.powersSettingsForm.freezePrice.value = settings.powers?.freeze?.priceUsd ?? 20;
    els.powersSettingsForm.freezeUnits.value = settings.powers?.freeze?.units ?? 2;
    els.powersSettingsForm.shieldEnabled.checked = Boolean(settings.powers?.shield?.enabled);
    els.powersSettingsForm.shieldPrice.value = settings.powers?.shield?.priceUsd ?? 3;
    els.powersSettingsForm.shieldUnits.value = settings.powers?.shield?.units ?? 2;
    els.powersSettingsForm.secondChanceEnabled.checked = Boolean(settings.powers?.second_chance?.enabled);
    els.powersSettingsForm.secondChancePrice.value = settings.powers?.second_chance?.priceUsd ?? 60;
    els.powersSettingsForm.secondChanceUnits.value = settings.powers?.second_chance?.units ?? 2;
    const forced = Number(settings.ghost?.forcedCrashValue);
    els.forceCrashStatus.textContent = Number.isFinite(forced) && forced >= 1 ? `Cote forcee active: x${forced.toFixed(2)}` : "Aucune cote forcee.";
  }

  async function loadBootstrap() {
    const payload = await adminFetch("/api/admin/bootstrap");
    state.admin = payload.admin;
    state.dashboard = payload.dashboard;
    state.settings = payload.settings;
    state.users = payload.users || [];
    state.transactions = payload.transactions || [];
    state.logs = payload.logs || [];
    state.alerts = payload.alerts || [];
    els.profileLabel.textContent = `${state.admin.displayName} • ${state.admin.email}`;
    renderDashboard();
    renderUsers();
    renderUserDetail();
    renderTransactions();
    renderLogs();
    fillSettingsForms();
  }

  async function loadUsers(formData) {
    const params = new URLSearchParams();
    const search = formData?.get("search") || "";
    const status = formData?.get("status") || "";
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const payload = await adminFetch(`/api/admin/users?${params.toString()}`);
    state.users = payload.users || [];
    renderUsers();
  }

  async function loadUserDetail(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      setUserDetailMessage("Selection impossible", "Nom du joueur manquant.", true);
      return;
    }

    setUserDetailMessage("Chargement...", "Ouverture du profil joueur");

    try {
      state.selectedUser = await adminFetch(`/api/admin/users/${encodeURIComponent(safeUserId)}`);
      renderUserDetail();
      els.userDetailTitle.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      state.selectedUser = null;
      setUserDetailMessage("Erreur de chargement", error.message || "Impossible d'ouvrir ce joueur.", true);
      showToast(error.message || "Chargement du joueur impossible", "error");
    }
  }

  async function loadTransactions(formData) {
    const params = new URLSearchParams();
    ["type", "status", "from", "to", "search"].forEach((key) => {
      const value = formData?.get(key);
      if (value) params.set(key, value);
    });
    const payload = await adminFetch(`/api/admin/transactions?${params.toString()}`);
    state.transactions = payload.transactions || [];
    renderTransactions();
  }

  async function loadLogs() {
    const payload = await adminFetch("/api/admin/logs");
    state.logs = payload.logs || [];
    renderDashboard();
    renderLogs();
  }

  async function loadAlerts() {
    const payload = await adminFetch("/api/admin/alerts");
    state.alerts = payload.alerts || [];
    renderDashboard();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    els.loginStatus.textContent = "Connexion en cours...";
    try {
      const payload = await adminFetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") })
      });
      setToken(payload.token);
      setAuthView(true);
      els.loginStatus.textContent = "";
      await loadBootstrap();
      if (alertsIntervalId) clearInterval(alertsIntervalId);
      alertsIntervalId = setInterval(() => { loadAlerts().catch(() => {}); }, 15000);
      showToast("Connexion admin reussie");
    } catch (error) {
      els.loginStatus.textContent = error.message;
    }
  }

  async function handleUserBalanceSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await adminFetch(`/api/admin/users/${encodeURIComponent(state.selectedUser.user.id)}/balance`, {
        method: "PATCH",
        body: JSON.stringify({
          mode: formData.get("mode"),
          amount: Number(formData.get("amount")),
          reason: formData.get("reason")
        })
      });
      await Promise.all([loadBootstrap(), loadUserDetail(state.selectedUser.user.id)]);
      showToast("Solde mis a jour");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleUserOddsSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rawValue = String(formData.get("forcedCrashValue") || "").trim();

    try {
      if (!state.selectedUser?.user?.id) {
        throw new Error("Aucun joueur selectionne");
      }

      const payload = await adminFetch(`/api/admin/users/${encodeURIComponent(state.selectedUser.user.id)}/odds`, {
        method: "PATCH",
        body: JSON.stringify({
          forcedCrashValue: rawValue ? Number(rawValue) : null,
          note: formData.get("note")
        })
      });

      if (payload?.user) {
        state.selectedUser.user = {
          ...state.selectedUser.user,
          ...payload.user
        };
        state.users = state.users.map((item) => item.id === payload.user.id ? payload.user : item);
        renderUsers();
        renderUserDetail();
      }

      loadBootstrap().catch(() => {});
      showToast("Cote joueur mise a jour");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleUserBanToggle() {
    const userId = state.selectedUser.user.id;
    const endpoint = state.selectedUser.user.isBanned ? "unban" : "ban";
    try {
      await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/${endpoint}`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Restriction admin" })
      });
      await Promise.all([loadBootstrap(), loadUserDetail(userId)]);
      showToast(endpoint === "ban" ? "Utilisateur banni" : "Utilisateur debanni");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleSettingsUpdate(payload, successMessage) {
    try {
      const response = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      state.settings = response.settings || state.settings;
      fillSettingsForms();
      await Promise.all([loadBootstrap(), loadLogs()]);
      showToast(successMessage);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleTransactionAction(event) {
    const approveButton = event.target.closest(".js-approve-withdraw");
    const rejectButton = event.target.closest(".js-reject-withdraw");
    const transactionId = approveButton?.dataset.transactionId || rejectButton?.dataset.transactionId;
    if (!transactionId) return;
    try {
      await adminFetch(`/api/admin/transactions/${transactionId}/${approveButton ? "approve-withdraw" : "reject-withdraw"}`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      await Promise.all([loadBootstrap(), loadTransactions(new FormData(els.transactionsFilterForm)), loadLogs(), loadAlerts()]);
      showToast(approveButton ? "Retrait valide" : "Retrait refuse");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleWorldChatDelete(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const messageId = String(formData.get("messageId") || "").trim();

    if (!messageId) {
      els.worldChatDeleteStatus.textContent = "Entrez un ID de message avant la suppression.";
      return;
    }

    els.worldChatDeleteStatus.textContent = "Suppression du message en cours...";

    try {
      const response = await adminFetch(`/api/admin/world-chat/${encodeURIComponent(messageId)}`, {
        method: "DELETE"
      });
      event.currentTarget.reset();
      els.worldChatDeleteStatus.textContent = `Message supprime: ${response.deletedMessage?.message || messageId}`;
      await Promise.all([loadBootstrap(), loadLogs()]);
      showToast("Message du monde supprime");
    } catch (error) {
      els.worldChatDeleteStatus.textContent = error.message || "Suppression impossible.";
      showToast(error.message, "error");
    }
  }

  async function downloadExport(path, filename) {
    try {
      const response = await fetch(`${window.AppApi.getApiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${state.token}` } });
      if (!response.ok) throw new Error("Export impossible");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Export genere");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function bindNavigation() {
    document.querySelectorAll(".nav-link").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(`view-${button.dataset.view}`).classList.add("active");
      });
    });
  }

  function bindEvents() {
    bindNavigation();
    els.loginForm.addEventListener("submit", handleLogin);
    els.refreshBootstrap.addEventListener("click", () => loadBootstrap().then(() => showToast("Panel actualise")).catch((error) => showToast(error.message, "error")));
    els.logout.addEventListener("click", () => {
      setToken("");
      state.admin = null;
      if (alertsIntervalId) clearInterval(alertsIntervalId);
      alertsIntervalId = null;
      setAuthView(false);
    });
    els.featureSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSettingsUpdate({ features: {
        depositsEnabled: els.featureSettingsForm.depositsEnabled.checked,
        withdrawalsEnabled: els.featureSettingsForm.withdrawalsEnabled.checked,
        worldChatEnabled: els.featureSettingsForm.worldChatEnabled.checked
      } }, "Fonctionnalites mises a jour");
    });
    els.ghostSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSettingsUpdate({ ghost: {
        lowChance: Number(els.ghostSettingsForm.lowChance.value),
        mediumChance: Number(els.ghostSettingsForm.mediumChance.value),
        highChance: Number(els.ghostSettingsForm.highChance.value),
        extremeChance: Number(els.ghostSettingsForm.extremeChance.value),
        lowRange: [Number(els.ghostSettingsForm.lowRangeMin.value), Number(els.ghostSettingsForm.lowRangeMax.value)],
        mediumRange: [Number(els.ghostSettingsForm.mediumRangeMin.value), Number(els.ghostSettingsForm.mediumRangeMax.value)],
        highRange: [Number(els.ghostSettingsForm.highRangeMin.value), Number(els.ghostSettingsForm.highRangeMax.value)],
        extremeRange: [Number(els.ghostSettingsForm.extremeRangeMin.value), Number(els.ghostSettingsForm.extremeRangeMax.value)]
      } }, "Probabilites Ghost mises a jour");
    });
    els.powersSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSettingsUpdate({ powers: {
        vision: { enabled: els.powersSettingsForm.visionEnabled.checked, priceUsd: Number(els.powersSettingsForm.visionPrice.value), units: Number(els.powersSettingsForm.visionUnits.value) },
        freeze: { enabled: els.powersSettingsForm.freezeEnabled.checked, priceUsd: Number(els.powersSettingsForm.freezePrice.value), units: Number(els.powersSettingsForm.freezeUnits.value) },
        shield: { enabled: els.powersSettingsForm.shieldEnabled.checked, priceUsd: Number(els.powersSettingsForm.shieldPrice.value), units: Number(els.powersSettingsForm.shieldUnits.value) },
        second_chance: { enabled: els.powersSettingsForm.secondChanceEnabled.checked, priceUsd: Number(els.powersSettingsForm.secondChancePrice.value), units: Number(els.powersSettingsForm.secondChanceUnits.value) }
      } }, "Prix et pouvoirs sauvegardes");
    });
    els.forceCrashForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const response = await adminFetch("/api/admin/settings/force-crash", { method: "POST", body: JSON.stringify({ crashValue: Number(els.forceCrashForm.crashValue.value || 1.01) }) });
        state.settings = response.settings;
        fillSettingsForms();
        await Promise.all([loadBootstrap(), loadLogs()]);
        showToast("Cote forcee definie");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
    els.clearForceCrash.addEventListener("click", async () => {
      try {
        const response = await adminFetch("/api/admin/settings/clear-force-crash", { method: "POST", body: JSON.stringify({}) });
        state.settings = response.settings;
        fillSettingsForms();
        await Promise.all([loadBootstrap(), loadLogs()]);
        showToast("Cote forcee retiree");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
    els.worldChatDeleteForm.addEventListener("submit", handleWorldChatDelete);
    els.usersFilterForm.addEventListener("submit", async (event) => { event.preventDefault(); await loadUsers(new FormData(event.currentTarget)); });
    els.transactionsFilterForm.addEventListener("submit", async (event) => { event.preventDefault(); await loadTransactions(new FormData(event.currentTarget)); });
    els.usersTableBody.addEventListener("click", async (event) => {
      const trigger = event.target.closest(".js-open-user");
      const rowTrigger = event.target.closest(".js-open-user-row");
      const userId = trigger?.dataset.userId || rowTrigger?.dataset.userId;
      if (userId) {
        await loadUserDetail(userId);
      }
    });
    els.transactionsTableBody.addEventListener("click", handleTransactionAction);
    document.getElementById("export-users-json").addEventListener("click", () => downloadExport("/api/admin/exports/users?format=json", "users.json"));
    document.getElementById("export-users-csv").addEventListener("click", () => downloadExport("/api/admin/exports/users?format=csv", "users.csv"));
    document.getElementById("export-transactions-json").addEventListener("click", () => downloadExport("/api/admin/exports/transactions?format=json", "transactions.json"));
    document.getElementById("export-transactions-csv").addEventListener("click", () => downloadExport("/api/admin/exports/transactions?format=csv", "transactions.csv"));
  }

  async function boot() {
    bindEvents();
    if (!state.token) {
      setAuthView(false);
      return;
    }
    try {
      setAuthView(true);
      await loadBootstrap();
      if (alertsIntervalId) clearInterval(alertsIntervalId);
      alertsIntervalId = setInterval(() => { loadAlerts().catch(() => {}); }, 15000);
    } catch (error) {
      setToken("");
      setAuthView(false);
      showToast(error.message, "error");
    }
  }

  boot();
})();
