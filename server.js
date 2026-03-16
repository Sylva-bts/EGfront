const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

function applyRuntimeEnvFromArgs() {
  for (const arg of process.argv.slice(2)) {
    if (!arg || !arg.includes('=')) continue;
    const [rawKey, ...rest] = arg.split('=');
    const key = String(rawKey || '').trim();
    if (!key) continue;
    const value = rest.join('=').trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

applyRuntimeEnvFromArgs();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_DB_PATH = path.join(DATA_DIR, 'users.json');
const OXAPAY_API_BASE = 'https://api.oxapay.com';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'egfront-local-secret';

const invoiceState = new Map();
const withdrawState = new Map();

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_DB_PATH)) {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [] }, null, 2));
  }
}

function readUsers() {
  ensureDataStore();
  const raw = fs.readFileSync(USERS_DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{"users":[]}');
  return Array.isArray(parsed.users) ? parsed.users : [];
}

function writeUsers(users) {
  ensureDataStore();
  fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users }, null, 2));
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;

  const [encodedPayload, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function validatePassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === expectedHash;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4'
  };
  return mime[ext] || 'application/octet-stream';
}

function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload?.userId) return null;

  const users = readUsers();
  return users.find(user => user.id === payload.userId) || null;
}

async function createOxaPayInvoice(payload) {
  const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!merchantApiKey) {
    throw new Error('OXAPAY_MERCHANT_API_KEY manquant. Lancez le serveur avec `OXAPAY_MERCHANT_API_KEY=... node server.js` ou `node server.js OXAPAY_MERCHANT_API_KEY=...`.');
  }

  const response = await fetch(`${OXAPAY_API_BASE}/merchants/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data?.result) {
    throw new Error(data?.message || 'Erreur OxaPay (création facture)');
  }

  return data;
}

async function createOxaPayPayout(payload) {
  const payoutApiKey = process.env.OXAPAY_PAYOUT_API_KEY || process.env.OXAPAY_MERCHANT_API_KEY;
  if (!payoutApiKey) {
    throw new Error('OXAPAY_PAYOUT_API_KEY (ou OXAPAY_MERCHANT_API_KEY) manquant. Utilisez `OXAPAY_PAYOUT_API_KEY=... node server.js` ou `node server.js OXAPAY_PAYOUT_API_KEY=...`.');
  }

  const response = await fetch(`${OXAPAY_API_BASE}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: payoutApiKey, ...payload })
  });

  const data = await response.json();
  if (!response.ok || !data?.result) {
    throw new Error(data?.message || 'Erreur OxaPay (retrait)');
  }

  return data;
}

async function handleAuth(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!username || !email || !password) {
        return sendJson(res, 400, { success: false, message: 'Tous les champs sont obligatoires.' });
      }

      if (password.length < 6) {
        return sendJson(res, 400, { success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
      }

      const users = readUsers();
      if (users.some(user => user.email === email)) {
        return sendJson(res, 409, { success: false, message: 'Cet email existe déjà.' });
      }

      const { salt, hash } = hashPassword(password);
      users.push({
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: hash,
        salt,
        balance: 0,
        createdAt: new Date().toISOString()
      });
      writeUsers(users);

      return sendJson(res, 201, {
        success: true,
        message: 'Compte créé avec succès.'
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message || 'Erreur serveur.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email || !password) {
        return sendJson(res, 400, { success: false, message: 'Email et mot de passe obligatoires.' });
      }

      const users = readUsers();
      const user = users.find(entry => entry.email === email);
      if (!user || !validatePassword(password, user.salt, user.passwordHash)) {
        return sendJson(res, 401, { success: false, message: 'Identifiants invalides.' });
      }

      const token = signToken({
        userId: user.id,
        email: user.email,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Connexion réussie.',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          balance: user.balance
        }
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message || 'Erreur serveur.' });
    }
  }

  return false;
}

