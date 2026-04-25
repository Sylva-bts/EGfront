const profileStatusEl = document.getElementById("profile-status");
const profileFormEl = document.getElementById("profile-form");
const profileUsernameEl = document.getElementById("profile-username");
const profileBalanceEl = document.getElementById("profile-balance");
const profileAffiliateTotalEl = document.getElementById("profile-affiliate-total");
const profileAffiliateLockedEl = document.getElementById("profile-affiliate-locked");
const profileAffiliateWithdrawableEl = document.getElementById("profile-affiliate-withdrawable");
const profileReferralCodeEl = document.getElementById("profile-referral-code");
const profileReferralLinkEl = document.getElementById("profile-referral-link");
const profileAffiliateNoteEl = document.getElementById("profile-affiliate-note");
const profileEmailEl = document.getElementById("profile-email");
const profileCurrentPasswordEl = document.getElementById("profile-current-password");
const profileNewPasswordEl = document.getElementById("profile-new-password");
const profileLogoutEl = document.getElementById("profile-logout");
const profileCopyLinkEl = document.getElementById("profile-copy-link");

function setProfileStatus(message, isError = false) {
  profileStatusEl.textContent = message;
  profileStatusEl.style.color = isError ? "#ff8d9b" : "#d8ddff";
}

function fillProfileForm(user) {
  const username = user?.username || "";
  const email = user?.email || "";
  const balanceText = typeof user?.balance === "number" ? `${user.balance.toFixed(2)} USD` : "0.00 USD";
  const affiliation = user?.affiliation || {};
  const affiliateTotalText = typeof affiliation.totalEarned === "number" ? `${affiliation.totalEarned.toFixed(2)} USD` : "0.00 USD";
  const affiliateLockedText = typeof affiliation.lockedBalance === "number" ? `${affiliation.lockedBalance.toFixed(2)} USD` : "0.00 USD";
  const affiliateWithdrawableText = typeof affiliation.withdrawableBalance === "number" ? `${affiliation.withdrawableBalance.toFixed(2)} USD` : "0.00 USD";
  const referralCode = affiliation.referralCode || "";
  const referralLink = affiliation.referralLink || "";

  profileUsernameEl.value = username;
  profileEmailEl.value = email;
  profileBalanceEl.value = balanceText;
  profileAffiliateTotalEl.value = affiliateTotalText;
  profileAffiliateLockedEl.value = affiliateLockedText;
  profileAffiliateWithdrawableEl.value = affiliateWithdrawableText;
  profileReferralCodeEl.value = referralCode;
  profileReferralLinkEl.value = referralLink;
  profileCurrentPasswordEl.value = "";
  profileNewPasswordEl.value = "";
  profileAffiliateNoteEl.textContent = `Filleuls: ${affiliation.referredUsersCount || 0} | Debloque: ${typeof affiliation.unlockedTotal === "number" ? affiliation.unlockedTotal.toFixed(2) : "0.00"} USD | Reste a jouer: ${typeof affiliation.wageringRemaining === "number" ? affiliation.wageringRemaining.toFixed(2) : "0.00"} USD`;

  // Re-apply values after paint so browser autofill does not leave stale values in the wrong field.
  requestAnimationFrame(() => {
    profileUsernameEl.value = username;
    profileEmailEl.value = email;
    profileBalanceEl.value = balanceText;
    profileAffiliateTotalEl.value = affiliateTotalText;
    profileAffiliateLockedEl.value = affiliateLockedText;
    profileAffiliateWithdrawableEl.value = affiliateWithdrawableText;
    profileReferralCodeEl.value = referralCode;
    profileReferralLinkEl.value = referralLink;
  });
}

async function loadProfile() {
  if (!window.AppApi.getToken()) {
    setProfileStatus("Connectez-vous d'abord pour acceder a votre profil.", true);
    setTimeout(() => {
      window.location.href = "connec.html";
    }, 900);
    return;
  }

  try {
    let payload;

    try {
      payload = await window.AppApi.fetchJson("/api/auth/profile", {
        method: "GET",
        headers: window.AppApi.authHeaders()
      });
    } catch (primaryError) {
      payload = await window.AppApi.fetchJson("/api/me", {
        method: "GET",
        headers: window.AppApi.authHeaders()
      });
    }

    fillProfileForm(payload.user);
    setProfileStatus(`Bienvenue ${payload.user.username}.`);
  } catch (error) {
    setProfileStatus(error.message, true);
  }
}

async function saveProfile(event) {
  event.preventDefault();

  try {
    const payload = await window.AppApi.fetchJson("/api/auth/profile", {
      method: "PATCH",
      headers: window.AppApi.authHeaders(),
      body: JSON.stringify({
        username: profileUsernameEl.value.trim(),
        email: profileEmailEl.value.trim(),
        currentPassword: profileCurrentPasswordEl.value,
        newPassword: profileNewPasswordEl.value
      })
    });

    if (payload.token) {
      window.AppApi.setToken(payload.token);
    }

    fillProfileForm(payload.user);
    setProfileStatus("Profil mis a jour avec succes.");
  } catch (error) {
    setProfileStatus(error.message, true);
  }
}

function logoutProfile() {
  window.AppApi.clearToken();
  window.location.href = "connec.html";
}

async function copyReferralLink() {
  const value = profileReferralLinkEl.value.trim();

  if (!value) {
    setProfileStatus("Aucun lien d'affiliation disponible pour le moment.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setProfileStatus("Lien d'affiliation copie.");
  } catch (error) {
    setProfileStatus("Impossible de copier automatiquement le lien.", true);
  }
}

profileFormEl.addEventListener("submit", saveProfile);
profileLogoutEl.addEventListener("click", logoutProfile);
if (profileCopyLinkEl) {
  profileCopyLinkEl.addEventListener("click", copyReferralLink);
}

loadProfile();
