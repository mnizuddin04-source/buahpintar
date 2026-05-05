/**
 * BuahPintar Backend Server
 * Menerima data dari ESP32 dan hantar ke Telegram Mini App via WebSocket
 * 
 * Jalankan: node server.js
 * Port: 3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ============================================================
// HTTP SERVER (serve index.html + handle ESP32 API)
// ============================================================
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Serve Telegram Mini App
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  // ── ESP32 POST: NFC Scan
  // ESP32 hantar: POST /api/nfc
  // Body: { "nfcId": "A1B2C3D4", "type": "scan" }
  if (url.pathname === '/api/nfc' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('[ESP32] NFC Scan:', data);

        // Broadcast ke semua Telegram Mini App clients
        broadcast({
          type: 'nfc_scan',
          nfcId: data.nfcId || data.id || '',
          rawData: data,
          ts: Date.now(),
        });

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'NFC received' }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Bad JSON' }));
      }
    });
    return;
  }

  // ── ESP32 POST: Register Students (scan player mode)
  // ESP32 hantar: POST /api/students
  // Body: { "students": [{"id":"12345","name":"Ahmad"},{"id":"67890","name":"Ali"},...] }
  if (url.pathname === '/api/students' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('[ESP32] Register Students:', data);

        broadcast({
          type: 'register_students',
          students: data.students || [],
          ts: Date.now(),
        });

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, count: (data.students || []).length }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Bad JSON' }));
      }
    });
    return;
  }

  // ── ESP32 POST: Answer Result (ESP32 check sendiri)
  // Body: { "studentId": "12345", "qIndex": 0, "correct": true, "fruitName": "Epal" }
  if (url.pathname === '/api/answer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('[ESP32] Answer:', data);

        broadcast({
          type: 'answer',
          studentId: data.studentId,
          qIndex: data.qIndex,
          correct: data.correct,
          fruitName: data.fruitName,
          scannedNFC: data.scannedNFC || '',
          ts: Date.now(),
        });

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  // ── Health Check
  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ============================================================
// WEBSOCKET SERVER
// ============================================================
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log(`[WS] Client sambung dari ${req.socket.remoteAddress}`);

  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Selamat datang ke BuahPintar Server!',
    ts: Date.now(),
  }));

  ws.on('message', (data) => {
    // Mini App boleh hantar mesej ke server (optional)
    try {
      const msg = JSON.parse(data.toString());
      console.log('[WS] Dari Mini App:', msg);
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnect');
  });
});

function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(str);
    }
  });
  console.log(`[WS] Broadcast kepada ${wss.clients.size} clients:`, msg.type);
}

// ============================================================
// START
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🍎  BuahPintar Server Running      ║');
  console.log(`║   Port: ${PORT}                         ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`📱 Telegram Mini App: http://YOUR_IP:${PORT}`);
  console.log(`🔌 WebSocket:         ws://YOUR_IP:${PORT}/ws`);
  console.log(`📡 ESP32 NFC API:     POST http://YOUR_IP:${PORT}/api/nfc`);
  console.log(`👥 ESP32 Students:    POST http://YOUR_IP:${PORT}/api/students`);
  console.log(`✅ ESP32 Answer:      POST http://YOUR_IP:${PORT}/api/answer`);
  console.log('');

  // Show local IP
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`🌐 IP Tempatan: http://${net.address}:${PORT}`);
      }
    }
  }
});
