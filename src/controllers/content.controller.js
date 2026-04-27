const ContentService = require('../services/content.service');
const CacheService   = require('../services/cache.service');
const R              = require('../utils/response.util');

const upload = async (req, res, next) => {
  try {
    if (!req.file) return R.badRequest(res, 'A file is required');
    const content = await ContentService.uploadContent(req.file, req.body, req.user.id);
    return R.created(res, { content }, 'Content uploaded. Call POST /:id/submit when ready to queue for principal review');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode, err.errors || null);
    next(err);
  }
};

// FIX #1: submit moves content from 'uploaded' → 'pending' (queues for principal review)
const submit = async (req, res, next) => {
  try {
    const content = await ContentService.submitContent(req.params.id, req.user.id);
    return R.success(res, { content }, 'Content submitted for principal review');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode);
    next(err);
  }
};

const getMyContent = async (req, res, next) => {
  try {
    const { status, subject, page, limit } = req.query;
    const result = await ContentService.getMyContent(req.user.id, { status, subject, page, limit });
    return R.success(res, result, 'Content retrieved');
  } catch (err) { next(err); }
};

const getAllContent = async (req, res, next) => {
  try {
    const { status, subject, uploaded_by, page, limit } = req.query;
    const result = await ContentService.getAllContent({ status, subject, uploaded_by, page, limit });
    return R.success(res, result, 'Content retrieved');
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const content = await ContentService.getContentById(req.params.id, req.user);
    return R.success(res, { content }, 'Content retrieved');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode);
    next(err);
  }
};

const schedule = async (req, res, next) => {
  try {
    const content = await ContentService.scheduleContent(req.params.id, req.user.id, req.body);
    await CacheService.delPattern(`cbs:live:${req.user.id}:*`);
    return R.success(res, { content }, 'Schedule updated');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode, err.errors || null);
    next(err);
  }
};

module.exports = { upload, submit, getMyContent, getAllContent, getById, schedule };
