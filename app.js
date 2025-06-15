const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('baileys');
const path = require('path');
const { toDataURL } = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer config
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_, __, cb) => cb(null, 'messages.txt'),
});
const upload = multer({ storage });

let qrCodeData = null;
let sock;
let isConnected = false;

// WhatsApp Connect Function
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr) {
      qrCodeData = await toDataURL(qr); // QR to base64
      isConnected = false;
    }
    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp!');
      qrCodeData = null;
      isConnected = true;
    }
    if (connection === 'close') {
      isConnected = false;
      startSock(); // auto reconnect
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

startSock();

// Routes
app.get('/', (req, res) => {
  if (!isConnected && qrCodeData) {
    // Show QR Code first
    res.send(`
      <h2>Scan QR Code to Login WhatsApp</h2>
      <img src="${qrCodeData}" width="300" height="300" />
      <p>Refresh this page after scanning</p>
    `);
  } else {
    // After login, show form
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  }
});

app.post('/start', upload.single('messageFile'), async (req, res) => {
  if (!sock?.user) return res.send('❌ Not connected to WhatsApp.');

  const number = req.body.number;
  const delayMs = parseInt(req.body.delay) * 1000;
  const filePath = path.join(__dirname, 'uploads/messages.txt');

  if (!fs.existsSync(filePath)) return res.status(400).send('❌ Message file not found.');

  const messages = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  (async function sendLoop() {
    while (true) {
      for (const msg of messages) {
        await sock.sendMessage(jid, { text: msg });
        console.log(`✅ Sent: ${msg}`);
        await delay(delayMs);
      }
    }
  })();

  res.send('✅ Message sending started!');
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
