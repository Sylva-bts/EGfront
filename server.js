const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const OXAPAY_API_BASE = 'https://api.oxapay.com';

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
      } catch (error) {
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

async function createOxaPayInvoice(payload) {
  const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!merchantApiKey) {
    throw new Error('OXAPAY_MERCHANT_API_KEY manquant');
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
    throw new Error('OXAPAY_PAYOUT_API_KEY (ou OXAPAY_MERCHANT_API_KEY) manquant');
  }

  const response = await fetch(`${OXAPAY_API_BASE}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: payoutApiKey,
      ...payload
    })
  });

  const data = await response.json();
  if (!response.ok || !data?.result) {
    throw new Error(data?.message || 'Erreur OxaPay (retrait)');
  }

  return data;
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

  return sendJson(res, 404, { success: false, message: 'Route API introuvable.' });
}

function serveStatic(req, res, pathname) {
  let requestedPath = pathname === '/' ? '/index.html' : pathname;
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
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