async function handlePayments(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/payments/balance') {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Non autorisé.' });
    }

    return sendJson(res, 200, {
      success: true,
      data: { balance: Number(user.balance || 0) }
    });
  }

  if (req.method === 'POST' && pathname === '/api/payments/deposit') {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Non autorisé.' });
    }

    try {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const currency = String(body.crypto || 'USDT').toUpperCase();

      if (!amount || amount <= 0) {
        return sendJson(res, 400, { success: false, message: 'Montant invalide.' });
      }

      const orderId = `dep-${Date.now()}`;
      const returnUrl = body.returnUrl || `http://localhost:${PORT}/deposit.html?payment=success`;
      const callbackUrl = body.callbackUrl || `http://localhost:${PORT}/deposit.html?payment=callback`;

      const invoice = await createOxaPayInvoice({
        merchant: process.env.OXAPAY_MERCHANT_API_KEY,
        amount,
        currency,
        orderId,
        lifeTime: 30,
        underPaidCover: 1,
        feePaidByPayer: 0,
        returnUrl,
        callbackUrl,
        description: `Depot ${amount} ${currency}`
      });

      const invoiceId = invoice.trackId || orderId;
      invoiceState.set(invoiceId, { status: 'pending' });

      return sendJson(res, 200, {
        success: true,
        data: {
          invoice_id: invoiceId,
          payment_address: invoice.address || 'Voir page OxaPay',
          amount_crypto: invoice.amount || amount,
          currency,
          expire_time: Math.floor(Date.now() / 1000) + 1800,
          payLink: invoice.payLink
        }
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message });
    }
  }

  if (req.method === 'GET' && pathname.startsWith('/api/payments/status/')) {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Non autorisé.' });
    }

    const invoiceId = pathname.split('/').pop();
    const status = invoiceState.get(invoiceId)?.status || 'pending';

    return sendJson(res, 200, { success: true, data: { status } });
  }

  if (req.method === 'POST' && pathname === '/api/payments/withdraw') {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Non autorisé.' });
    }

    try {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const currency = String(body.crypto || 'USDT').toUpperCase();
      const address = String(body.address || '').trim();

      if (!amount || amount <= 0) {
        return sendJson(res, 400, { success: false, message: 'Montant invalide.' });
      }

      if (!address) {
        return sendJson(res, 400, { success: false, message: 'Adresse wallet obligatoire.' });
      }

      const payout = await createOxaPayPayout({
        amount,
        currency,
        address,
        callbackUrl: body.callbackUrl || `http://localhost:${PORT}/withdraw.html?withdraw=callback`,
        description: `Retrait ${amount} ${currency}`
      });

      const transactionId = payout.trackId || payout.payoutId || `wd-${Date.now()}`;
      withdrawState.set(transactionId, { status: 'pending' });

      return sendJson(res, 200, {
        success: true,
        data: {
          amount,
          crypto: currency,
          address,
          transaction_id: transactionId,
          payout_id: transactionId
        }
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message });
    }
  }

  if (req.method === 'GET' && pathname.startsWith('/api/payments/withdraw/')) {
    const user = getUserFromRequest(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Non autorisé.' });
    }

    const transactionId = pathname.split('/').pop();
    const status = withdrawState.get(transactionId)?.status || 'pending';
    return sendJson(res, 200, { success: true, data: { status } });
  }

  return false;
}

async function handleCrypto(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/crypto/deposit') {
    try {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const currency = String(body.crypto || 'USDT').toUpperCase();

      if (!amount || amount <= 0) {
        return sendJson(res, 400, { success: false, message: 'Montant invalide.' });
      }

      const orderId = `dep-${Date.now()}`;
      const returnUrl = body.returnUrl || `http://localhost:${PORT}/deposit.html?payment=success`;
      const callbackUrl = body.callbackUrl || `http://localhost:${PORT}/deposit.html?payment=callback`;

      const invoice = await createOxaPayInvoice({
        merchant: process.env.OXAPAY_MERCHANT_API_KEY,
        amount,
        currency,
        lifeTime: 30,
        underPaidCover: 1,
        feePaidByPayer: 0,
        orderId,
        returnUrl,
        callbackUrl,
        description: `Depot ${amount} ${currency}`
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Facture OxaPay créée.',
        data: {
          invoiceId: invoice.trackId || orderId,
          payLink: invoice.payLink,
          qrCode: invoice.qrCode,
          amount,
          currency
        }
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/crypto/withdraw') {
    try {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const currency = String(body.crypto || 'USDT').toUpperCase();
      const address = String(body.address || '').trim();

      if (!amount || amount <= 0) {
        return sendJson(res, 400, { success: false, message: 'Montant invalide.' });
      }

      if (!address) {
        return sendJson(res, 400, { success: false, message: 'Adresse wallet obligatoire.' });
      }

      const payout = await createOxaPayPayout({
        amount,
        currency,
        address,
        callbackUrl: body.callbackUrl || `http://localhost:${PORT}/withdraw.html?withdraw=callback`,
        description: `Retrait ${amount} ${currency}`
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Demande de retrait envoyée à OxaPay.',
        data: {
          payoutId: payout.trackId || payout.payoutId || `wd-${Date.now()}`,
          status: payout.status || 'pending',
          amount,
          currency,
          address
        }
      });
    } catch (error) {
      return sendJson(res, 500, { success: false, message: error.message });
    }
  }

  return false;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/auth/')) {
    const handled = await handleAuth(req, res, pathname);
    if (handled !== false) return;
  }

  if (pathname.startsWith('/api/payments/')) {
    const handled = await handlePayments(req, res, pathname);
    if (handled !== false) return;
  }

  if (pathname.startsWith('/api/crypto/')) {
    const handled = await handleCrypto(req, res, pathname);
    if (handled !== false) return;
  }

  return sendJson(res, 404, { success: false, message: 'Route API introuvable.' });
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const finalPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;

    fs.readFile(finalPath, (readErr, fileContent) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': getMimeType(finalPath),
        'Cache-Control': 'no-cache'
      });
      res.end(fileContent);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  ensureDataStore();
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
