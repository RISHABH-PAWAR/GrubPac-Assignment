const { query, transaction } = require('../config/database');

const findOrCreateSlot = async (teacher_id, subject) => {
  const lower = subject.toLowerCase();
  // Try to find existing slot
  let r = await query(
    'SELECT id FROM content_slots WHERE teacher_id = $1 AND subject = $2',
    [teacher_id, lower]
  );
  if (r.rows[0]) return r.rows[0];

  // Insert with ON CONFLICT to handle race condition
  r = await query(
    `INSERT INTO content_slots (teacher_id, subject)
     VALUES ($1, $2)
     ON CONFLICT (teacher_id, subject) DO NOTHING
     RETURNING id`,
    [teacher_id, lower]
  );
  if (r.rows[0]) return r.rows[0];

  // Fetch after conflict
  r = await query(
    'SELECT id FROM content_slots WHERE teacher_id = $1 AND subject = $2',
    [teacher_id, lower]
  );
  return r.rows[0];
};

const getNextOrder = async (client, slot_id) => {
  const r = await client.query(
    `SELECT COALESCE(MAX(rotation_order), -1) + 1 AS next_order
     FROM content_schedules WHERE slot_id = $1`,
    [slot_id]
  );
  return r.rows[0].next_order;
};

const upsertSchedule = async (content_id, slot_id, duration) => {
  return transaction(async (client) => {
    // Check if schedule already exists for this content+slot
    const exists = await client.query(
      'SELECT id FROM content_schedules WHERE content_id = $1 AND slot_id = $2',
      [content_id, slot_id]
    );

    if (exists.rows[0]) {
      const r = await client.query(
        `UPDATE content_schedules SET duration = $1
         WHERE content_id = $2 AND slot_id = $3 RETURNING *`,
        [duration, content_id, slot_id]
      );
      return r.rows[0];
    }

    const nextOrder = await getNextOrder(client, slot_id);
    const r = await client.query(
      `INSERT INTO content_schedules (content_id, slot_id, rotation_order, duration)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [content_id, slot_id, nextOrder, duration]
    );
    return r.rows[0];
  });
};

const getByContent = async (content_id) => {
  const r = await query(
    `SELECT cs.*, slot.subject, slot.teacher_id
     FROM content_schedules cs
     JOIN content_slots slot ON slot.id = cs.slot_id
     WHERE cs.content_id = $1`,
    [content_id]
  );
  return r.rows[0] || null;
};

module.exports = { findOrCreateSlot, upsertSchedule, getByContent };
