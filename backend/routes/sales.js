const express = require('express');
const router = express.Router();
const { getDb, getRate } = require('../database');

// GET all sales
router.get('/', (req, res) => {
  try {
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
    if (to)   { query += ' AND s.sale_date <= ?'; params.push(to); }
    if (search) {
      query += ' AND (s.product_name LIKE ? OR s.buyer_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY s.created_at DESC';
    res.json(db.prepare(query).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET monthly sales summary
router.get('/monthly', (req, res) => {
  try {
    const db = getDb();
    const usdToMxn = getRate();
    const monthly = db.prepare(`
      SELECT
        strftime('%Y-%m', sale_date) as month,
        COUNT(*) as total_sales,
        SUM(CASE WHEN sale_currency = 'MXN'
                 THEN sale_price * quantity_sold
                 ELSE sale_price * quantity_sold * ?
            END) as revenue_mxn
      FROM sales
      WHERE sale_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', sale_date)
      ORDER BY month
    `).all(usdToMxn);
    res.json(monthly);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const usdToMxn = getRate();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_ventas,
        SUM(CASE WHEN sale_currency = 'MXN'
                 THEN sale_price * quantity_sold
                 ELSE sale_price * quantity_sold * ?
            END) as total_ingresos_mxn,
        SUM(CASE WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
                 AND sale_currency = 'MXN' THEN sale_price * quantity_sold
                 WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
                 AND sale_currency = 'USD' THEN sale_price * quantity_sold * ?
                 ELSE 0
            END) as ingresos_mes_actual
      FROM sales
    `).get(usdToMxn, usdToMxn);
    res.json({ ...stats, usd_to_mxn: usdToMxn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE sale
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });

    if (sale.product_id) {
      db.prepare(`
        UPDATE products SET
          quantity      = quantity + ?,
          quantity_sold = MAX(0, quantity_sold - ?),
          status        = CASE WHEN quantity + ? > 0 THEN 'disponible' ELSE status END,
          updated_at    = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(sale.quantity_sold, sale.quantity_sold, sale.quantity_sold, sale.product_id);
    }

    db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
