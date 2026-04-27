const bcrypt    = require('bcryptjs');
const { z }     = require('zod');
const UserModel = require('../models/user.model');
const { sign }  = require('../utils/jwt.util');

const SALT_ROUNDS = 12;

const registerSchema = z.object({
  name:     z.string().min(2).max(120).trim(),
  email:    z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(72)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one digit'),
  role: z.enum(['principal', 'teacher']),
});

const loginSchema = z.object({
  email:    z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

const register = async (body) => {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const err = Object.assign(new Error('Validation failed'), {
      statusCode: 400,
      errors: parsed.error.flatten().fieldErrors,
    });
    throw err;
  }

  const { name, email, password, role } = parsed.data;
  if (await UserModel.emailExists(email)) {
    throw Object.assign(new Error('An account with this email already exists'), { statusCode: 409 });
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user          = await UserModel.create({ name, email, password_hash, role });
  const token         = sign({ id: user.id, role: user.role, email: user.email });
  return { user, token };
};

const login = async (body) => {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error('Validation failed'), {
      statusCode: 400,
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, password } = parsed.data;
  const record = await UserModel.findByEmail(email);

  // Constant-time error to prevent user enumeration
  if (!record || !(await bcrypt.compare(password, record.password_hash))) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  if (!record.is_active) {
    throw Object.assign(new Error('Account is inactive'), { statusCode: 403 });
  }

  const { password_hash: _, ...user } = record;
  const token = sign({ id: user.id, role: user.role, email: user.email });
  return { user, token };
};

module.exports = { register, login };
