const ApprovalService = require('../services/approval.service');
const CacheService    = require('../services/cache.service');
const ContentModel    = require('../models/content.model');
const R               = require('../utils/response.util');

const getPending = async (req, res, next) => {
  try {
    const { subject, page, limit } = req.query;
    const result = await ApprovalService.getPendingContent({ subject, page, limit });
    return R.success(res, result, 'Pending content retrieved');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    const content = await ApprovalService.approveContent(req.params.id, req.user.id);
    await CacheService.delPattern(`cbs:live:${content.uploader_id}:*`);
    return R.success(res, { content }, 'Content approved');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode);
    next(err);
  }
};

const reject = async (req, res, next) => {
  try {
    const content = await ApprovalService.rejectContent(req.params.id, req.user.id, req.body);
    return R.success(res, { content }, 'Content rejected');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode, err.errors || null);
    next(err);
  }
};

module.exports = { getPending, approve, reject };
