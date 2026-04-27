require('./setup');

describe('JWT Utility', () => {
  const { sign, verify } = require('../src/utils/jwt.util');

  it('signs and verifies payload correctly', () => {
    const token   = sign({ id: 'u1', role: 'teacher', email: 'a@b.com' });
    const decoded = verify(token);
    expect(decoded.id).toBe('u1');
    expect(decoded.role).toBe('teacher');
  });

  it('throws on tampered token', () => {
    const token = sign({ id: 'u1', role: 'teacher', email: 'a@b.com' });
    expect(() => verify(token.slice(0, -5) + 'XXXXX')).toThrow();
  });

  it('throws TokenExpiredError for expired token', async () => {
    const jwt  = require('jsonwebtoken');
    const expired = jwt.sign(
      { id: 'u1', role: 'teacher', email: 'a@b.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1ms', issuer: 'content-broadcasting-system', audience: 'cbs-api' }
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(() => verify(expired)).toThrow(/expired/i);
  });
});

describe('Response Utility', () => {
  const R = require('../src/utils/response.util');
  const mock = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
  };

  it('success → 200, success:true', () => {
    const res = mock();
    R.success(res, { x: 1 }, 'OK');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'OK', data: { x: 1 } }));
  });

  it('created → 201', () => {
    const res = mock();
    R.created(res, {}, 'Done');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('badRequest → 400, success:false', () => {
    const res = mock();
    R.badRequest(res, 'Bad');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('unauthorized → 401', () => {
    const res = mock();
    R.unauthorized(res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('forbidden → 403', () => {
    const res = mock();
    R.forbidden(res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('notFound → 404', () => {
    const res = mock();
    R.notFound(res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('conflict → 409', () => {
    const res = mock();
    R.conflict(res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('includes errors array when provided', () => {
    const res  = mock();
    const errs = { field: ['required'] };
    R.badRequest(res, 'Fail', errs);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errors: errs }));
  });
});
