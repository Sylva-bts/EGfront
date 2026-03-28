let Img = document.querySelector('.img');
let soldeSpan = document.querySelector('#Solde span');
let coteSpan = document.querySelector('#cote span');

let Stick = document.getElementById('stick0');
let Stick1 = document.getElementById('stick1');
let Ghost = document.getElementById('Ghost');
let miseEl = document.getElementById('Mise');
let historyEl = document.getElementById('Story');
const ghostDefaultSrc = Ghost.getAttribute('src');
const ghostFrozenSrc = 'ima/Gost_froid.png';

let coteIni = 1.0;
let vitesse = 1010;
let vitesseMin = 80;
let acceleration = 60;
let jeuEnCours = false;
let vitesseUsed = false;
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

// variables Pouvoirs
let vitesseBtn = document.getElementById("btn-vitesse");
let gelBtn = document.getElementById("btn-gel");
let bouclierBtn = document.getElementById("btn-bouclier");
let secChanceBtn = document.getElementById("btn-sec-chance");
let visionBtn = document.getElementById("btn-vision");

let pouuf; // sera tiré aléatoirement dans GameOn()
let mise = 0;
let gameInterval;
let ghostPos = 0;
let notificationTimeoutId;

// Initialiser le localStorage s'il n'existe pas
if (!localStorage.getItem('gameHistory')) {
  localStorage.setItem('gameHistory', JSON.stringify([]));
}

Ghost.style.display = "none";
Stick.style.display = "none";
Stick1.style.display = "block";


// pouvoirs

function Vitesse() {
  if (!jeuEnCours || vitesseUsed) return;
  vitesseUsed = true;
  coteIni += 0.15;
  pouuf += 0.15;
  updateCote(coteIni);
  vitesseBtn.disabled = true;
  vitesseBtn.style.opacity = '0.5';
  vitesseBtn.style.cursor = 'not-allowed';
}

function Gel() {
  if (!jeuEnCours || gelUsed) return;
  gelUsed = true;
  window.gelActive = true;
  pouuf += 0.35;
  Ghost.src = ghostFrozenSrc;
  Ghost.style.filter = 'brightness(1.05)';
  gelBtn.disabled = true;
  gelBtn.style.opacity = '0.5';
  gelBtn.style.cursor = 'not-allowed';
  setTimeout(() => {
    window.gelActive = false;
    Ghost.src = ghostDefaultSrc;
    Ghost.style.filter = '';
  }, 3000);
}

function Bouclier() {
  if (!jeuEnCours || bouclierUsed || bouclierActive) return;
  bouclierUsed = true;
  bouclierActive = true;
  window.bouclierActive = true;
  ensureShieldStyles();
  Stick.classList.add('shield-active');
  showGameNotification('Bouclier actif', 'info');
  notifyShieldStatus('active');
  bouclierBtn.disabled = true;
  bouclierBtn.style.opacity = '0.5';
  bouclierBtn.style.cursor = 'not-allowed';

  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
  }

  bouclierTimeoutId = setTimeout(() => {
    deactivateShield('expired');
  }, 5000);
}

function Vision() {
  if (!jeuEnCours || visionUsed) return;
  visionUsed = true;
  const dangerGap = pouuf - coteIni;
  const showDanger = dangerGap > 0 && dangerGap <= 0.2;

  visionBtn.disabled = true;
  visionBtn.style.opacity = '0.5';
  visionBtn.style.cursor = 'not-allowed';

  if (!showDanger) return;

  ensureGlowStyle();
  Img.style.boxShadow = '0 0 28px rgba(168, 85, 247, 0.85), inset 0 0 24px rgba(126, 34, 206, 0.45)';
  Img.style.border = '3px solid rgba(255, 108, 199, 0.95)';
  Img.style.animation = 'visionDangerGlow 0.9s ease-in-out infinite alternate';

  setTimeout(() => {
    Img.style.boxShadow = '';
    Img.style.border = '';
    Img.style.animation = '';
  }, 2000);
}

function showSecondChanceWindow() {
  secChanceAvailable = true;
  secChanceBtn.style.display = 'block';
  secChanceBtn.disabled = false;
  secChanceBtn.style.opacity = '1';
  secChanceBtn.style.cursor = 'pointer';

  if (secondChanceTimeoutId) {
    clearTimeout(secondChanceTimeoutId);
  }

  secondChanceTimeoutId = setTimeout(() => {
    secChanceAvailable = false;
    secChanceBtn.disabled = true;
    secChanceBtn.style.opacity = '0.5';
    secChanceBtn.style.cursor = 'not-allowed';
    secChanceBtn.style.display = 'none';
  }, 2000);
}

