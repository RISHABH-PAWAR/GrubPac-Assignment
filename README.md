# Content Broadcasting System

Backend API for distributing educational content from teachers to students via a public broadcast endpoint.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express 4.21 |
| Database | PostgreSQL 16 (node-postgres) |
| Auth | JWT HS256 + bcryptjs (12 rounds) |
| Validation | Zod |
| Upload | Multer 1.4 (disk storage) |
| Caching | Redis via ioredis (optional — graceful fallback) |
| Rate Limiting | express-rate-limit |
| Security | Helmet, CORS |
| Logging | Winston |
| Testing | Jest + Supertest |

---

## Quick Start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis (optional — server starts without it)

### 2. Install

```bash
git clone <repo-url>
cd content-broadcasting-system
npm install
cp .env.example .env
# Edit .env — set DB credentials and JWT_SECRET (min 32 chars)
```

### 3. Database

```bash
createdb content_broadcasting
npm run migrate     # creates all tables, indexes, triggers, enums
npm run seed        # inserts 3 default users (see credentials below)
```

### 4. Run

```bash
npm run dev     # nodemon — development
npm start       # production
```

### 5. Test

```bash
npm test
npm run test:coverage
```

---

## Seeded Credentials

| Role | Email | Password |
|------|-------|----------|
| Principal | principal@school.com | Principal@123 |
| Teacher | teacher1@school.com | Teacher1@123 |
| Teacher | teacher2@school.com | Teacher2@123 |

---

## Environment Variables

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=content_broadcasting
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secret_minimum_32_characters_long
JWT_EXPIRES_IN=24h
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
BASE_URL=http://localhost:3000
REDIS_HOST=localhost         # optional
REDIS_PORT=6379              # optional
REDIS_CACHE_TTL=60           # optional, seconds
```

---

## Content Lifecycle

```
uploaded → pending → approved → [within schedule window] → live broadcast
                   ↘ rejected  (rejection_reason stored, visible to teacher)
```

1. **uploaded** — Teacher uploads file. Content is in a local draft state.
2. **pending**  — Teacher explicitly submits for review (`POST /:id/submit`). Principal can now see and act on it.
3. **approved** — Principal approves. Content is eligible for broadcast if schedule is configured and window is active.
4. **rejected** — Principal rejects with a mandatory reason. Teacher sees the reason and must re-upload.

Content **never** appears in a broadcast until all three conditions are met:
- `status = 'approved'`
- `start_time` and `end_time` are set by the teacher
- Current time falls within `[start_time, end_time)`

Scheduling (setting the time window) is independent of approval status. Teachers may pre-configure schedules on `uploaded` or `pending` content. Scheduling is blocked only on `rejected` content.

---

## API Reference

### Auth

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/register` | Public | Register a user |
| POST | `/api/v1/auth/login` | Public | Login and receive JWT |
| GET  | `/api/v1/auth/profile` | Authenticated | Get current user |

