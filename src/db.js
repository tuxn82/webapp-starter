'use strict';

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

const MIGRATIONS = [
  {
    id: 1,
    name: 'users',
    sql: `
      CREATE TABLE users (
        id                   SERIAL PRIMARY KEY,
        email                TEXT NOT NULL,
        name                 TEXT NOT NULL,
        password_hash        TEXT NOT NULL,
        role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        active               BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at        TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
    `,
  },
  {
    id: 2,
    name: 'user_sessions',
    // Skema som connect-pg-simple forventer.
    sql: `
      CREATE TABLE user_sessions (
        sid    VARCHAR NOT NULL PRIMARY KEY,
        sess   JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
      CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
    `,
  },
];

async function migrate() {
  const client = await pool.connect();
  try {
    // Lås så to app-noder ikke migrerer samtidig.
    await client.query('SELECT pg_advisory_lock(728311)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
        await client.query('COMMIT');
        console.log(`Migration ${m.id} (${m.name}) kørt`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(728311)').catch(() => {});
    client.release();
  }
}

module.exports = { pool, migrate };
