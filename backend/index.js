require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./database');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Servir frontend buildeado (si existe) ────────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const SERVE_STATIC = fs.existsSync(FRONTEND_DIST);
if (SERVE_STATIC) {
  app.use(express.static(FRONTEND_DIST));
  console.log(`[Static] Sirviendo frontend desde ${FRONTEND_DIST}`);
}

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── Rutas publicas ───────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ─── SPA fallback: rutas no-API sirven index.html (ANTES de requireAuth) ─────
// Esto permite que /login, /inventario, etc. carguen el React app sin auth
if (SERVE_STATIC) {
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    } else {
      next();
    }
  });
}

// ─── Rutas protegidas (requieren sesion activa) ───────────────────────────────
app.use(requireAuth);

app.use('/api/products',  require('./routes/products'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/iptv',      require('./routes/iptv'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/whatsapp',  require('./routes/whatsapp'));

app.get('/api/exchange-rate', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT * FROM exchange_rates WHERE id = 1').get();
  res.json(rate);
});

app.post('/api/exchange-rate/refresh', async (req, res) => {
  try {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
    const mxnRate = response.data.rates.MXN;
    const db = getDb();
    db.prepare('UPDATE exchange_rates SET usd_to_mxn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(mxnRate);
    res.json({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el tipo de cambio', current: getDb().prepare('SELECT * FROM exchange_rates WHERE id = 1').get() });
  }
});

// ─── Cron: actualizar tipo de cambio cada hora ────────────────────────────────
cron.schedule('0 * * * *', async () => {
  try {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
    const mxnRate = response.data.rates.MXN;
    const db = getDb();
    db.prepare('UPDATE exchange_rates SET usd_to_mxn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(mxnRate);
    console.log(`[CRON] Tipo de cambio actualizado: 1 USD = ${mxnRate} MXN`);
  } catch {
    console.log('[CRON] No se pudo actualizar tipo de cambio');
  }
});

// ─── Cron: marcar suscripciones vencidas cada dia ────────────────────────────
cron.schedule('0 8 * * *', () => {
  const db = getDb();
  const updated = db.prepare(`
    UPDATE iptv_subscriptions
    SET status = 'vencido'
    WHERE status = 'activo' AND date(end_date) < date('now')
  `).run();
  if (updated.changes > 0) {
    console.log(`[CRON] ${updated.changes} suscripciones marcadas como vencidas`);
  }
});


app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}`);
  console.log(`Base de datos: backend/data/ventas.db`);
  if (SERVE_STATIC) console.log(`Frontend: http://localhost:${PORT} (build estatico)`);
  getDb();
});
