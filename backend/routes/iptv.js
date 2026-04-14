const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ─── PANEL PRICES (from Elite TV Plus) ───────────────────────────────────────
const PANEL_PRICES = {
  '1conn': [
    { credits: 15, price_mxn: 1200, price_usd: 75 },
    { credits: 30, price_mxn: 2100, price_usd: 135 },
    { credits: 50, price_mxn: 3250, price_usd: 250 },
  ],
  '2conn': [
    { credits: 15, price_mxn: 1450, price_usd: 95 },
    { credits: 30, price_mxn: 2700, price_usd: 174 },
    { credits: 50, price_mxn: 4250, price_usd: 270 },
  ],
};

const SELL_PRICES = {
  '1conn': [
    { months: 1, price_mxn: 200, price_usd: 15 },
    { months: 3, price_mxn: 540, price_usd: 41 },
    { months: 6, price_mxn: 990, price_usd: 66 },
  ],
  '2conn': [
    { months: 1, price_mxn: 260, price_usd: 17 },
    { months: 3, price_mxn: 675, price_usd: 45 },
    { months: 6, price_mxn: 1200, price_usd: 71 },
  ],
};

// ─── PACKAGES (Credits) ───────────────────────────────────────────────────────
router.get('/packages', (req, res) => {
  const db = getDb();
  const packages = db.prepare('SELECT * FROM iptv_packages ORDER BY created_at DESC').all();
  res.json(packages);
});

router.get('/packages/balance', (req, res) => {
  const db = getDb();
  const balance = db.prepare(`
    SELECT
      connections,
      SUM(credits) as total_comprados,
      SUM(credits_remaining) as disponibles,
      SUM(credits - credits_remaining) as usados
    FROM iptv_packages
    WHERE is_active = 1
    GROUP BY connections
  `).all();
  res.json(balance);
});

router.post('/packages', (req, res) => {
  const db = getDb();
  const {
    connections = 1, credits, price_paid, price_currency = 'MXN',
    purchase_date, notes = ''
  } = req.body;

  if (!credits || !price_paid) {
    return res.status(400).json({ error: 'Credits y price_paid son requeridos' });
  }

  const result = db.prepare(`
    INSERT INTO iptv_packages (connections, credits, price_paid, price_currency,
      credits_remaining, purchase_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(connections, credits, price_paid, price_currency, credits,
    purchase_date || new Date().toISOString().split('T')[0], notes);

  res.json(db.prepare('SELECT * FROM iptv_packages WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/packages/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM iptv_packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
router.get('/clients', (req, res) => {
  const db = getDb();
  const clients = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM iptv_subscriptions s WHERE s.client_id = c.id AND s.status = 'activo') as active_subs,
      (SELECT MAX(end_date) FROM iptv_subscriptions s WHERE s.client_id = c.id AND s.status = 'activo') as next_expiry
    FROM iptv_clients c
    ORDER BY c.created_at DESC
  `).all();
  res.json(clients);
});

