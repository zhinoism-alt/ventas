const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// WhatsApp is optional - requires: npm install whatsapp-web.js qrcode
let client = null;
let qrCode = null;
let waStatus = 'disabled';
let waEnabled = false;

// WhatsApp only starts if WHATSAPP_ENABLED=true in .env
if (process.env.WHATSAPP_ENABLED === 'true') {
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const QRCode = require('qrcode');

    waEnabled = true;
    waStatus = 'initializing';

    client = new Client({
      authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    });

    client.on('qr', async (qr) => {
      qrCode = await QRCode.toDataURL(qr);
      waStatus = 'waiting_qr';
      console.log('[WhatsApp] QR generado - escanea desde la app');
    });

    client.on('ready', () => {
      waStatus = 'connected';
      qrCode = null;
      console.log('[WhatsApp] ✅ Conectado y listo');
    });

    client.on('disconnected', () => {
      waStatus = 'disconnected';
      console.log('[WhatsApp] ❌ Desconectado');
    });

    client.initialize();
    console.log('[WhatsApp] Iniciando...');
  } catch (err) {
    console.log('[WhatsApp] Error al iniciar:', err.message);
    waStatus = 'error';
  }
} else {
  console.log('[WhatsApp] Desactivado. Para activar: WHATSAPP_ENABLED=true en backend/.env');
}

// GET status
router.get('/status', (req, res) => {
  res.json({ status: waStatus, enabled: waEnabled });
});

// GET QR code
router.get('/qr', (req, res) => {
  if (qrCode) {
    res.json({ qr: qrCode });
  } else if (waStatus === 'connected') {
    res.json({ message: 'Ya conectado' });
  } else {
    res.json({ message: 'QR no disponible aún' });
  }
});

// POST send message
router.post('/send', async (req, res) => {
  if (!client || waStatus !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp no conectado' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone y message son requeridos' });
  }

  try {
    // Format phone: remove non-digits, add @c.us
    const formatted = phone.replace(/\D/g, '') + '@c.us';
    await client.sendMessage(formatted, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send renewal reminders
router.post('/send-renewals', async (req, res) => {
  const db = getDb();
  const { days = 3 } = req.body;

  const expiring = db.prepare(`
    SELECT s.*, c.phone, c.name as client_name, c.country
    FROM iptv_subscriptions s
    JOIN iptv_clients c ON s.client_id = c.id
    WHERE s.status = 'activo'
      AND date(s.end_date) <= date('now', '+' || ? || ' days')
      AND date(s.end_date) >= date('now')
      AND s.renewal_sent = 0
      AND c.phone != ''
  `).all(days);

  if (!client || waStatus !== 'connected') {
    // Return the messages that WOULD be sent (for manual sending)
    const messages = expiring.map(sub => ({
      phone: sub.phone,
      client: sub.client_name,
      end_date: sub.end_date,
      message: buildRenewalMessage(sub),
    }));
    return res.json({ manual_mode: true, messages, count: messages.length });
  }

  const results = [];
  for (const sub of expiring) {
    try {
      const message = buildRenewalMessage(sub);
      const phone = sub.phone.replace(/\D/g, '') + '@c.us';
      await client.sendMessage(phone, message);
      db.prepare('UPDATE iptv_subscriptions SET renewal_sent = 1 WHERE id = ?').run(sub.id);
      results.push({ client: sub.client_name, status: 'sent' });
    } catch (err) {
      results.push({ client: sub.client_name, status: 'error', error: err.message });
    }
  }

  res.json({ results, count: results.length });
});

// GET preview renewal messages
router.get('/preview-renewals', (req, res) => {
  const db = getDb();
  const days = req.query.days || 7;

  const expiring = db.prepare(`
    SELECT s.*, c.phone, c.name as client_name, c.country
    FROM iptv_subscriptions s
    JOIN iptv_clients c ON s.client_id = c.id
    WHERE s.status = 'activo'
      AND date(s.end_date) <= date('now', '+' || ? || ' days')
      AND date(s.end_date) >= date('now')
      AND c.phone != ''
    ORDER BY s.end_date ASC
  `).all(days);

  const messages = expiring.map(sub => ({
    id: sub.id,
    phone: sub.phone,
    client: sub.client_name,
    end_date: sub.end_date,
    connections: sub.connections,
    renewal_sent: sub.renewal_sent,
    message: buildRenewalMessage(sub),
  }));

  res.json(messages);
});

function buildRenewalMessage(sub) {
  const isMX = !sub.country || sub.country === 'MX';
  if (isMX) {
    return `Hola ${sub.client_name}! 👋\n\n` +
      `Tu servicio ELITE TV PLUS vence el *${sub.end_date}*.\n\n` +
      `Renueva antes de que se venza para no perder tu acceso 📺\n\n` +
      `Precios:\n` +
      `• 1 mes (${sub.connections} equipo${sub.connections > 1 ? 's' : ''}): $${sub.connections === 2 ? '260' : '200'} MXN\n` +
      `• 3 meses: $${sub.connections === 2 ? '675' : '540'} MXN\n` +
      `• 6 meses: $${sub.connections === 2 ? '1,200' : '990'} MXN\n\n` +
      `Escríbeme para renovar! 🙌`;
  } else {
    return `Hi ${sub.client_name}! 👋\n\n` +
      `Your ELITE TV PLUS service expires on *${sub.end_date}*.\n\n` +
      `Renew before it expires to keep your access 📺\n\n` +
      `Prices:\n` +
      `• 1 month: $${sub.connections === 2 ? '17' : '15'} USD\n` +
      `• 3 months: $${sub.connections === 2 ? '45' : '41'} USD\n` +
      `• 6 months: $${sub.connections === 2 ? '71' : '66'} USD\n\n` +
      `Message me to renew! 🙌`;
  }
}

module.exports = router;
