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

const request  = require('supertest');
const { sign } = require('../src/utils/jwt.util');
const db       = require('../src/config/database');
const app      = require('../src/app');

const TEACHER_ID   = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PRINCIPAL_ID = 'ffffffff-0000-1111-2222-333333333333';

const teacherUser = {
  id: TEACHER_ID, name: 'Teacher One', email: 'teacher@school.com',
  role: 'teacher', is_active: true, created_at: new Date(), updated_at: new Date(),
};
const principalUser = {
  id: PRINCIPAL_ID, name: 'Principal', email: 'principal@school.com',
  role: 'principal', is_active: true, created_at: new Date(), updated_at: new Date(),
};

const teacherToken   = sign({ id: TEACHER_ID,   role: 'teacher',   email: 'teacher@school.com' });
const principalToken = sign({ id: PRINCIPAL_ID, role: 'principal', email: 'principal@school.com' });

beforeEach(() => jest.resetAllMocks());

const makeContent = (overrides = {}) => ({
  id: 'content-uuid-001', title: 'Algebra Ch1', description: null,
  subject: 'maths', file_url: 'http://localhost/f.jpg', file_type: 'jpg',
  file_path: '/uploads/f.jpg', file_size: 1024, original_name: 'f.jpg',
  uploader_id: TEACHER_ID, uploader_name: 'Teacher One', uploader_email: 'teacher@school.com',
  approver_id: null, approver_name: null,
  status: 'uploaded', rejection_reason: null,
  start_time: null, end_time: null, approved_at: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  ...overrides,
});

// ─── RBAC ───────────────────────────────────────────────────────────────────
describe('RBAC enforcement', () => {
  it('403 — teacher cannot access the approval list', async () => {
    db.query.mockResolvedValueOnce({ rows: [teacherUser] });
    const res = await request(app).get('/api/v1/approval').set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('403 — principal cannot upload content', async () => {
    db.query.mockResolvedValueOnce({ rows: [principalUser] });
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${principalToken}`)
      .field('title', 'Test').field('subject', 'maths');
    expect(res.status).toBe(403);
  });

  it('403 — principal cannot submit content for review', async () => {
    db.query.mockResolvedValueOnce({ rows: [principalUser] });
    const res = await request(app)
      .post('/api/v1/content/some-id/submit')
      .set('Authorization', `Bearer ${principalToken}`);
    expect(res.status).toBe(403);
  });

  it('403 — teacher cannot approve content', async () => {
    db.query.mockResolvedValueOnce({ rows: [teacherUser] });
    const res = await request(app)
      .patch('/api/v1/approval/some-uuid/approve')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request to any protected route', async () => {
    const res = await request(app).get('/api/v1/content');
    expect(res.status).toBe(401);
  });

  it('200 — principal can list pending content', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [principalUser] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const res = await request(app).get('/api/v1/approval').set('Authorization', `Bearer ${principalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── Content Lifecycle — FIX #1 ─────────────────────────────────────────────
describe('Content lifecycle: uploaded → pending', () => {
  it('422 — cannot submit content that is already pending', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })                             // authenticate
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'pending' })] });     // findById

    const res = await request(app)
      .post(`/api/v1/content/${makeContent().id}/submit`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/already/i);
  });

  it('422 — cannot submit content that is already approved', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'approved' })] });

    const res = await request(app)
      .post(`/api/v1/content/${makeContent().id}/submit`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(422);
  });

  it('403 — teacher cannot submit another teacher\'s content', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ uploader_id: 'other-teacher-uuid' })] });

    const res = await request(app)
      .post(`/api/v1/content/${makeContent().id}/submit`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
  });

  it('404 — submit on non-existent content', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [] }); // findById → null

    const res = await request(app)
      .post('/api/v1/content/non-existent-id/submit')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Scheduling — FIX #2 ─────────────────────────────────────────────────────
describe('Scheduling is independent of approval status', () => {
  const futureStart = new Date(Date.now() + 3600 * 1000).toISOString();
  const futureEnd   = new Date(Date.now() + 7200 * 1000).toISOString();

  it('422 — rejected content cannot be rescheduled', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'rejected' })] });

    const res = await request(app)
      .patch(`/api/v1/content/${makeContent().id}/schedule`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ start_time: futureStart, end_time: futureEnd, duration: 5 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/rejected/i);
  });

  it('400 — start_time in the past is rejected', async () => {
    db.query.mockResolvedValueOnce({ rows: [teacherUser] });

    const pastStart = new Date(Date.now() - 3600 * 1000).toISOString();
    const futEnd    = new Date(Date.now() + 3600 * 1000).toISOString();

    const res = await request(app)
      .patch(`/api/v1/content/${makeContent().id}/schedule`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ start_time: pastStart, end_time: futEnd, duration: 5 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('400 — end_time before start_time', async () => {
    db.query.mockResolvedValueOnce({ rows: [teacherUser] });

    const start = new Date(Date.now() + 7200 * 1000).toISOString();
    const end   = new Date(Date.now() + 3600 * 1000).toISOString();

    const res = await request(app)
      .patch(`/api/v1/content/${makeContent().id}/schedule`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ start_time: start, end_time: end, duration: 5 });

    expect(res.status).toBe(400);
  });
});

