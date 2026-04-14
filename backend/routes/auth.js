const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/requireAuth');

const USUARIOS = [
  { id: 1, username: 'zhinoism', nombre: 'Admin', rol: 'admin',   hash: process.env.ADMIN_HASH },
  { id: 2, username: 'Brandon',  nombre: 'Brandon', rol: 'editor', hash: process.env.EDITOR1_HASH },
  { id: 3, username: 'Itzel',    nombre: 'Itzel',   rol: 'editor', hash: process.env.EDITOR2_HASH },
];

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contrasena requeridos' });

    const usuario = USUARIOS.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!usuario) return res.status(401).json({ error: 'Credenciales invalidas' });

    const valido = await bcrypt.compare(password, usuario.hash);
    if (!valido) return res.status(401).json({ error: 'Credenciales invalidas' });

    const token = jwt.sign(
      { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });

    res.json({ username: usuario.username, nombre: usuario.nombre, rol: usuario.rol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    username: req.user.username,
    nombre: req.user.nombre,
    rol: req.user.rol,
  });
});

module.exports = router;