### Content — Teacher

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/content` | Teacher | Upload file (`multipart/form-data`) — status becomes `uploaded` |
| POST | `/api/v1/content/:id/submit` | Teacher | Submit for review — status moves to `pending` |
| GET  | `/api/v1/content/mine` | Teacher | List own content (filter: `status`, `subject`, `page`, `limit`) |
| GET  | `/api/v1/content/:id` | Any role | Get single content by ID |
| PATCH | `/api/v1/content/:id/schedule` | Teacher | Set or update broadcast schedule |

**Upload fields:**
- `file` (required) — JPG/JPEG/PNG/GIF, max 10 MB
- `title` (required)
- `subject` (required)
- `description` (optional)
- `start_time` (optional, ISO 8601 future datetime — must pair with `end_time`)
- `end_time` (optional, ISO 8601 — must be after `start_time`)
- `duration` (optional, integer minutes, default `5`)

**Schedule fields:**
- `start_time` (required, future datetime)
- `end_time` (required, after `start_time`)
- `duration` (optional, minutes, default `5`)

### Approval — Principal only

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET   | `/api/v1/approval` | Principal | List pending content |
| PATCH | `/api/v1/approval/:id/approve` | Principal | Approve content |
| PATCH | `/api/v1/approval/:id/reject` | Principal | Reject with reason |

Reject body: `{ "rejection_reason": "string (min 5 chars)" }`

### Principal — All Content

```
GET /api/v1/content?status=&subject=&uploaded_by=&page=&limit=
```

### Broadcasting — Public (no auth required)

```
GET /api/v1/content/live/:teacher_id
GET /api/v1/content/live/:teacher_id/:subject
```

Returns active content or `{ "available": false, "message": "No content available", "data": null }`.

---

## Scheduling / Rotation Logic

Each teacher-subject pair has an independent broadcast rotation.

**Algorithm (stateless, computed on every request — no background workers):**

1. Fetch all approved content for `(teacher_id, subject)` where `start_time <= NOW < end_time`
2. Order by `rotation_order ASC`
3. `total_cycle = SUM(duration in minutes)`
4. `elapsed = minutes since midnight UTC of the current day`
5. `position = elapsed % total_cycle`
6. Walk items accumulating durations — first item whose cumulative range contains `position` is active

**Why midnight UTC as reference epoch?** This ensures a deterministic, stateless calculation that is identical across all horizontally-scaled instances without shared state. See `architecture-notes.txt` section 6 for detailed rationale.

**Example — 3 Maths items × 5 min each (cycle = 15 min):**
- Minutes 0–4 → Content A
- Minutes 5–9 → Content B
- Minutes 10–14 → Content C
- Minute 15 → loops back to A

---

## Edge Cases

| Scenario | Response |
|----------|----------|
| No approved content for teacher | `available: false` |
| Approved but outside time window | `available: false` |
| Approved but no schedule set | `available: false` |
| Unknown teacher_id | `available: false` |
| Unknown subject | `available: false` |
| Still in `uploaded` state (not submitted) | Not shown |
| Approving non-pending content | `422 Unprocessable` |
| Rejecting without reason | `400 Bad Request` |
| Scheduling rejected content | `422 Unprocessable` |
| start_time in the past | `400 Bad Request` |
| Duplicate email on register | `409 Conflict` |
| File type not in allowlist | `400 Bad Request` |
| File exceeds 10 MB | `400 Bad Request` |
| Teacher accessing principal routes | `403 Forbidden` |
| Expired JWT | `401 Unauthorized` |
| Missing Authorization header | `401 Unauthorized` |
| DB failure after file upload | File cleaned up from disk automatically |

---

## Assumptions & Decisions

- **Two-step upload flow** (`upload` then `submit`) is intentional. It matches the lifecycle diagram in the spec (`uploaded → pending → ...`) and allows teachers to review their upload before queuing it for the principal.
- **Schedule independence from approval** — teachers may pre-set `start_time/end_time` before a principal approves. Broadcasting only fires when both approval and schedule conditions are met simultaneously.
- **Rotation epoch is midnight UTC** — not window-relative. Produces a predictable rotation that is stateless and horizontally scalable. See `architecture-notes.txt` for full rationale.
- **Redis is optional** — the API operates at full functionality without Redis; caching is silently disabled when `REDIS_HOST` is not set.
- **Redis `delPattern` uses SCAN** (not `KEYS`) — non-blocking, production-safe for large keyspaces.
- All timestamps stored and compared in UTC (`TIMESTAMPTZ`).

---

## Deployment — Render

### Option A: render.yaml (recommended)

The repo includes `render.yaml`. In the Render dashboard:

1. New → Blueprint → connect your GitHub repo
2. Render reads `render.yaml` automatically
3. Set `JWT_SECRET` manually in the Environment tab (generated value is fine)
4. Deploy

### Option B: Manual setup

1. New → Web Service → connect repo
2. **Build Command:** `npm install && npm run migrate`
3. **Start Command:** `npm start`
4. Add environment variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (from your Render PostgreSQL instance — Internal DB URL) |
| `JWT_SECRET` | any random string, min 32 characters |
| `BASE_URL` | your Render web service URL, e.g. `https://cbs.onrender.com` |
| `LOG_LEVEL` | `info` |

### Key points

- **`DATABASE_URL` takes priority** over individual `DB_*` vars — Render injects it automatically when you link a PostgreSQL database.
- **Do not** put `npm run migrate` inside the Start Command — it belongs in the Build Command. Migrations run once at build time, not on every process restart.
- The server binds to `0.0.0.0` (not `127.0.0.1`) so Render's proxy can reach it.
- A DB readiness retry loop (10 attempts × 2s) handles the race condition where the database container starts slower than Node.
- `UPLOAD_DIR=uploads` stores files on the container's ephemeral disk. For production persistence use S3 (see `architecture-notes.txt`).