function SecondeChance() {
  if (!secChanceAvailable || secChanceUsed) return;

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

  secChanceBtn.disabled = true;
  secChanceBtn.style.opacity = '0.5';
  secChanceBtn.style.cursor = 'not-allowed';
  secChanceBtn.style.display = 'none';

  // Redémarre une nouvelle partie sans rembourser la mise (seconde chance)
  GameOn();
}

// Ajouter les styles de base (couleurs) dès le départ
(function initBackgroundStyles() {
  const baseStyle = document.createElement('style');
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
      content: '';
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

  const style = document.createElement('style');
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

  const style = document.createElement('style');
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

function showGameNotification(message, type = 'info') {
  ensureShieldStyles();

  let toast = document.querySelector('.game-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'game-toast';
    document.querySelector('.cadreJeux').appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `game-toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  if (notificationTimeoutId) {
    clearTimeout(notificationTimeoutId);
  }

  notificationTimeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

function notifyShieldStatus(status) {
  window.dispatchEvent(new CustomEvent('ghost:shield-status', {
    detail: {
      status: status,
      cote: coteIni,
      mise: mise
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

  Stick.classList.remove('shield-active');

  if (reason === 'blocked') {
    Stick.classList.add('shield-break');
    showGameNotification('Bouclier brise', 'warn');
    notifyShieldStatus('blocked');
    setTimeout(() => {
      Stick.classList.remove('shield-break');
    }, 500);
  } else {
    showGameNotification('Bouclier expire', 'warn');
    notifyShieldStatus('expired');
  }
}

function getNextDangerCote(currentCote) {
  let nextCote = currentCote;

  while (nextCote <= currentCote) {
    nextCote = tirerCote();
  }

  return nextCote;
}

// Charger l'historique au chargement de la page
window.addEventListener('load', loadHistory);

function Miser() {
  mise = Number(miseEl.value);
  let solde = Number(soldeSpan.textContent);

  if (mise < 2) {
    alert("Trop petit ! 🤷");
  } else if (mise > solde) {
    alert("Solde insuffisant 💰❓");
  } else {
    let newBalance = solde - mise;
    soldeSpan.textContent = newBalance.toFixed(2);
    GameOn();
  }
}

function GameOn() {
  clearInterval(gameInterval);
  alert("Tu as misé !!");
  secChanceBtn.style.display = 'none'; // Masquer le bouton Seconde Chance au début de chaque partie

  // Réinitialiser l'état de la seconde chance
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
  vitesseUsed = false;
  gelUsed = false;
  bouclierUsed = false;
  visionUsed = false;
  bouclierActive = false;
  window.bouclierActive = false;
  Stick.classList.remove('shield-active', 'shield-break');
  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
    bouclierTimeoutId = undefined;
  }
  vitesseBtn.disabled = false;
  gelBtn.disabled = false;
  bouclierBtn.disabled = false;
  secChanceBtn.disabled = false;
  visionBtn.disabled = false;
  vitesseBtn.style.opacity = '1';
  gelBtn.style.opacity = '1';
  bouclierBtn.style.opacity = '1';
  secChanceBtn.style.opacity = '1';
  visionBtn.style.opacity = '1';
  vitesseBtn.style.cursor = 'pointer';
  gelBtn.style.cursor = 'pointer';
  bouclierBtn.style.cursor = 'pointer';
  secChanceBtn.style.cursor = 'pointer';
  visionBtn.style.cursor = 'pointer';

  pouuf = tirerCote(); // génère la cote perdante selon probabilité
  console.log("Perd à la cote : ×" + pouuf.toFixed(2));

  updateCote(coteIni);
  start();            // démarre animation Ghost vs Stickman
  augmenterCote();    // démarre la montée de cote
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
  Ghost.style.right = ghostPos + "px";

  gameInterval = setInterval(() => {
    if (!window.gelActive) {
      ghostPos += 0.05; // vitesse de déplacement du fantôme
      Ghost.style.right = ghostPos + "px";
    }
if (ghostPos >= 150) {
      ghostPos = 150;
      Ghost.style.right = ghostPos + "px";
    }
    if (coteIni >= pouuf && window.bouclierActive) {
      deactivateShield('blocked');
      pouuf = getNextDangerCote(coteIni + 0.01);
      console.log("Bouclier utilisÃ©. Nouvelle cote perdante : Ã—" + pouuf.toFixed(2));
      return;
    }
    if (coteIni >= pouuf) {
      clearInterval(gameInterval);
      showSecondChanceWindow();
      ghostPos = 250;
      Ghost.style.right = ghostPos + "px";
      Stick.style.pointerEvents = "none";
      Stick.style.opacity = "0.5";
      Stick.style.filter = "grayscale(100%)";
      Stick.style.background = "red";

      endGameTimeoutId = setTimeout(() => {
        Ghost.style.display = "none";
        Stick.style.display = "none";
        Stick1.style.display = "block";
        jeuEnCours = false;
        // Si l'utilisateur n'a pas utilisé la seconde chance, enregistrer la perte
        if (!secChanceUsed) {
          saveTransaction('Perte', -mise, coteIni);
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
    return;
  }

  vitesse = Math.max(vitesseMin, vitesse - acceleration);
  setTimeout(augmenterCote, vitesse);
}

function updateCote(valeur) {
  coteSpan.textContent = valeur.toFixed(2);
}

function retrait() {
  if (!jeuEnCours) return;

  jeuEnCours = false;
  clearInterval(gameInterval);
  if (bouclierTimeoutId) {
    clearTimeout(bouclierTimeoutId);
    bouclierTimeoutId = undefined;
  }
  bouclierActive = false;
  window.bouclierActive = false;
  Stick.classList.remove('shield-active', 'shield-break');
  Ghost.style.display = "none";
  Stick.style.display = "none";
  Stick1.style.display = "block";

  alert("Tu as retiré à ×" + coteIni.toFixed(2));

  let gain = mise * coteIni;
  let solde = Number(soldeSpan.textContent);
  solde += gain;
  soldeSpan.textContent = solde.toFixed(2);
  
  // Enregistrer la transaction dans le localStorage
  saveTransaction('Gain', gain, coteIni);
}

function tirerCote() {
  const rand = Math.random() * 100;

  if (rand < 50) {
    return (Math.random() * 1) + 1; // [1.0, 2.0]
  } else if (rand < 80) {
    return (Math.random() * 2) + 2; // [2.0, 4.0]
  } else if (rand < 90) {
    return (Math.random() * 6) + 4; // [4.0, 10.0]
  } else {
    return (Math.random() * 20) + 10; // [10.0, 30.0]
  }
}

function animeBack() {
  if (backgroundStyleInjected) return;

  const style = document.createElement('style');
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
      content: '';
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

// Fonctions pour gérer l'historique avec localStorage
function saveTransaction(type, montant, cote) {
  let history = JSON.parse(localStorage.getItem('gameHistory')) || [];
  
  let transaction = {
    type: type,
    montant: montant,
    cote: cote,
    timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  };
  
  history.push(transaction);
  localStorage.setItem('gameHistory', JSON.stringify(history));
  
  loadHistory();
}

function loadHistory() {
  let history = JSON.parse(localStorage.getItem('gameHistory')) || [];
  
  if (history.length === 0) {
    historyEl.innerHTML = '<h3>Historique des transactions</h3><p style="text-align: center; color: #888; padding: 20px;">Aucune transaction</p>';
    return;
  }
  
  let html = '<h3>📊 Historique</h3>';
  
  // Afficher les transactions en ordre inverse (plus récentes en premier)
  for (let i = history.length - 1; i >= 0; i--) {
    let transaction = history[i];
    let amountClass = transaction.type === 'Gain' ? 'gain' : 'perte';
    let icon = transaction.type === 'Gain' ? '✅' : '❌';
    let amount = transaction.type === 'Gain' ? '+' + transaction.montant.toFixed(2) : transaction.montant.toFixed(2);
    
    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <span class="transaction-type">${icon} ${transaction.type} (×${transaction.cote.toFixed(2)})</span>
          <span class="transaction-amount ${amountClass}">${amount}€</span>
        </div>
        <div class="transaction-time">${transaction.timestamp}</div>
      </div>
    `;
  }
  
  html += '<button class="btn-clear-history" onclick="clearHistory()">🗑️ Effacer l\'historique</button>';
  historyEl.innerHTML = html;
}

function clearHistory() {
  if (confirm('Êtes-vous sûr de vouloir effacer tout l\'historique ?')) {
    localStorage.setItem('gameHistory', JSON.stringify([]));
    loadHistory();
  }
}
