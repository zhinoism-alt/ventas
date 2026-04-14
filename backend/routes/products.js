const express = require('express');
const router = express.Router();
const { getDb, getRate } = require('../database');

function generateFBPost(product) {
  const conditionMap = {
    'nuevo': '✨ NUEVO / Sin uso',
    'como_nuevo': '🌟 Como nuevo',
    'buen_estado': '👍 Buen estado',
    'regular': '⚠️ Estado regular'
  };
  const cond = conditionMap[product.condition] || product.condition || '';
  const price = product.sale_price
    ? `💰 $${Number(product.sale_price).toLocaleString('es-MX')} ${product.sale_currency || 'MXN'}`
    : '';

  let post = `🔥 EN VENTA: ${product.name}\n`;
  if (cond) post += `${cond}\n`;
  if (price) post += `${price}\n`;
  post += `\n`;

  const details = [];
  if (product.brand) details.push(`Marca: ${product.brand}`);
  if (product.color) details.push(`Color: ${product.color}`);
  if (product.category) details.push(`Categoría: ${product.category}`);
  if (details.length) post += details.join(' | ') + '\n';

  if (product.notes) {
    post += `\n📝 ${product.notes}\n`;
  }

  post += `\n✅ Precio fijo / No cambios\n`;
  post += `📍 Entrega en punto acordado o envío disponible\n`;
  post += `📲 Escríbeme por DM o WhatsApp para más info`;

  return post;
}

// GET all products
router.get('/', (req, res) => {
  const db = getDb();
  const { status, category, search } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (status && status !== 'todos') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (category && category !== 'todas') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (name LIKE ? OR brand LIKE ? OR notes LIKE ? OR color LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY created_at DESC';

  const products = db.prepare(query).all(...params);
  res.json(products);
});

// GET single product
router.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(product);
});

// POST create product
router.post('/', (req, res) => {
  const db = getDb();
  const {
    name, brand = '', category = '', color = '', condition = 'buen_estado',
    notes = '', purchase_price = 0, purchase_currency = 'MXN',
    sale_price = 0, sale_currency = 'MXN', quantity = 1
  } = req.body;

  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const fbPost = generateFBPost(req.body);

  const result = db.prepare(`
    INSERT INTO products (name, brand, category, color, condition, notes,
      purchase_price, purchase_currency, sale_price, sale_currency, quantity, fb_post)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, brand, category, color, condition, notes,
    purchase_price, purchase_currency, sale_price, sale_currency, quantity, fbPost);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.json(product);
});

// PUT update product
router.put('/:id', (req, res) => {
  const db = getDb();
  const {
    name, brand = '', category = '', color = '', condition = 'buen_estado',
    notes = '', purchase_price = 0, purchase_currency = 'MXN',
    sale_price = 0, sale_currency = 'MXN', quantity = 1, status = 'disponible'
  } = req.body;

  const fbPost = generateFBPost(req.body);

  db.prepare(`
    UPDATE products SET name=?, brand=?, category=?, color=?, condition=?, notes=?,
      purchase_price=?, purchase_currency=?, sale_price=?, sale_currency=?,
      quantity=?, status=?, fb_post=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, brand, category, color, condition, notes,
    purchase_price, purchase_currency, sale_price, sale_currency,
    quantity, status, fbPost, req.params.id);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(product);
});

// DELETE product
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST sell product
router.post('/:id/sell', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const {
    quantity_sold = 1, sale_price = product.sale_price,
    sale_currency = product.sale_currency, buyer_name = '',
    payment_method = 'efectivo', notes = '', sale_date
  } = req.body;

  const saleRecord = db.prepare(`
    INSERT INTO sales (product_id, product_name, sale_date, quantity_sold, sale_price,
      sale_currency, buyer_name, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(product.id, product.name, sale_date || new Date().toISOString().split('T')[0],
    quantity_sold, sale_price, sale_currency, buyer_name, payment_method, notes);

  const newQty = product.quantity - quantity_sold;
  const newStatus = newQty <= 0 ? 'vendido' : product.status;
  db.prepare(`
    UPDATE products SET quantity=?, quantity_sold=quantity_sold+?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(Math.max(0, newQty), quantity_sold, newStatus, product.id);

  res.json({ success: true, sale_id: saleRecord.lastInsertRowid });
});

// GET regenerate FB post
router.get('/:id/fb-post', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ post: generateFBPost(product) });
});

// GET stats
router.get('/meta/stats', (req, res) => {
  try {
    const db = getDb();
    const usdToMxn = getRate();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'disponible' THEN 1 ELSE 0 END) as disponibles,
        SUM(CASE WHEN status = 'vendido'    THEN 1 ELSE 0 END) as vendidos,
        SUM(CASE WHEN status = 'reservado'  THEN 1 ELSE 0 END) as reservados,
        SUM(CASE WHEN purchase_currency = 'MXN'
                 THEN purchase_price * quantity
                 ELSE purchase_price * quantity * ?
            END) as total_invertido,
        SUM(CASE WHEN status = 'vendido' AND sale_currency = 'MXN'
                 THEN sale_price * quantity_sold
                 WHEN status = 'vendido' AND sale_currency = 'USD'
                 THEN sale_price * quantity_sold * ?
                 ELSE 0
            END) as total_vendido
      FROM products
    `).get(usdToMxn, usdToMxn);
    res.json({ ...stats, usd_to_mxn: usdToMxn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET categories list
router.get('/meta/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare(`SELECT DISTINCT category FROM products WHERE category != '' ORDER BY category`).all();
  res.json(cats.map(c => c.category));
});

module.exports = router;
