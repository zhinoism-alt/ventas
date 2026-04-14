require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const { getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/iptv', require('./routes/iptv'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Exchange rate endpoint
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

// Auto-refresh exchange rate every hour
cron.schedule('0 * * * *', async () => {
  try {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
    const mxnRate = response.data.rates.MXN;
    const db = getDb();
    db.prepare('UPDATE exchange_rates SET usd_to_mxn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(mxnRate);
    console.log(`[CRON] Tipo de cambio actualizado: 1 USD = ${mxnRate} MXN`);
  } catch (err) {
    console.log('[CRON] No se pudo actualizar tipo de cambio');
  }
});

// Auto-update expired IPTV subscriptions daily
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
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Base de datos: backend/data/ventas.db`);
  // Initialize DB on startup
  getDb();
});
