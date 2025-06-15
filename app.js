const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, 'messages.txt'),
});
const upload = multer({ storage });

let sock;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('session');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      console.log('Reconnecting...');
      connectToWhatsApp();
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// Serve HTML UI
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

// Start Auto Messaging
app.post('/start', upload.single('messageFile'), async (req, res) => {
  const number = req.body.number;
  const delaySec = parseInt(req.body.delay) * 1000;
  const filePath = path.join(__dirname, 'uploads', 'messages.txt');

  if (!fs.existsSync(filePath)) {
    return res.status(400).send('Message file not found');
  }

  const messages = fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim());

  async function sendLoop() {
    while (true) {
      for (const msg of messages) {
        const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: msg });
        console.log(`Sent: ${msg}`);
        await delay(delaySec);
      }
    }
  }

  sendLoop(); // Run infinite loop
  res.send('✅ Auto messaging started!');
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
