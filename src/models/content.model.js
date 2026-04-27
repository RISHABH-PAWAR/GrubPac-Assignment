const { query } = require('../config/database');

const BASE_SELECT = `
  c.id, c.title, c.description, c.subject,
  c.file_path, c.file_url, c.file_type, c.file_size, c.original_name,
  c.status, c.rejection_reason, c.start_time, c.end_time,
  c.approved_at, c.created_at, c.updated_at,
  u.id    AS uploader_id,
  u.name  AS uploader_name,
  u.email AS uploader_email,
  a.id    AS approver_id,
  a.name  AS approver_name
FROM content c
JOIN users u ON u.id = c.uploaded_by
LEFT JOIN users a ON a.id = c.approved_by
`;

// FIX #1: initial status is 'uploaded' — matching the spec lifecycle:
//   uploaded → pending → approved | rejected
const create = async ({ title, description, subject, file_path, file_url,
                         file_type, file_size, original_name, uploaded_by }) => {
  const r = await query(
    `INSERT INTO content
       (title, description, subject, file_path, file_url,
        file_type, file_size, original_name, uploaded_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'uploaded') RETURNING *`,
    [title.trim(), description || null, subject.trim().toLowerCase(),
     file_path, file_url, file_type, file_size, original_name, uploaded_by]
  );
  return r.rows[0];
};

// Move uploaded → pending (teacher submits for review)
const submit = async (id, uploaded_by) => {
  const r = await query(
    `UPDATE content SET status='pending'
     WHERE id=$1 AND uploaded_by=$2 AND status='uploaded' RETURNING *`,
    [id, uploaded_by]
  );
  return r.rows[0] || null;
};

const findById = async (id) => {
  const r = await query(`SELECT ${BASE_SELECT} WHERE c.id = $1`, [id]);
  return r.rows[0] || null;
};

const findByUploader = async (uploaded_by, { status, subject, page = 1, limit = 20 } = {}) => {
  const conds = ['c.uploaded_by = $1'];
  const vals  = [uploaded_by];
  let i = 2;
  if (status)  { conds.push(`c.status = $${i++}`);  vals.push(status); }
  if (subject) { conds.push(`c.subject = $${i++}`); vals.push(subject.toLowerCase()); }
  const offset = (page - 1) * limit;
  const r = await query(
    `SELECT ${BASE_SELECT} WHERE ${conds.join(' AND ')}
     ORDER BY c.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...vals, limit, offset]
  );
  return r.rows;
};

const findAll = async ({ status, subject, uploaded_by, page = 1, limit = 20 } = {}) => {
  const conds = ['1=1'];
  const vals  = [];
  let i = 1;
  if (status)      { conds.push(`c.status = $${i++}`);      vals.push(status); }
  if (subject)     { conds.push(`c.subject = $${i++}`);     vals.push(subject.toLowerCase()); }
  if (uploaded_by) { conds.push(`c.uploaded_by = $${i++}`); vals.push(uploaded_by); }
  const offset = (page - 1) * limit;
  const r = await query(
    `SELECT ${BASE_SELECT} WHERE ${conds.join(' AND ')}
     ORDER BY c.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...vals, limit, offset]
  );
  return r.rows;
};

const countAll = async ({ status, subject, uploaded_by } = {}) => {
  const conds = ['1=1'];
  const vals  = [];
  let i = 1;
  if (status)      { conds.push(`c.status = $${i++}`);      vals.push(status); }
  if (subject)     { conds.push(`c.subject = $${i++}`);     vals.push(subject.toLowerCase()); }
  if (uploaded_by) { conds.push(`c.uploaded_by = $${i++}`); vals.push(uploaded_by); }
  const r = await query(
    `SELECT COUNT(*) FROM content c WHERE ${conds.join(' AND ')}`, vals
  );
  return parseInt(r.rows[0].count, 10);
};

const approve = async (id, approved_by) => {
  const r = await query(
    `UPDATE content
     SET status='approved', approved_by=$2, approved_at=NOW(), rejection_reason=NULL
     WHERE id=$1 AND status='pending' RETURNING *`,
    [id, approved_by]
  );
  return r.rows[0] || null;
};

const reject = async (id, approved_by, rejection_reason) => {
  const r = await query(
    `UPDATE content
     SET status='rejected', approved_by=$2, approved_at=NOW(), rejection_reason=$3
     WHERE id=$1 AND status='pending' RETURNING *`,
    [id, approved_by, rejection_reason.trim()]
  );
  return r.rows[0] || null;
};

const setSchedule = async (id, { start_time, end_time }) => {
  const r = await query(
    `UPDATE content SET start_time=$2, end_time=$3 WHERE id=$1 RETURNING *`,
    [id, start_time || null, end_time || null]
  );
  return r.rows[0] || null;
};

const findLiveForTeacherSubject = async (teacher_id, subject, now) => {
  const r = await query(
    `SELECT c.id, c.title, c.description, c.subject, c.file_url, c.file_type,
            cs.rotation_order, cs.duration
     FROM content c
     JOIN content_schedules cs   ON cs.content_id = c.id
     JOIN content_slots     slot ON slot.id = cs.slot_id
     WHERE slot.teacher_id = $1
       AND c.subject       = $2
       AND c.status        = 'approved'
       AND c.start_time IS NOT NULL
       AND c.end_time   IS NOT NULL
       AND c.start_time <= $3
       AND c.end_time    > $3
     ORDER BY cs.rotation_order ASC`,
    [teacher_id, subject.toLowerCase(), now]
  );
  return r.rows;
};

const findLiveSubjectsForTeacher = async (teacher_id, now) => {
  const r = await query(
    `SELECT DISTINCT c.subject
     FROM content c
     JOIN content_schedules cs   ON cs.content_id = c.id
     JOIN content_slots     slot ON slot.id = cs.slot_id
     WHERE slot.teacher_id = $1
       AND c.status        = 'approved'
       AND c.start_time IS NOT NULL
       AND c.end_time   IS NOT NULL
       AND c.start_time <= $2
       AND c.end_time    > $2`,
    [teacher_id, now]
  );
  return r.rows.map((row) => row.subject);
};

module.exports = {
  create, submit, findById, findByUploader, findAll, countAll,
  approve, reject, setSchedule,
  findLiveForTeacherSubject, findLiveSubjectsForTeacher,
};
