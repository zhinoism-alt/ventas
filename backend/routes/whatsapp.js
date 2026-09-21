const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ─── WhatsApp client (optional) ──────────────────────────────────────────────
let client = null;
let qrCode = null;
let waStatus = 'disabled';
let waEnabled = false;

// Palabras clave que activan auto-respuesta de renovacion
const RENEWAL_KEYWORDS = [
  'renovar', 'renovacion', 'renewal', 'renew',
  'vencio', 'vencida', 'expirado', 'expired',
  'precio', 'cuanto', 'costo', 'cost', 'price',
  'iptv', 'servicio', 'service',
];

function containsRenewalKeyword(text) {
  const lower = text.toLowerCase();
  return RENEWAL_KEYWORDS.some(kw => lower.includes(kw));
}

function buildAutoReply(fromPhone, db) {
  // Buscar si el numero tiene una suscripcion activa
  const phone = fromPhone.replace('@c.us', '').replace(/\D/g, '');
  const sub = db.prepare(`
    SELECT s.*, c.name as client_name, c.country
    FROM iptv_subscriptions s
    JOIN iptv_clients c ON s.client_id = c.id
    WHERE replace(replace(c.phone, ' ', ''), '-', '') LIKE ?
      AND s.status = 'activo'
    ORDER BY s.end_date DESC LIMIT 1
  `).get(`%${phone.slice(-8)}`);

  const isMX = !sub?.country || sub?.country === 'MX';

  if (sub) {
    // Cliente con suscripcion activa
    const daysLeft = Math.ceil((new Date(sub.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (isMX) {
      return `Hola ${sub.client_name}! 👋\n\n` +
        `Tu servicio ELITE TV PLUS vence el *${sub.end_date}* (${daysLeft > 0 ? `${daysLeft} dias restantes` : 'VENCIDO'}).\n\n` +
        `📺 Precios de renovacion:\n` +
        `• 1 mes (${sub.connections} equipo${sub.connections > 1 ? 's' : ''}): $${sub.connections === 2 ? '260' : '200'} MXN\n` +
        `• 3 meses: $${sub.connections === 2 ? '675' : '540'} MXN\n` +
        `• 6 meses: $${sub.connections === 2 ? '1,200' : '990'} MXN\n\n` +
        `Escríbeme cuantos meses deseas renovar y te doy los datos de pago 🙌`;
    } else {
      return `Hi ${sub.client_name}! 👋\n\n` +
        `Your ELITE TV PLUS expires on *${sub.end_date}* (${daysLeft > 0 ? `${daysLeft} days left` : 'EXPIRED'}).\n\n` +
        `📺 Renewal prices:\n` +
        `• 1 month: $${sub.connections === 2 ? '17' : '15'} USD\n` +
        `• 3 months: $${sub.connections === 2 ? '45' : '41'} USD\n` +
        `• 6 months: $${sub.connections === 2 ? '71' : '66'} USD\n\n` +
        `Let me know how many months you want and I'll send payment details 🙌`;
    }
  } else {
    // Cliente nuevo o sin suscripcion encontrada
    return `Hola! 👋 Gracias por contactarnos.\n\n` +
      `Somos *ELITE TV PLUS* - Servicio de IPTV premium 📺\n\n` +
      `Precios:\n` +
      `• 1 conexion: $200 MXN/mes | $15 USD/mes\n` +
      `• 2 conexiones: $260 MXN/mes | $17 USD/mes\n\n` +
      `Paquetes disponibles:\n` +
      `• 3 meses: ahorra 10%\n` +
      `• 6 meses: ahorra 15%\n\n` +
      `Escríbeme para mas informacion o para activar tu servicio 🙌`;
  }
}

// ─── Inicializar WhatsApp ─────────────────────────────────────────────────────
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

    // ─── Auto-respuesta inteligente ──────────────────────────────────────────
    client.on('message', async (msg) => {
      // Solo mensajes de texto entrantes, no de grupos
      if (msg.fromMe || msg.isGroupMsg) return;
      if (msg.type !== 'chat') return;

      const db = getDb();

      // Guardar mensaje en historial
      try {
        db.prepare(`
          INSERT OR IGNORE INTO wa_messages (phone, direction, body, timestamp)
          VALUES (?, 'in', ?, datetime('now'))
        `).run(msg.from, msg.body?.slice(0, 500));
      } catch {}

      // Verificar si la respuesta automatica esta habilitada
      const config = db.prepare("SELECT value FROM wa_config WHERE key = 'auto_reply_enabled'").get();
      if (config?.value !== '1') return;

      // Verificar cooldown (no responder 2 veces en 30 min al mismo numero)
      const recent = db.prepare(`
        SELECT id FROM wa_messages
        WHERE phone = ? AND direction = 'out' AND timestamp > datetime('now', '-30 minutes')
        LIMIT 1
      `).get(msg.from);
      if (recent) return;

      if (containsRenewalKeyword(msg.body || '')) {
        const reply = buildAutoReply(msg.from, db);
        await client.sendMessage(msg.from, reply);
        try {
          db.prepare(`
            INSERT INTO wa_messages (phone, direction, body, timestamp)
            VALUES (?, 'out', ?, datetime('now'))
          `).run(msg.from, reply.slice(0, 500));
        } catch {}
        console.log(`[WhatsApp] Auto-reply enviado a ${msg.from}`);
      }
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

// ─── GET /status ──────────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb();
  const config = db.prepare("SELECT value FROM wa_config WHERE key = 'auto_reply_enabled'").get();
  res.json({
    status: waStatus,
    enabled: waEnabled,
    auto_reply: config?.value === '1',
  });
});

// ─── GET /qr ─────────────────────────────────────────────────────────────────
router.get('/qr', (req, res) => {
  if (qrCode) return res.json({ qr: qrCode });
  if (waStatus === 'connected') return res.json({ message: 'Ya conectado' });
  res.json({ message: 'QR no disponible aun' });
});

// ─── POST /send ───────────────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  if (!client || waStatus !== 'connected')
    return res.status(503).json({ error: 'WhatsApp no conectado' });
  const { phone, message } = req.body;
  if (!phone || !message)
    return res.status(400).json({ error: 'phone y message son requeridos' });
  try {
    const formatted = phone.replace(/\D/g, '') + '@c.us';
    await client.sendMessage(formatted, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auto-reply ─────────────────────────────────────────────────────────
router.post('/auto-reply', (req, res) => {
  const db = getDb();
  const { enabled } = req.body;
  db.prepare("INSERT OR REPLACE INTO wa_config (key, value) VALUES ('auto_reply_enabled', ?)").run(enabled ? '1' : '0');
  res.json({ auto_reply: enabled });
});

// ─── GET /messages ────────────────────────────────────────────────────────────
router.get('/messages', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 50;
  const messages = db.prepare(`
    SELECT * FROM wa_messages ORDER BY timestamp DESC LIMIT ?
  `).all(limit);
  res.json(messages);
});

// ─── POST /send-renewals ──────────────────────────────────────────────────────
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
      try {
        db.prepare(`INSERT INTO wa_messages (phone, direction, body, timestamp) VALUES (?, 'out', ?, datetime('now'))`).run(phone, message.slice(0,500));
      } catch {}
      results.push({ client: sub.client_name, status: 'sent' });
    } catch (err) {
      results.push({ client: sub.client_name, status: 'error', error: err.message });
    }
  }
  res.json({ results, count: results.length });
});

// ─── GET /preview-renewals ────────────────────────────────────────────────────
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
  res.json(expiring.map(sub => ({
    id: sub.id,
    phone: sub.phone,
    client: sub.client_name,
    end_date: sub.end_date,
    connections: sub.connections,
    renewal_sent: sub.renewal_sent,
    message: buildRenewalMessage(sub),
  })));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
