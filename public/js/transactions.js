// ==================== TRANSACTIONS.JS ====================
// Frontend logic for deposit and withdrawal operations

// Auto-detect API URL based on current hostname
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalhost ? 'http://localhost:5000/api' : 'https://egback-1.onrender.com/api';

console.log('Running on:', window.location.hostname);
console.log('Using API:', API_BASE);

const LOCAL_CRYPTO_API = `${window.location.origin}/api/crypto`;

// ==================== AUTH UTILITIES ====================

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function isAuthenticated() {
    return !!getToken();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/connec.html';
}

function redirectIfNotAuthenticated() {
    if (!isAuthenticated()) {
        window.location.href = '/connec.html';
        return false;
    }
    return true;
}

// ==================== API CALLS ====================

async function apiCall(endpoint, options = {}) {
    const token = getToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };

    const response = await fetch(API_BASE + endpoint, { ...defaultOptions, ...options });
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'Une erreur est survenue');
    }
    
    return data;
}

// ==================== BALANCE ====================

async function loadBalance() {
    try {
        const data = await apiCall('/payments/balance');
        updateBalanceDisplay(data.data.balance);
        return data.data.balance;
    } catch (error) {
        console.error('Error loading balance:', error);
        return 0;
    }
}

function updateBalanceDisplay(balance) {
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl) {
        balanceEl.textContent = balance.toFixed(2);
    }
}

// ==================== DEPOSIT FUNCTIONS ====================

let depositPollingInterval = null;
let expirationTimerInterval = null;

