const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://mnizuddin04_db_user:hjnJ0fcsSmqQFsBF@futureminds.1smryty.mongodb.net/buahpintar?appName=FutureMinds';

let db = null;
let collection = null;

async function connectMongo() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('buahpintar');
    collection = db.collection('appdata');
    console.log('✅ MongoDB bersambung!');
    const existing = await collection.findOne({ _id: 'store' });
    if (!existing) {
      await collection.insertOne({ _id: 'store', ...defaultStore() });
    }
  } catch (e) {
    console.error('❌ MongoDB error:', e.message);
    setTimeout(connectMongo, 5000);
  }
}

function defaultStore() {
  return {
    students: [],
    nfcCards: [],
    questions: [
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
    ],
    session: {
      active: false, currentQ: 0, currentStudentIdx: 0,
      studentOrder: [], answers: [],
    },
    activityLog: [],
    sessionCount: 0,
  };
}

async function loadStore() {
  try {
    const doc = await collection.findOne({ _id: 'store' });
    if (doc) { delete doc._id; return doc; }
  } catch (e) {}
  return defaultStore();
}

async function saveStore(data) {
  try {
    await collection.updateOne({ _id: 'store' }, { $set: data }, { upsert: true });
  } catch (e) { console.error('[MongoDB] Save error:', e.message); }
}

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
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end('{}'); }
    });
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true, mongo: !!db, clients: wss.clients.size }));
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', async (ws) => {
  console.log('[WS] Client sambung. Total:', wss.clients.size);
  const store = await loadStore();
  ws.send(JSON.stringify({ type: 'sync', data: store }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'update') {
        if (msg.key && msg.value !== undefined) {
          await saveStore({ [msg.key]: msg.value });
          const updated = await loadStore();
          broadcastExcept(ws, { type: 'sync', data: updated });
        }
      } else if (msg.type === 'sync_request') {
        const store = await loadStore();
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

connectMongo().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🍎 BuahPintar v3 — Port ${PORT}`);
  });
});
