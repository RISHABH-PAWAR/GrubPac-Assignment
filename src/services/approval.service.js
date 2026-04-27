const { z }          = require('zod');
const ContentModel   = require('../models/content.model');

const rejectSchema = z.object({
  rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters').max(1000).trim(),
});

const approveContent = async (id, principal_id) => {
  const content = await ContentModel.findById(id);
  if (!content) throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  if (content.status !== 'pending') {
    throw Object.assign(
      new Error(`Cannot approve — content status is '${content.status}'. Only pending content can be approved`),
      { statusCode: 422 }
    );
  }

  const updated = await ContentModel.approve(id, principal_id);
  if (!updated) throw Object.assign(new Error('Approval failed — content may have been actioned concurrently'), { statusCode: 409 });
  return ContentModel.findById(id);
};

const rejectContent = async (id, principal_id, body) => {
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error('Validation failed'), {
      statusCode: 400,
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const content = await ContentModel.findById(id);
  if (!content) throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  if (content.status !== 'pending') {
    throw Object.assign(
      new Error(`Cannot reject — content status is '${content.status}'. Only pending content can be rejected`),
      { statusCode: 422 }
    );
  }

  const updated = await ContentModel.reject(id, principal_id, parsed.data.rejection_reason);
  if (!updated) throw Object.assign(new Error('Rejection failed'), { statusCode: 409 });
  return ContentModel.findById(id);
};

const getPendingContent = async (filters = {}) => {
  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit) || 20));
  const [data, total] = await Promise.all([
    ContentModel.findAll({ status: 'pending', subject: filters.subject, page, limit }),
    ContentModel.countAll({ status: 'pending', subject: filters.subject }),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

module.exports = { approveContent, rejectContent, getPendingContent };
