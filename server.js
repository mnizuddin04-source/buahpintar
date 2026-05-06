/**
 * BuahPintar Backend Server v2
 * Data disimpan dalam server — sync ke semua device
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ============================================================
// DATA STORE
// ============================================================
let store = {
  students: [],
  nfcCards: [],
  questions: initDefaultQuestions(),
  session: {
    active: false, currentQ: 0, currentStudentIdx: 0,
    studentOrder: [], answers: [],
  },
  activityLog: [],
  sessionCount: 0,
};

function initDefaultQuestions() {
  return [
    {fruitName:'Epal', fruitEmoji:'🍎', correctNFCId:''},
    {fruitName:'Oren', fruitEmoji:'🍊', correctNFCId:''},
    {fruitName:'Anggur', fruitEmoji:'🍇', correctNFCId:''},
    {fruitName:'Pisang', fruitEmoji:'🍌', correctNFCId:''},
    {fruitName:'Strawberi', fruitEmoji:'🍓', correctNFCId:''},
    {fruitName:'Mangga', fruitEmoji:'🥭', correctNFCId:''},
    {fruitName:'Nanas', fruitEmoji:'🍍', correctNFCId:''},
    {fruitName:'Tembikai', fruitEmoji:'🍉', correctNFCId:''},
    {fruitName:'Kiwi', fruitEmoji:'🥝', correctNFCId:''},
    {fruitName:'Ceri', fruitEmoji:'🍒', correctNFCId:''},
  ];
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      store = { ...store, ...saved };
      if (!store.questions || store.questions.length === 0) store.questions = initDefaultQuestions();
      console.log('[Data] Loaded');
    }
  } catch (e) { console.log('[Data] Fresh start'); }
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); }
  catch (e) { console.log('[Data] Save error:', e.message); }
}

loadData();

// ============================================================
// HTTP SERVER
// ============================================================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200); res.end(data);
    });
    return;
  }

  if (url.pathname === '/api/nfc' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        broadcast({ type: 'nfc_scan', nfcId: data.nfcId || '', rawData: data, ts: Date.now() });
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end('{}'); }
    });
    return;
  }

  if (url.pathname === '/api/students' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        broadcast({ type: 'register_students', students: data.students || [], ts: Date.now() });
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end('{}'); }
    });
    return;
  }

  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, students: store.students.length }));
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

// ============================================================
// WEBSOCKET — sync data semua device
// ============================================================
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client sambung. Total:', wss.clients.size);

  // Hantar data terkini kepada client baru
  ws.send(JSON.stringify({ type: 'sync', data: store }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'update') {
        // Simpan data dari client
        if (msg.key && msg.value !== undefined) {
          store[msg.key] = msg.value;
          saveData();
          // Broadcast ke semua client lain
          broadcastExcept(ws, { type: 'sync', data: store });
          console.log('[WS] Updated:', msg.key);
        }
      } else if (msg.type === 'sync_request') {
        ws.send(JSON.stringify({ type: 'sync', data: store }));
      }

    } catch (e) {}
  });

  ws.on('close', () => console.log('[WS] Client disconnect'));
});

function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(str); });
}

function broadcastExcept(sender, msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c !== sender && c.readyState === 1) c.send(str); });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍎 BuahPintar Server v2 — Port ${PORT}\n`);
});