router.post('/clients', (req, res) => {
  const db = getDb();
  const { name, phone = '', country = 'MX', email = '', notes = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const result = db.prepare(
    'INSERT INTO iptv_clients (name, phone, country, email, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(name, phone, country, email, notes);

  res.json(db.prepare('SELECT * FROM iptv_clients WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/clients/:id', (req, res) => {
  const db = getDb();
  const { name, phone = '', country = 'MX', email = '', notes = '', is_active = 1 } = req.body;

  db.prepare(`
    UPDATE iptv_clients SET name=?, phone=?, country=?, email=?, notes=?, is_active=?
    WHERE id=?
  `).run(name, phone, country, email, notes, is_active, req.params.id);

  res.json(db.prepare('SELECT * FROM iptv_clients WHERE id = ?').get(req.params.id));
});

router.delete('/clients/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM iptv_clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
router.get('/subscriptions', (req, res) => {
  const db = getDb();
  const { status, client_id } = req.query;
  let query = 'SELECT s.*, c.phone as client_phone, c.country as client_country FROM iptv_subscriptions s LEFT JOIN iptv_clients c ON s.client_id = c.id WHERE 1=1';
  const params = [];

  if (status && status !== 'todos') { query += ' AND s.status = ?'; params.push(status); }
  if (client_id) { query += ' AND s.client_id = ?'; params.push(client_id); }

  query += ' ORDER BY s.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/subscriptions/expiring', (req, res) => {
  const db = getDb();
  const days = req.query.days || 7;
  const expiring = db.prepare(`
    SELECT s.*, c.phone as client_phone, c.country as client_country
    FROM iptv_subscriptions s
    LEFT JOIN iptv_clients c ON s.client_id = c.id
    WHERE s.status = 'activo'
      AND date(s.end_date) <= date('now', '+' || ? || ' days')
      AND date(s.end_date) >= date('now')
    ORDER BY s.end_date ASC
  `).all(days);
  res.json(expiring);
});

router.post('/subscriptions', (req, res) => {
  const db = getDb();
  const {
    client_id, package_id, connections = 1, months = 1,
    price_charged, price_currency = 'MXN', start_date, notes = ''
  } = req.body;

  if (!client_id || !price_charged || !start_date) {
    return res.status(400).json({ error: 'client_id, price_charged y start_date son requeridos' });
  }

  // Calculate credits to use
  const creditsToUse = months; // 1 credit = 1 month regardless of connections (you buy the right package)

  // Deduct from package if provided
  let costPerCredit = 0;
  if (package_id) {
    const pkg = db.prepare('SELECT * FROM iptv_packages WHERE id = ?').get(package_id);
    if (!pkg) return res.status(404).json({ error: 'Paquete no encontrado' });
    if (pkg.credits_remaining < creditsToUse) {
      return res.status(400).json({ error: `No hay suficientes créditos. Disponibles: ${pkg.credits_remaining}` });
    }

    costPerCredit = pkg.price_paid / pkg.credits;
    db.prepare('UPDATE iptv_packages SET credits_remaining = credits_remaining - ? WHERE id = ?')
      .run(creditsToUse, package_id);
  }

  // Calculate end date
  const start = new Date(start_date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  const end_date = end.toISOString().split('T')[0];

  const client = db.prepare('SELECT name FROM iptv_clients WHERE id = ?').get(client_id);

  const result = db.prepare(`
    INSERT INTO iptv_subscriptions (client_id, client_name, package_id, connections, months,
      price_charged, price_currency, credits_used, cost_per_credit, start_date, end_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, client?.name || '', package_id || null, connections, months,
    price_charged, price_currency, creditsToUse, costPerCredit,
    start_date, end_date, notes);

  // Update client active status
  db.prepare('UPDATE iptv_clients SET is_active = 1 WHERE id = ?').run(client_id);

  res.json(db.prepare('SELECT * FROM iptv_subscriptions WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/subscriptions/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE iptv_subscriptions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

router.delete('/subscriptions/:id', (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM iptv_subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

  // Restore credits if package was used
  if (sub.package_id) {
    db.prepare('UPDATE iptv_packages SET credits_remaining = credits_remaining + ? WHERE id = ?')
      .run(sub.credits_used, sub.package_id);
  }

  db.prepare('DELETE FROM iptv_subscriptions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const clients = db.prepare('SELECT COUNT(*) as total, SUM(is_active) as activos FROM iptv_clients').get();
  const subs = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='activo' THEN 1 ELSE 0 END) as activas,
      SUM(CASE WHEN status='vencido' THEN 1 ELSE 0 END) as vencidas,
      SUM(CASE WHEN status='activo' AND price_currency='MXN' THEN price_charged
               WHEN status='activo' AND price_currency='USD' THEN price_charged * ${usdToMxn}
               ELSE 0 END) as ingresos_activos_mxn
    FROM iptv_subscriptions
  `).get();

  const monthlyRevenue = db.prepare(`
    SELECT
      strftime('%Y-%m', start_date) as month,
      SUM(CASE WHEN price_currency='MXN' THEN price_charged
               ELSE price_charged * ${usdToMxn} END) as revenue_mxn,
      SUM(CASE WHEN price_currency='MXN' THEN cost_per_credit * credits_used
               ELSE cost_per_credit * credits_used * ${usdToMxn} END) as cost_mxn,
      COUNT(*) as subscriptions
    FROM iptv_subscriptions
    WHERE start_date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', start_date)
    ORDER BY month
  `).all();

  const credits = db.prepare(`
    SELECT connections, SUM(credits) as total, SUM(credits_remaining) as disponibles
    FROM iptv_packages WHERE is_active = 1 GROUP BY connections
  `).all();

  const expiringSoon = db.prepare(`
    SELECT COUNT(*) as count FROM iptv_subscriptions
    WHERE status='activo' AND date(end_date) <= date('now', '+7 days')
  `).get();

  res.json({
    clients,
    subscriptions: subs,
    monthly_revenue: monthlyRevenue,
    credits,
    expiring_soon: expiringSoon.count,
    usd_to_mxn: usdToMxn
  });
});

// ─── PRICING OPTIMIZER ───────────────────────────────────────────────────────
router.get('/pricing', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const analysis = [];

  for (const [connKey, prices] of Object.entries(PANEL_PRICES)) {
    for (const pkg of prices) {
      const costPerCredit = pkg.price_mxn / pkg.credits;
      const sellOptions = SELL_PRICES[connKey];

      for (const sell of sellOptions) {
        const profitPerCredit = sell.price_mxn - costPerCredit;
        const margin = ((profitPerCredit / sell.price_mxn) * 100).toFixed(1);
        const profitUsd = (sell.price_usd - (pkg.price_usd / pkg.credits));

        analysis.push({
          connections: connKey === '1conn' ? 1 : 2,
          package_credits: pkg.credits,
          buy_price_mxn: pkg.price_mxn,
          buy_price_usd: pkg.price_usd,
          cost_per_credit_mxn: costPerCredit.toFixed(2),
          sell_months: sell.months,
          sell_price_mxn: sell.price_mxn,
          sell_price_usd: sell.price_usd,
          profit_per_credit_mxn: profitPerCredit.toFixed(2),
          profit_usd: profitUsd.toFixed(2),
          margin_percent: margin,
        });
      }
    }
  }

  // Custom price calculator
  const customPrices = [150, 200, 250, 300].map(price => {
    const costPerCredit = PANEL_PRICES['1conn'][1].price_mxn / PANEL_PRICES['1conn'][1].credits; // 30-pack
    return {
      price_mxn: price,
      cost_per_credit: costPerCredit,
      profit_per_client: (price - costPerCredit).toFixed(2),
      margin: (((price - costPerCredit) / price) * 100).toFixed(1),
      monthly_18_clients: ((price - costPerCredit) * 18).toFixed(0),
    };
  });

  res.json({ analysis, custom_comparison: customPrices, panel_prices: PANEL_PRICES, sell_prices: SELL_PRICES });
});

module.exports = router;
