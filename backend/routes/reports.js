const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { getDb } = require('../database');

// GET combined dashboard stats
router.get('/summary', (req, res) => {
  const db = getDb();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const productStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN purchase_currency='MXN' THEN purchase_price * (quantity + quantity_sold)
               ELSE purchase_price * (quantity + quantity_sold) * ${usdToMxn} END), 0) as total_invertido,
      COALESCE(SUM(CASE WHEN status='vendido' AND sale_currency='MXN' THEN sale_price * quantity_sold
               WHEN status='vendido' AND sale_currency='USD' THEN sale_price * quantity_sold * ${usdToMxn}
               ELSE 0 END), 0) as total_vendido_catalogo
    FROM products
  `).get();

  const salesRevenue = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN sale_currency='MXN' THEN sale_price * quantity_sold
           ELSE sale_price * quantity_sold * ${usdToMxn} END), 0) as total
    FROM sales
  `).get();

  const iptvRevenue = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN price_currency='MXN' THEN price_charged
           ELSE price_charged * ${usdToMxn} END), 0) as total,
    COALESCE(SUM(cost_per_credit * credits_used), 0) as total_costo
    FROM iptv_subscriptions
  `).get();

  const iptvCost = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN price_currency='MXN' THEN price_paid
           ELSE price_paid * ${usdToMxn} END), 0) as total
    FROM iptv_packages
  `).get();

  const activeClients = db.prepare(`
    SELECT COUNT(DISTINCT client_id) as count
    FROM iptv_subscriptions WHERE status='activo'
  `).get();

  // Monthly chart (last 6 months)
  const monthlyProducts = db.prepare(`
    SELECT strftime('%Y-%m', sale_date) as month,
      SUM(CASE WHEN sale_currency='MXN' THEN sale_price * quantity_sold
               ELSE sale_price * quantity_sold * ${usdToMxn} END) as revenue
    FROM sales
    WHERE sale_date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  const monthlyIPTV = db.prepare(`
    SELECT strftime('%Y-%m', start_date) as month,
      SUM(CASE WHEN price_currency='MXN' THEN price_charged
               ELSE price_charged * ${usdToMxn} END) as revenue,
      SUM(cost_per_credit * credits_used) as costo
    FROM iptv_subscriptions
    WHERE start_date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  // Merge months
  const months = {};
  monthlyProducts.forEach(r => {
    if (!months[r.month]) months[r.month] = { month: r.month, productos: 0, iptv: 0, costo_iptv: 0 };
    months[r.month].productos = r.revenue || 0;
  });
  monthlyIPTV.forEach(r => {
    if (!months[r.month]) months[r.month] = { month: r.month, productos: 0, iptv: 0, costo_iptv: 0 };
    months[r.month].iptv = r.revenue || 0;
    months[r.month].costo_iptv = r.costo || 0;
  });

  const monthlyChart = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));

  const totalIngresos = salesRevenue.total + iptvRevenue.total;
  const totalGastos = productStats.total_invertido + iptvCost.total;
  const ganancia = totalIngresos - totalGastos;

  res.json({
    total_ingresos_mxn: totalIngresos,
    total_gastos_mxn: totalGastos,
    ganancia_neta_mxn: ganancia,
    ingresos_productos: salesRevenue.total,
    ingresos_iptv: iptvRevenue.total,
    clientes_activos_iptv: activeClients.count,
    monthly_chart: monthlyChart,
    usd_to_mxn: usdToMxn,
  });
});

// GET monthly breakdown
router.get('/monthly', (req, res) => {
  const db = getDb();
  const { year } = req.query;
  const y = year || new Date().getFullYear();
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const productsByMonth = db.prepare(`
    SELECT strftime('%m', sale_date) as mes,
      COUNT(*) as ventas,
      SUM(CASE WHEN sale_currency='MXN' THEN sale_price * quantity_sold
               ELSE sale_price * quantity_sold * ${usdToMxn} END) as ingresos
    FROM sales WHERE strftime('%Y', sale_date) = ?
    GROUP BY mes ORDER BY mes
  `).all(String(y));

  const iptvByMonth = db.prepare(`
    SELECT strftime('%m', start_date) as mes,
      COUNT(*) as suscripciones,
      SUM(CASE WHEN price_currency='MXN' THEN price_charged
               ELSE price_charged * ${usdToMxn} END) as ingresos,
      SUM(cost_per_credit * credits_used) as costos
    FROM iptv_subscriptions WHERE strftime('%Y', start_date) = ?
    GROUP BY mes ORDER BY mes
  `).all(String(y));

  res.json({ products: productsByMonth, iptv: iptvByMonth, year: y });
});

