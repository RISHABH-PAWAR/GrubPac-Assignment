const { query } = require('../config/database');

const SAFE_COLS = 'id, name, email, role, is_active, created_at, updated_at';

const findByEmail = async (email) => {
  const r = await query(
    'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return r.rows[0] || null;
};

const findById = async (id) => {
  const r = await query(`SELECT ${SAFE_COLS} FROM users WHERE id = $1`, [id]);
  return r.rows[0] || null;
};

const create = async ({ name, email, password_hash, role }) => {
  const r = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING ${SAFE_COLS}`,
    [name.trim(), email.toLowerCase().trim(), password_hash, role]
  );
  return r.rows[0];
};

const emailExists = async (email) => {
  const r = await query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  return r.rowCount > 0;
};

const findAllTeachers = async () => {
  const r = await query(
    `SELECT ${SAFE_COLS} FROM users WHERE role = 'teacher' AND is_active = TRUE ORDER BY name`
  );
  return r.rows;
};

module.exports = { findByEmail, findById, create, emailExists, findAllTeachers };
