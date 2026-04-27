const fs           = require('fs');
const { z }        = require('zod');
const ContentModel  = require('../models/content.model');
const ScheduleModel = require('../models/schedule.model');
const { getFileType, buildFileUrl } = require('../middlewares/upload.middleware');

// FIX #6: start_time must be a future datetime
const isoDatetime = z.string().refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'Must be a valid ISO 8601 datetime string' }
);

const futureDatetime = isoDatetime.refine(
  (v) => new Date(v) > new Date(),
  { message: 'start_time must be a future datetime' }
);

const uploadSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(255).trim(),
  subject:     z.string().min(1, 'Subject is required').max(100).trim(),
  description: z.string().max(2000).trim().optional(),
  start_time:  futureDatetime.optional(),
  end_time:    isoDatetime.optional(),
  duration:    z.coerce.number().int().min(1).max(1440).optional(),
})
.refine(
  (d) => !(d.start_time && !d.end_time) && !(!d.start_time && d.end_time),
  { message: 'start_time and end_time must both be provided together' }
)
.refine(
  (d) => !(d.start_time && d.end_time && new Date(d.end_time) <= new Date(d.start_time)),
  { message: 'end_time must be after start_time' }
);

// FIX #2: scheduling allowed on any non-rejected status — teacher controls schedule
// independently of the approval workflow. Broadcasting only fires when BOTH
// status='approved' AND now is inside [start_time, end_time).
const scheduleSchema = z.object({
  start_time: futureDatetime,
  end_time:   isoDatetime,
  duration:   z.coerce.number().int().min(1).max(1440).default(5),
})
.refine(
  (d) => new Date(d.end_time) > new Date(d.start_time),
  { message: 'end_time must be after start_time' }
);

const throwValidation = (parsed) => {
  if (!parsed.success) {
    throw Object.assign(new Error('Validation failed'), {
      statusCode: 400,
      errors: parsed.error.flatten().fieldErrors,
    });
  }
};

// FIX #5: unlink orphaned file if DB insert fails after multer saves to disk
const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      const logger = require('../utils/logger.util');
      logger.warn('Could not remove orphaned upload file', { path: filePath, error: err.message });
    }
  });
};

const uploadContent = async (file, body, teacher_id) => {
  // Validate body BEFORE touching the DB
  const parsed = uploadSchema.safeParse(body);
  throwValidation(parsed);

  const { title, subject, description, start_time, end_time, duration } = parsed.data;

  let content;
  try {
    // FIX #1: status starts as 'uploaded' — teacher must call /submit to queue for review
    content = await ContentModel.create({
      title, subject, description,
      file_path:     file.path,
      file_url:      buildFileUrl(file.filename),
      file_type:     getFileType(file.mimetype),
      file_size:     file.size,
      original_name: file.originalname,
      uploaded_by:   teacher_id,
    });
  } catch (err) {
    safeUnlink(file.path);
    throw err;
  }

  // Pre-attach schedule if teacher provided time window at upload time
  if (start_time && end_time) {
    try {
      await ContentModel.setSchedule(content.id, { start_time, end_time });
      const slot = await ScheduleModel.findOrCreateSlot(teacher_id, subject);
      await ScheduleModel.upsertSchedule(content.id, slot.id, duration || 5);
    } catch (err) {
      const logger = require('../utils/logger.util');
      logger.error('Failed to set schedule during upload', { contentId: content.id, error: err.message });
    }
  }

  return ContentModel.findById(content.id);
};

// uploaded → pending: teacher deliberately queues content for principal review
const submitContent = async (id, teacher_id) => {
  const content = await ContentModel.findById(id);
  if (!content) throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  if (content.uploader_id !== teacher_id) {
    throw Object.assign(new Error('You can only submit your own content for review'), { statusCode: 403 });
  }
  if (content.status !== 'uploaded') {
    throw Object.assign(
      new Error(`Cannot submit — content is already '${content.status}'. Only 'uploaded' content can be submitted`),
      { statusCode: 422 }
    );
  }
  const updated = await ContentModel.submit(id, teacher_id);
  if (!updated) {
    throw Object.assign(new Error('Submit failed — content state may have changed concurrently'), { statusCode: 409 });
  }
  return ContentModel.findById(id);
};

const getMyContent = async (teacher_id, filters = {}) => {
  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit) || 20));
  const [data, total] = await Promise.all([
    ContentModel.findByUploader(teacher_id, { ...filters, page, limit }),
    ContentModel.countAll({ ...filters, uploaded_by: teacher_id }),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const getAllContent = async (filters = {}) => {
  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit) || 20));
  const [data, total] = await Promise.all([
    ContentModel.findAll({ ...filters, page, limit }),
    ContentModel.countAll(filters),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const getContentById = async (id, requester) => {
  const content = await ContentModel.findById(id);
  if (!content) throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  if (requester.role === 'teacher' && content.uploader_id !== requester.id) {
    throw Object.assign(new Error('You can only view your own content'), { statusCode: 403 });
  }
  return content;
};

// CRITICAL: validate input FIRST before any DB call (fail-fast — avoids un-mocked
// DB calls in tests and returns 400 immediately for bad input regardless of content state)
const scheduleContent = async (id, teacher_id, body) => {
  // Step 1 — validate the input schema before touching the DB
  const parsed = scheduleSchema.safeParse(body);
  throwValidation(parsed);

  // Step 2 — load and verify content ownership
  const content = await ContentModel.findById(id);
  if (!content) throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  if (content.uploader_id !== teacher_id) {
    throw Object.assign(new Error('You can only schedule your own content'), { statusCode: 403 });
  }

  // Step 3 — FIX #2: allow scheduling on uploaded/pending/approved; block only rejected
  if (content.status === 'rejected') {
    throw Object.assign(
      new Error('Rejected content cannot be rescheduled. Re-upload the content to try again'),
      { statusCode: 422 }
    );
  }

  const { start_time, end_time, duration } = parsed.data;
  await ContentModel.setSchedule(id, { start_time, end_time });

  const slot = await ScheduleModel.findOrCreateSlot(teacher_id, content.subject);
  await ScheduleModel.upsertSchedule(id, slot.id, duration);

  return ContentModel.findById(id);
};

module.exports = {
  uploadContent, submitContent,
  getMyContent, getAllContent, getContentById, scheduleContent,
};
