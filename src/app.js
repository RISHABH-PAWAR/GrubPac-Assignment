require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const fs       = require('fs');

const authRoutes      = require('./routes/auth.routes');
const broadcastRoutes = require('./routes/broadcast.routes');
const contentRoutes   = require('./routes/content.routes');
const approvalRoutes  = require('./routes/approval.routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin:         process.env.CORS_ORIGIN || '*',
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '1d', etag: true }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'content-broadcasting-system', timestamp: new Date().toISOString() })
);

// IMPORTANT: broadcast routes must be mounted BEFORE content routes
// to avoid /:id matching 'live' as a UUID
app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/content/live',  broadcastRoutes);
app.use('/api/v1/content',       contentRoutes);
app.use('/api/v1/approval',      approvalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
