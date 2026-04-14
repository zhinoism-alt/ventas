const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'ventas.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb();
  }
  return db;
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      category TEXT DEFAULT '',
      color TEXT DEFAULT '',
      condition TEXT DEFAULT 'buen_estado',
      notes TEXT DEFAULT '',
      purchase_price REAL DEFAULT 0,
      purchase_currency TEXT DEFAULT 'MXN',
      sale_price REAL DEFAULT 0,
      sale_currency TEXT DEFAULT 'MXN',
      quantity INTEGER DEFAULT 1,
      quantity_sold INTEGER DEFAULT 0,
      status TEXT DEFAULT 'disponible',
      fb_post TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      product_name TEXT DEFAULT '',
      sale_date DATE DEFAULT (date('now')),
      quantity_sold INTEGER DEFAULT 1,
      sale_price REAL DEFAULT 0,
      sale_currency TEXT DEFAULT 'MXN',
      buyer_name TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'efectivo',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS iptv_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connections INTEGER DEFAULT 1,
      credits INTEGER NOT NULL,
      price_paid REAL NOT NULL,
      price_currency TEXT DEFAULT 'MXN',
      credits_remaining INTEGER NOT NULL,
      purchase_date DATE DEFAULT (date('now')),
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS iptv_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      country TEXT DEFAULT 'MX',
      email TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS iptv_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      client_name TEXT DEFAULT '',
      package_id INTEGER,
      connections INTEGER DEFAULT 1,
      months INTEGER DEFAULT 1,
      price_charged REAL NOT NULL,
      price_currency TEXT DEFAULT 'MXN',
      credits_used INTEGER NOT NULL,
      cost_per_credit REAL DEFAULT 0,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT DEFAULT 'activo',
      renewal_sent INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES iptv_clients(id),
      FOREIGN KEY (package_id) REFERENCES iptv_packages(id)
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY,
      usd_to_mxn REAL DEFAULT 17.5,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO exchange_rates (id, usd_to_mxn) VALUES (1, 17.5);
  `);
}

module.exports = { getDb };
