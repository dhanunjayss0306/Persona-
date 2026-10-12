// auth.js — passwords + login tokens.
//
// Sign-up: password is scrambled with bcrypt (one-way hash) before storing.
//          We NEVER store the raw password.
// Sign-in: we re-scramble what you typed and compare with the stored hash.
//          If it matches, you get a JWT — a signed "entry pass" the frontend
//          sends with every request (Authorization: Bearer <token>).
// requireAuth: middleware that checks the pass on protected routes.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_DAYS = 30;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: `${TOKEN_DAYS}d` }
  );
}

// Express middleware: rejects requests without a valid token.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — sign in again' });
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { signToken, requireAuth, hashPassword, checkPassword };