async function createDeposit(amount, crypto) {
    const btn = document.getElementById('deposit-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';

    try {
        const localResponse = await fetch(`${LOCAL_CRYPTO_API}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: parseFloat(amount), crypto })
        });

        if (localResponse.ok) {
            const localData = await localResponse.json();
            if (localData.success && localData.data?.payLink) {
                showMessage('Redirection vers OxaPay...', 'success');
                window.location.href = localData.data.payLink;
                return;
            }
        }

        const data = await apiCall('/payments/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount: parseFloat(amount), crypto })
        });

        if (data.success) {
            showDepositInfo(data.data);
            startExpirationTimer(data.data.expire_time);
            startStatusPolling(data.data.invoice_id);
        }
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function showDepositInfo(depositData) {
    const depositForm = document.getElementById('deposit-form');
    const depositInfo = document.getElementById('deposit-info');
    
    depositForm.style.display = 'none';
    depositInfo.style.display = 'block';
    
    // Update info
    document.getElementById('payment-address').textContent = depositData.payment_address;
    document.getElementById('amount-crypto').textContent = depositData.amount_crypto + ' ' + depositData.currency;
    document.getElementById('invoice-id').textContent = depositData.invoice_id;
    
    // Generate QR Code
    const qrData = `${depositData.currency}:${depositData.payment_address}?amount=${depositData.amount_crypto}`;
    generateQRCode(qrData, 'qr-code');
    
    // Store invoice ID for polling
    document.getElementById('deposit-info').dataset.invoiceId = depositData.invoice_id;
}

function startExpirationTimer(expireTime) {
    const timerEl = document.getElementById('timer-value');
    const timerSection = document.getElementById('timer-section');
    
    if (!expireTime) {
        timerSection.style.display = 'none';
        return;
    }
    
    const expireDate = new Date(expireTime * 1000);
    
    expirationTimerInterval = setInterval(() => {
        const now = new Date();
        const diff = expireDate - now;
        
        if (diff <= 0) {
            clearInterval(expirationTimerInterval);
            timerEl.textContent = 'EXPIRÉ';
            timerEl.classList.add('timer-expired');
            stopStatusPolling();
            showMessage('La facture a expiré. Veuillez créer une nouvelle facture.', 'warning');
            return;
        }
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function startStatusPolling(invoiceId) {
    if (depositPollingInterval) {
        clearInterval(depositPollingInterval);
    }
    
    depositPollingInterval = setInterval(async () => {
        try {
            const data = await apiCall(`/payments/status/${invoiceId}`);
            updateDepositStatus(data.data.status);
            
            if (data.data.status === 'paid' || data.data.status === 'completed') {
                stopStatusPolling();
                showMessage('Paiement confirmé! Votre compte a été crédité.', 'success');
                loadBalance();
            } else if (data.data.status === 'expired' || data.data.status === 'failed') {
                stopStatusPolling();
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 10000); // Check every 10 seconds
}

function stopStatusPolling() {
    if (depositPollingInterval) {
        clearInterval(depositPollingInterval);
        depositPollingInterval = null;
    }
    if (expirationTimerInterval) {
        clearInterval(expirationTimerInterval);
        expirationTimerInterval = null;
    }
}

function updateDepositStatus(status) {
    const statusSection = document.getElementById('deposit-status');
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    
    statusSection.style.display = 'block';
    statusSection.className = 'status-section';
    
    const statusConfig = {
        'pending': { text: 'En attente de paiement...', icon: '⏳', class: 'status-pending' },
        'paid': { text: 'Paiement confirmé! ✓', icon: '✅', class: 'status-paid' },
        'completed': { text: 'Terminé! ✓', icon: '✅', class: 'status-completed' },
        'expired': { text: 'Expiré', icon: '❌', class: 'status-expired' },
        'failed': { text: 'Échoué', icon: '❌', class: 'status-failed' }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    statusText.textContent = config.text;
    statusIcon.textContent = config.icon;
    statusSection.classList.add(config.class);
}

function resetDepositForm() {
    const depositForm = document.getElementById('deposit-form');
    const depositInfo = document.getElementById('deposit-info');
    const depositStatus = document.getElementById('deposit-status');
    
    stopStatusPolling();
    
    depositForm.style.display = 'block';
    depositInfo.style.display = 'none';
    depositStatus.style.display = 'none';
    
    document.getElementById('deposit-amount').value = '';
    const defaultCrypto = document.getElementById('crypto-USDT');
    if (defaultCrypto) defaultCrypto.checked = true;
}

// ==================== WITHDRAWAL FUNCTIONS ====================

let withdrawPollingInterval = null;

async function createWithdrawal(amount, crypto, address) {
    const btn = document.getElementById('withdraw-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';

    try {
        const localResponse = await fetch(`${LOCAL_CRYPTO_API}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                crypto,
                address
            })
        });

        if (localResponse.ok) {
            const localData = await localResponse.json();
            if (localData.success) {
                showWithdrawalInfo({
                    amount: localData.data.amount,
                    crypto: localData.data.currency,
                    address: localData.data.address,
                    transaction_id: localData.data.payoutId,
                    payout_id: localData.data.payoutId
                });
                showMessage('Retrait envoyé vers OxaPay.', 'success');
                return;
            }
        }

        const data = await apiCall('/payments/withdraw', {
            method: 'POST',
            body: JSON.stringify({ 
                amount: parseFloat(amount), 
                crypto,
                address 
            })
        });

        if (data.success) {
            showWithdrawalInfo(data.data);
            startWithdrawalPolling(data.data.transaction_id);
        }
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function showWithdrawalInfo(withdrawalData) {
    const withdrawForm = document.getElementById('withdraw-form');
    const withdrawInfo = document.getElementById('withdraw-info');
    
    withdrawForm.style.display = 'none';
    withdrawInfo.style.display = 'block';
    
    // Update info
    document.getElementById('withdraw-amount').textContent = withdrawalData.amount + ' ' + withdrawalData.crypto;
    document.getElementById('withdraw-address').textContent = withdrawalData.address;
    document.getElementById('withdraw-transaction-id').textContent = withdrawalData.payout_id || withdrawalData.transaction_id;
    
    // Store transaction ID for polling
    document.getElementById('withdraw-info').dataset.transactionId = withdrawalData.transaction_id;
    
    updateWithdrawalStatus('pending');
}

function startWithdrawalPolling(transactionId) {
    if (withdrawPollingInterval) {
        clearInterval(withdrawPollingInterval);
    }
    
    withdrawPollingInterval = setInterval(async () => {
        try {
            const data = await apiCall(`/payments/withdraw/${transactionId}`);
            updateWithdrawalStatus(data.data.status);
            
            if (data.data.status === 'completed') {
                stopWithdrawalPolling();
                showMessage('Retrait confirmé!', 'success');
                loadBalance();
            } else if (data.data.status === 'rejected') {
                stopWithdrawalPolling();
                showMessage('Retrait rejeté. Le montant a été crédité sur votre compte.', 'error');
            }
        } catch (error) {
            console.error('Withdrawal status check error:', error);
        }
    }, 15000); // Check every 15 seconds
}

function stopWithdrawalPolling() {
    if (withdrawPollingInterval) {
        clearInterval(withdrawPollingInterval);
        withdrawPollingInterval = null;
    }
}

