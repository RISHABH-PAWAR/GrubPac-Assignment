require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'content_broadcasting',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const SALT_ROUNDS = 12;

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const principalHash = await bcrypt.hash('Principal@123', SALT_ROUNDS);
    const teacher1Hash  = await bcrypt.hash('Teacher1@123',  SALT_ROUNDS);
    const teacher2Hash  = await bcrypt.hash('Teacher2@123',  SALT_ROUNDS);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      ['Principal Admin', 'principal@school.com', principalHash, 'principal']
    );
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      ['Teacher One', 'teacher1@school.com', teacher1Hash, 'teacher']
    );
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      ['Teacher Two', 'teacher2@school.com', teacher2Hash, 'teacher']
    );

    await client.query('COMMIT');

    console.log('\nSeed completed. Default credentials:\n');
    console.table([
      { role: 'principal', email: 'principal@school.com', password: 'Principal@123' },
      { role: 'teacher',   email: 'teacher1@school.com',  password: 'Teacher1@123'  },
      { role: 'teacher',   email: 'teacher2@school.com',  password: 'Teacher2@123'  },
    ]);
    console.log('\nContent lifecycle: upload → submit → approval → schedule → broadcast\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
