const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all sales
router.get('/', (req, res) => {
  const db = getDb();
  const { from, to, search } = req.query;
  let query = `
    SELECT s.*, p.purchase_price, p.purchase_currency
    FROM sales s
    LEFT JOIN products p ON s.product_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (from) { query += ' AND s.sale_date >= ?'; params.push(from); }
  if (to) { query += ' AND s.sale_date <= ?'; params.push(to); }
  if (search) {
    query += ' AND (s.product_name LIKE ? OR s.buyer_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY s.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET monthly sales summary
router.get('/monthly', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', sale_date) as month,
      COUNT(*) as total_sales,
      SUM(CASE WHEN sale_currency = 'MXN' THEN sale_price * quantity_sold
               ELSE sale_price * quantity_sold * ${usdToMxn} END) as revenue_mxn
    FROM sales
    WHERE sale_date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', sale_date)
    ORDER BY month
  `).all();

  res.json(monthly);
});

// GET stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_ventas,
      SUM(CASE WHEN sale_currency = 'MXN' THEN sale_price * quantity_sold
               ELSE sale_price * quantity_sold * ${usdToMxn} END) as total_ingresos_mxn,
      SUM(CASE WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
               AND sale_currency = 'MXN' THEN sale_price * quantity_sold
               WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
               AND sale_currency = 'USD' THEN sale_price * quantity_sold * ${usdToMxn}
               ELSE 0 END) as ingresos_mes_actual
    FROM sales
  `).get();

  res.json({ ...stats, usd_to_mxn: usdToMxn });
});

// DELETE sale
router.delete('/:id', (req, res) => {
  const db = getDb();
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });

  // Restore product quantity
  if (sale.product_id) {
    db.prepare(`
      UPDATE products SET quantity = quantity + ?,
        quantity_sold = MAX(0, quantity_sold - ?),
        status = CASE WHEN quantity + ? > 0 THEN 'disponible' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sale.quantity_sold, sale.quantity_sold, sale.quantity_sold, sale.product_id);
  }

  db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