// GET export Excel
router.get('/export', (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const rate = db.prepare('SELECT usd_to_mxn FROM exchange_rates WHERE id = 1').get();
  const usdToMxn = rate ? rate.usd_to_mxn : 17.5;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Inventario
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  const productsData = products.map(p => ({
    'ID': p.id,
    'Nombre': p.name,
    'Marca': p.brand,
    'Categoría': p.category,
    'Color': p.color,
    'Condición': p.condition,
    'Notas': p.notes,
    'Precio Compra': p.purchase_price,
    'Moneda Compra': p.purchase_currency,
    'Precio Compra (MXN)': p.purchase_currency === 'USD' ? (p.purchase_price * usdToMxn).toFixed(2) : p.purchase_price,
    'Precio Venta': p.sale_price,
    'Moneda Venta': p.sale_currency,
    'Precio Venta (MXN)': p.sale_currency === 'USD' ? (p.sale_price * usdToMxn).toFixed(2) : p.sale_price,
    'Cantidad': p.quantity,
    'Vendidos': p.quantity_sold,
    'Estado': p.status,
    'Fecha': p.created_at,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productsData), 'Inventario');

  // Sheet 2: Ventas
  let salesQuery = 'SELECT * FROM sales WHERE 1=1';
  const salesParams = [];
  if (from) { salesQuery += ' AND sale_date >= ?'; salesParams.push(from); }
  if (to) { salesQuery += ' AND sale_date <= ?'; salesParams.push(to); }
  salesQuery += ' ORDER BY sale_date DESC';

  const sales = db.prepare(salesQuery).all(...salesParams);
  const salesData = sales.map(s => ({
    'ID': s.id,
    'Producto': s.product_name,
    'Fecha': s.sale_date,
    'Cantidad': s.quantity_sold,
    'Precio Venta': s.sale_price,
    'Moneda': s.sale_currency,
    'Total (MXN)': s.sale_currency === 'USD' ? (s.sale_price * s.quantity_sold * usdToMxn).toFixed(2) : (s.sale_price * s.quantity_sold).toFixed(2),
    'Comprador': s.buyer_name,
    'Método Pago': s.payment_method,
    'Notas': s.notes,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Ventas');

  // Sheet 3: Clientes IPTV
  const clients = db.prepare(`
    SELECT c.*, COUNT(s.id) as total_subs,
      SUM(CASE WHEN s.status='activo' THEN 1 ELSE 0 END) as subs_activas
    FROM iptv_clients c
    LEFT JOIN iptv_subscriptions s ON c.id = s.client_id
    GROUP BY c.id ORDER BY c.name
  `).all();
  const clientsData = clients.map(c => ({
    'ID': c.id,
    'Nombre': c.name,
    'Teléfono': c.phone,
    'País': c.country,
    'Email': c.email,
    'Total Suscripciones': c.total_subs,
    'Activas': c.subs_activas,
    'Estado': c.is_active ? 'Activo' : 'Inactivo',
    'Notas': c.notes,
    'Fecha Alta': c.created_at,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientsData), 'Clientes IPTV');

  // Sheet 4: Suscripciones IPTV
  let subQuery = 'SELECT s.*, c.phone FROM iptv_subscriptions s LEFT JOIN iptv_clients c ON s.client_id = c.id WHERE 1=1';
  const subParams = [];
  if (from) { subQuery += ' AND s.start_date >= ?'; subParams.push(from); }
  if (to) { subQuery += ' AND s.start_date <= ?'; subParams.push(to); }
  subQuery += ' ORDER BY s.start_date DESC';

  const subs = db.prepare(subQuery).all(...subParams);
  const subsData = subs.map(s => ({
    'ID': s.id,
    'Cliente': s.client_name,
    'Teléfono': s.phone,
    'Conexiones': s.connections,
    'Meses': s.months,
    'Precio Cobrado': s.price_charged,
    'Moneda': s.price_currency,
    'Total (MXN)': s.price_currency === 'USD' ? (s.price_charged * usdToMxn).toFixed(2) : s.price_charged,
    'Costo Créditos (MXN)': (s.cost_per_credit * s.credits_used).toFixed(2),
    'Ganancia (MXN)': (s.price_currency === 'MXN' ? s.price_charged : s.price_charged * usdToMxn) - (s.cost_per_credit * s.credits_used) > 0
      ? ((s.price_currency === 'MXN' ? s.price_charged : s.price_charged * usdToMxn) - (s.cost_per_credit * s.credits_used)).toFixed(2)
      : '0',
    'Inicio': s.start_date,
    'Vencimiento': s.end_date,
    'Estado': s.status,
    'Créditos Usados': s.credits_used,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subsData), 'Suscripciones IPTV');

  // Sheet 5: Resumen
  const summaryRows = [
    ['RESUMEN GENERAL', ''],
    ['Tipo de Cambio USD/MXN', usdToMxn],
    ['Fecha Reporte', new Date().toLocaleDateString('es-MX')],
    ['', ''],
    ['ARTÍCULOS', ''],
    ['Total Artículos', products.length],
    ['Total Invertido (MXN)', productsData.reduce((a, p) => a + Number(p['Precio Compra (MXN)']), 0).toFixed(2)],
    ['Total Ventas', sales.length],
    ['Ingresos por Ventas (MXN)', salesData.reduce((a, s) => a + Number(s['Total (MXN)']), 0).toFixed(2)],
    ['', ''],
    ['IPTV', ''],
    ['Total Clientes', clients.length],
    ['Clientes Activos', clients.filter(c => c.subs_activas > 0).length],
    ['Total Suscripciones', subs.length],
    ['Ingresos IPTV (MXN)', subsData.reduce((a, s) => a + Number(s['Total (MXN)']), 0).toFixed(2)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumen');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `reporte_${new Date().toISOString().split('T')[0]}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

module.exports = router;