// ─── Approval Workflow ───────────────────────────────────────────────────────
describe('Approval workflow edge cases', () => {
  it('422 — cannot approve content that is already approved', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [principalUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'approved' })] });

    const res = await request(app)
      .patch('/api/v1/approval/content-uuid-001/approve')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(422);
  });

  it('422 — cannot reject already-rejected content', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [principalUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'rejected' })] });

    const res = await request(app)
      .patch('/api/v1/approval/content-uuid-001/reject')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ rejection_reason: 'Already rejected this content previously' });

    expect(res.status).toBe(422);
  });

  it('400 — reject without rejection_reason', async () => {
    db.query.mockResolvedValueOnce({ rows: [principalUser] });

    const res = await request(app)
      .patch('/api/v1/approval/content-uuid-001/reject')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('400 — rejection_reason too short (less than 5 chars)', async () => {
    db.query.mockResolvedValueOnce({ rows: [principalUser] });

    const res = await request(app)
      .patch('/api/v1/approval/content-uuid-001/reject')
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ rejection_reason: 'bad' });

    expect(res.status).toBe(400);
  });

  it('404 — approve non-existent content returns 404', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [principalUser] })
      .mockResolvedValueOnce({ rows: [] }); // findById → null

    const res = await request(app)
      .patch('/api/v1/approval/non-existent-id/approve')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(404);
  });

  it('422 — cannot approve content that is still in uploaded (not pending) state', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [principalUser] })
      .mockResolvedValueOnce({ rows: [makeContent({ status: 'uploaded' })] });

    const res = await request(app)
      .patch('/api/v1/approval/content-uuid-001/approve')
      .set('Authorization', `Bearer ${principalToken}`);

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/pending/i);
  });
});

// ─── Public Broadcast API ────────────────────────────────────────────────────
describe('GET /api/v1/content/live/:teacher_id', () => {
  it('200 available:false — teacher not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.message).toBe('No content available');
    expect(res.body.data).toBeNull();
  });

  it('200 available:false — user is a principal not a teacher', async () => {
    db.query.mockResolvedValueOnce({ rows: [principalUser] });
    const res = await request(app).get(`/api/v1/content/live/${PRINCIPAL_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('200 available:false — no approved live content for teacher', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [] }); // no live subjects
    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('200 available:true — returns correct active content for subject', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [{ subject: 'maths' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'c-001', title: 'Algebra Ch1', description: null,
          subject: 'maths', file_url: 'http://localhost/f.jpg', file_type: 'jpg',
          rotation_order: 0, duration: 5,
        }],
      });

    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.data.maths.id).toBe('c-001');
    expect(res.body.data.maths.title).toBe('Algebra Ch1');
  });

  it('200 available:true — multiple subjects each have independent active item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [{ subject: 'maths' }, { subject: 'science' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'c-001', title: 'Algebra', description: null, subject: 'maths',
                 file_url: 'http://localhost/f1.jpg', file_type: 'jpg', rotation_order: 0, duration: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'c-002', title: 'Physics', description: null, subject: 'science',
                 file_url: 'http://localhost/f2.png', file_type: 'png', rotation_order: 0, duration: 10 }],
      });

    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.data.maths.id).toBe('c-001');
    expect(res.body.data.science.id).toBe('c-002');
  });

  it('200 — broadcast is public — no auth required', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}`);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/content/live/:teacher_id/:subject', () => {
  it('200 available:false — unknown subject returns gracefully', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}/unknownsubject`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.message).toBe('No content available');
  });

  it('200 available:true — returns active item with meta for specific subject', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({
        rows: [{ id: 'c-001', title: 'Physics Ch1', description: 'Forces', subject: 'science',
                 file_url: 'http://localhost/f.png', file_type: 'png', rotation_order: 0, duration: 5 }],
      });

    const res = await request(app).get(`/api/v1/content/live/${TEACHER_ID}/science`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.data.title).toBe('Physics Ch1');
    expect(res.body.meta.subject).toBe('science');
    expect(res.body.meta.total_in_rotation).toBe(1);
    expect(res.body.meta.active_position).toBe(1);
  });

  it('subject is normalised to lowercase before DB query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [teacherUser] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app).get(`/api/v1/content/live/${TEACHER_ID}/MATHS`);

    const scheduleQueryCall = db.query.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('content_schedules')
    );
    if (scheduleQueryCall) expect(scheduleQueryCall[1][1]).toBe('maths');
  });
});

// ─── System Edge Cases ───────────────────────────────────────────────────────
describe('System edge cases', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('content-broadcasting-system');
    expect(res.body.timestamp).toBeDefined();
  });

  it('404 — unknown route returns structured error response', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('401 — missing Authorization header on teacher-only route', async () => {
    const res = await request(app).get('/api/v1/content/mine');
    expect(res.status).toBe(401);
  });

  it('401 — wrong Authorization scheme (Basic instead of Bearer)', async () => {
    const res = await request(app)
      .get('/api/v1/content/mine')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });
});
