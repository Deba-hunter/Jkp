const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Use multi-file auth state (baileys v6.6.6)
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('session');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startSock();
      }
    } else if (connection === 'open') {
      console.log(' Connected to WhatsApp!');
    }
  });

  return sock;
}

let sockPromise = startSock();

app.use(express.static('views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file upload
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, 'messages.txt'),
});
const upload = multer({ storage });

// Serve HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// Start messaging loop
app.post('/start', upload.single('messageFile'), async (req, res) => {
  const number = req.body.number;
  const delayMs = parseInt(req.body.delay) * 1000;
  const filePath = path.join(__dirname, 'uploads/messages.txt');

  if (!fs.existsSync(filePath)) return res.status(400).send(' Message file not found');

  const messages = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  const sock = await sockPromise;

  async function sendLoop() {
    while (true) {
      for (const msg of messages) {
        await sock.sendMessage(jid, { text: msg });
        console.log(` Sent: ${msg}`);
        await delay(delayMs);
      }
    }
  }

  sendLoop();

  res.send(' Message sending started!');
});

app.listen(port, () => {
  console.log(` Server running at http://localhost:${port}`);
});