function updateWithdrawalStatus(status) {
    const statusSection = document.getElementById('withdraw-status');
    const statusText = document.getElementById('withdraw-status-text');
    const statusIcon = document.getElementById('withdraw-status-icon');
    
    statusSection.style.display = 'block';
    statusSection.className = 'status-section';
    
    const statusConfig = {
        'pending': { text: 'Retrait en cours de traitement...', icon: '⏳', class: 'status-pending' },
        'completed': { text: 'Retrait confirmé! ✓', icon: '✅', class: 'status-completed' },
        'rejected': { text: 'Retrait rejeté', icon: '❌', class: 'status-rejected' }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    statusText.textContent = config.text;
    statusIcon.textContent = config.icon;
    statusSection.classList.add(config.class);
}

function resetWithdrawForm() {
    const withdrawForm = document.getElementById('withdraw-form');
    const withdrawInfo = document.getElementById('withdraw-info');
    const withdrawStatus = document.getElementById('withdraw-status');
    
    stopWithdrawalPolling();
    
    withdrawForm.style.display = 'block';
    withdrawInfo.style.display = 'none';
    withdrawStatus.style.display = 'none';
    
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-address').value = '';
    const defaultWithdrawCrypto = document.getElementById('withdraw-crypto-USDT');
    if (defaultWithdrawCrypto) defaultWithdrawCrypto.checked = true;
}

// ==================== QR CODE ====================

function generateQRCode(data, elementId) {
    const canvas = document.getElementById(elementId);
    if (!canvas) return;
    
    // Simple QR code generation using canvas
    // In production, use a library like qrcode.js
    
    try {
        // Use QRCode library if available
        if (typeof QRCode !== 'undefined') {
            new QRCode(canvas, {
                text: data,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            // Fallback: show a placeholder message
            canvas.style.display = 'none';
            const placeholder = document.createElement('div');
            placeholder.className = 'qr-instruction';
            placeholder.textContent = 'Scannez l\'adresse: ' + data.substring(0, 30) + '...';
            placeholder.style.color = '#333';
            canvas.parentNode.insertBefore(placeholder, canvas.nextSibling);
        }
    } catch (error) {
        console.error('QR Code generation error:', error);
    }
}

// ==================== UI HELPERS ====================

function showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(el => el.remove());
    
    // Add new message
    const container = document.querySelector('.container') || document.body;
    container.insertBefore(messageEl, container.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        messageEl.remove();
    }, 5000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showMessage('Adresse copiée!', 'success');
    }).catch(() => {
        showMessage('Erreur lors de la copie', 'error');
    });
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!redirectIfNotAuthenticated()) return;
    
    // Load user balance
    loadBalance();
    
    // Deposit form handler
    const depositForm = document.getElementById('deposit-form-element');
    if (depositForm) {
        depositForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const amount = document.getElementById('deposit-amount').value;
            
            // Get selected crypto from radio buttons
            const selectedCrypto = document.querySelector('input[name="crypto"]:checked');
            const crypto = selectedCrypto ? selectedCrypto.value : 'USDT';
            
            if (!amount || amount <= 0) {
                showMessage('Veuillez entrer un montant valide', 'error');
                return;
            }
            
            await createDeposit(amount, crypto);
        });
    }
    
    // Withdrawal form handler
    const withdrawForm = document.getElementById('withdraw-form-element');
    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const amount = document.getElementById('withdraw-amount').value;
            const address = document.getElementById('withdraw-address').value;
            
            // Get selected crypto from radio buttons
            const selectedCrypto = document.querySelector('input[name="crypto"]:checked');
            const crypto = selectedCrypto ? selectedCrypto.value : 'USDT';
            
            if (!amount || amount <= 0) {
                showMessage('Veuillez entrer un montant valide', 'error');
                return;
            }
            
            if (!address) {
                showMessage('Veuillez entrer une adresse wallet', 'error');
                return;
            }
            
            await createWithdrawal(amount, crypto, address);
        });
    }
    
    // Copy button handlers
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('copy-btn')) {
            const address = e.target.dataset.address;
            if (address) {
                copyToClipboard(address);
            }
        }
    });
    
    // Logout handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// Export for use in HTML
window.createDeposit = createDeposit;
window.createWithdrawal = createWithdrawal;
window.resetDepositForm = resetDepositForm;
window.resetWithdrawForm = resetWithdrawForm;
window.copyToClipboard = copyToClipboard;
window.loadBalance = loadBalance;
