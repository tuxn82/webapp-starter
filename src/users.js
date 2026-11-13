'use strict';

const { pool } = require('./db');
const { hashPassword } = require('./passwords');

const PUBLIC_COLUMNS = 'id, email, name, role, active, must_change_password, last_login_at, created_at';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function findById(id) {
  const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function findByEmailWithHash(email) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
    [normalizeEmail(email)],
  );
  return rows[0] || null;
}

async function getPasswordHash(id) {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
  return rows[0]?.password_hash || null;
}

async function listAll() {
  const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY lower(name), id`);
  return rows;
}

async function count() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  return rows[0].n;
}

async function countActiveAdmins() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
  return rows[0].n;
}

async function create({ email, name, role, password, mustChangePassword = true }) {
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [normalizeEmail(email), name.trim(), role, hash, mustChangePassword],
  );
  return rows[0];
}

async function update(id, { email, name, role, active }) {
  const { rows } = await pool.query(
    `UPDATE users SET email = $2, name = $3, role = $4, active = $5, updated_at = now()
     WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, normalizeEmail(email), name.trim(), role, active],
  );
  return rows[0] || null;
}

async function setPassword(id, password, { mustChangePassword }) {
  const hash = await hashPassword(password);
  await pool.query(
    'UPDATE users SET password_hash = $2, must_change_password = $3, updated_at = now() WHERE id = $1',
    [id, hash, mustChangePassword],
  );
}

async function recordLogin(id) {
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

// Logger en bruger ud alle steder ved at slette deres sessioner.
async function destroySessions(userId, exceptSid) {
  await pool.query(
    "DELETE FROM user_sessions WHERE (sess->>'userId')::int = $1 AND sid <> COALESCE($2, '')",
    [userId, exceptSid || null],
  );
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  findById,
  findByEmailWithHash,
  getPasswordHash,
  listAll,
  count,
  countActiveAdmins,
  create,
  update,
  setPassword,
  recordLogin,
  destroySessions,
};
