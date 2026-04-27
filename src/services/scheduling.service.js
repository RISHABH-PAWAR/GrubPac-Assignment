const ContentModel = require('../models/content.model');

/**
 * Rotation Algorithm
 * ------------------
 * Reference epoch: midnight UTC of the current day.
 * Elapsed = minutes since midnight UTC (integer).
 * Total cycle = sum of all eligible content durations.
 * Position = elapsed % total_cycle.
 * Walk rotation_order ASC, accumulate durations — first item whose
 * cumulative range contains `position` is the active item.
 *
 * This is stateless and deterministic — no background workers needed.
 * Identical result across multiple horizontally-scaled instances.
 *
 * Edge cases handled:
 * - No approved content           → { available: false }
 * - Approved but outside window   → not included in query (filtered by DB)
 * - Approved but not scheduled    → not included in query (no schedule row)
 * - Invalid / unknown teacher_id  → { available: false }
 * - Invalid / unknown subject     → { available: false }
 * - Single content item           → always returned (100% of cycle)
 */

const minutesSinceMidnightUTC = (now) => {
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  return Math.floor((now.getTime() - midnight.getTime()) / 60000);
};

const pickActiveItem = (items, now) => {
  if (!items || items.length === 0) return null;

  const totalCycle = items.reduce((sum, item) => sum + item.duration, 0);
  if (totalCycle === 0) return null;

  const position  = minutesSinceMidnightUTC(now) % totalCycle;
  let accumulated = 0;

  for (const item of items) {
    accumulated += item.duration;
    if (position < accumulated) return item;
  }

  return items[items.length - 1];
};

const formatItem = (item) => ({
  id:          item.id,
  title:       item.title,
  description: item.description || null,
  subject:     item.subject,
  file_url:    item.file_url,
  file_type:   item.file_type,
  duration_minutes: item.duration,
});

const getLiveByTeacher = async (teacher_id) => {
  const now      = new Date();
  const subjects = await ContentModel.findLiveSubjectsForTeacher(teacher_id, now);

  if (!subjects.length) {
    return { available: false, message: 'No content available', data: null };
  }

  const subjectResults = await Promise.all(
    subjects.map(async (subject) => {
      const items  = await ContentModel.findLiveForTeacherSubject(teacher_id, subject, now);
      const active = pickActiveItem(items, now);
      return { subject, active };
    })
  );

  const data = {};
  for (const { subject, active } of subjectResults) {
    if (active) data[subject] = formatItem(active);
  }

  if (!Object.keys(data).length) {
    return { available: false, message: 'No content available', data: null };
  }

  return { available: true, message: 'Live content retrieved', data };
};

const getLiveBySubject = async (teacher_id, subject) => {
  const normalized = subject.trim().toLowerCase();
  const now        = new Date();
  const items      = await ContentModel.findLiveForTeacherSubject(teacher_id, normalized, now);

  if (!items.length) {
    return { available: false, message: 'No content available', data: null };
  }

  const active = pickActiveItem(items, now);
  if (!active) {
    return { available: false, message: 'No content available', data: null };
  }

  return {
    available: true,
    message:   'Live content retrieved',
    data: formatItem(active),
    meta: {
      subject:       normalized,
      total_in_rotation: items.length,
      active_position:   items.findIndex((i) => i.id === active.id) + 1,
    },
  };
};

module.exports = { getLiveByTeacher, getLiveBySubject, pickActiveItem, minutesSinceMidnightUTC };
