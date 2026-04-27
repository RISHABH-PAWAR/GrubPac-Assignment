require('./setup');

jest.mock('../src/config/database', () => ({
  query:       jest.fn(),
  transaction: jest.fn(),
  pool:        { query: jest.fn().mockResolvedValue({}), end: jest.fn() },
}));

jest.mock('../src/config/redis', () => ({
  getRedis:         () => null,
  isRedisAvailable: () => false,
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const db      = require('../src/config/database');
const app     = require('../src/app');

const fakeUser = (overrides = {}) => ({
  id:         'uuid-teacher-001',
  name:       'Test Teacher',
  email:      'teacher@school.com',
  role:       'teacher',
  is_active:  true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => jest.resetAllMocks());

// ─── Register ────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  it('201 — registers new teacher and returns token', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })   // emailExists → false
      .mockResolvedValueOnce({ rows: [fakeUser()] });      // create user

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test Teacher', email: 'teacher@school.com', password: 'Secure1234', role: 'teacher' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('teacher@school.com');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
  });

  it('201 — registers principal', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [fakeUser({ role: 'principal', email: 'p@school.com' })] });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Principal Admin', email: 'p@school.com', password: 'Secure1234', role: 'principal' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('principal');
  });

  it('409 — rejects duplicate email', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'x' }] });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'dup@school.com', password: 'Secure1234', role: 'teacher' });

    expect(res.status).toBe(409);
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'not-email', password: 'Secure1234', role: 'teacher' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('400 — password too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'a@b.com', password: 'abc', role: 'teacher' });
    expect(res.status).toBe(400);
  });

  it('400 — password without uppercase letter', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'a@b.com', password: 'lowercase123', role: 'teacher' });
    expect(res.status).toBe(400);
  });

  it('400 — invalid role (student is not allowed)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'a@b.com', password: 'Secure1234', role: 'student' });
    expect(res.status).toBe(400);
  });

  it('400 — missing name', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.com', password: 'Secure1234', role: 'teacher' });
    expect(res.status).toBe(400);
  });

  it('400 — name too short (min 2 chars)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'a@b.com', password: 'Secure1234', role: 'teacher' });
    expect(res.status).toBe(400);
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  it('200 — returns token on valid credentials', async () => {
    const hash = bcrypt.hashSync('Secure1234', 10);
    db.query.mockResolvedValueOnce({
      rows: [{ ...fakeUser(), password_hash: hash }],
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@school.com', password: 'Secure1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user).not.toHaveProperty('password_hash');
  });

  it('401 — wrong password uses same message to prevent user enumeration', async () => {
    const hash = bcrypt.hashSync('correctPassA1', 10);
    db.query.mockResolvedValueOnce({
      rows: [{ ...fakeUser(), password_hash: hash }],
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@school.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  it('401 — non-existent user returns same message', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@school.com', password: 'Secure1234' });

    expect(res.status).toBe(401);
  });

  it('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('400 — empty body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ─── Profile ─────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/profile', () => {
  it('401 — no authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/profile');
    expect(res.status).toBe(401);
  });

  it('401 — malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', 'Bearer bad.token.value');
    expect(res.status).toBe(401);
  });

  it('401 — Authorization header without Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  it('200 — valid token returns user profile', async () => {
    const { sign } = require('../src/utils/jwt.util');
    const token = sign({ id: 'uuid-teacher-001', role: 'teacher', email: 'teacher@school.com' });
    db.query.mockResolvedValueOnce({ rows: [fakeUser()] });

    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('teacher@school.com');
    expect(res.body.data.user.role).toBe('teacher');
  });

  it('401 — inactive user account is rejected after token verification', async () => {
    const { sign } = require('../src/utils/jwt.util');
    const token = sign({ id: 'uuid-teacher-001', role: 'teacher', email: 'teacher@school.com' });
    db.query.mockResolvedValueOnce({ rows: [fakeUser({ is_active: false })] });

    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('401 — user deleted after token was issued', async () => {
    const { sign } = require('../src/utils/jwt.util');
    const token = sign({ id: 'deleted-uuid', role: 'teacher', email: 'deleted@school.com' });
    db.query.mockResolvedValueOnce({ rows: [] }); // findById → not found

    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
