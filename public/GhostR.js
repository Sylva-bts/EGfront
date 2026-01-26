let Img = document.querySelector('.img');
let soldeSpan = document.querySelector('#Solde span');
let coteSpan = document.querySelector('#cote span');

let Stick = document.getElementById('stick0');
let Stick1 = document.getElementById('stick1');
let Ghost = document.getElementById('Ghost');
let miseEl = document.getElementById('Mise');
let historyEl = document.getElementById('Story');

let coteIni = 1.0;
let vitesse = 1000;
let vitesseMin = 80;
let acceleration = 25;
let jeuEnCours = false;

let pouuf; // sera tiré aléatoirement dans GameOn()
let mise = 0;
let gameInterval;
let ghostPos = 0;

// Initialiser le localStorage s'il n'existe pas
if (!localStorage.getItem('gameHistory')) {
  localStorage.setItem('gameHistory', JSON.stringify([]));
}

Ghost.style.display = "none";
Stick.style.display = "none";
Stick1.style.display = "block";

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
  alert("Tu as misé !!");

  coteIni = 1.0;
  vitesse = 1000;
  jeuEnCours = true;

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

  ghostPos = 0;
  Ghost.style.position = "absolute";
  Ghost.style.right = ghostPos + "px";

  gameInterval = setInterval(() => {
    ghostPos += 0.02;
    Ghost.style.right = ghostPos + "px";

    if (coteIni >= pouuf) {
      clearInterval(gameInterval);
      ghostPos = 10;
      Ghost.style.right = ghostPos + "px";      
      jeuEnCours = false;
      Ghost.style.display = "none";
      Stick.style.display = "none";
      Stick1.style.display = "block";
      
      // Enregistrer la perte dans le localStorage
      saveTransaction('Perte', -mise, coteIni);
    }
    animeBack();
  }, 10);
}

function augmenterCote() {
  if (!jeuEnCours) return;

  coteIni += 0.01;
  updateCote(coteIni);

  if (coteIni >= pouuf) {
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
