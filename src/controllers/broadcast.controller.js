const SchedulingService = require('../services/scheduling.service');
const CacheService      = require('../services/cache.service');
const UserModel         = require('../models/user.model');

const NO_CONTENT = { success: true, available: false, message: 'No content available', data: null };

const isValidTeacher = async (teacher_id) => {
  if (!teacher_id || typeof teacher_id !== 'string' || teacher_id.trim() === '') return false;
  try {
    const user = await UserModel.findById(teacher_id);
    return !!(user && user.role === 'teacher' && user.is_active);
  } catch (_) {
    return false;
  }
};

const getLiveByTeacher = async (req, res, next) => {
  try {
    const { teacher_id } = req.params;

    const cacheKey = CacheService.key('live', teacher_id, 'all');
    const cached   = await CacheService.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    if (!(await isValidTeacher(teacher_id))) {
      return res.status(200).json(NO_CONTENT);
    }

    const live   = await SchedulingService.getLiveByTeacher(teacher_id);
    const result = { success: true, ...live };

    if (live.available) await CacheService.set(cacheKey, result, 30);

    return res.status(200).json(result);
  } catch (err) { next(err); }
};

const getLiveBySubject = async (req, res, next) => {
  try {
    const { teacher_id, subject } = req.params;

    const normalized = (subject || '').trim().toLowerCase();
    const cacheKey   = CacheService.key('live', teacher_id, normalized);
    const cached     = await CacheService.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    if (!(await isValidTeacher(teacher_id))) {
      return res.status(200).json(NO_CONTENT);
    }

    const live   = await SchedulingService.getLiveBySubject(teacher_id, normalized);
    const result = { success: true, ...live };

    if (live.available) await CacheService.set(cacheKey, result, 30);

    return res.status(200).json(result);
  } catch (err) { next(err); }
};

module.exports = { getLiveByTeacher, getLiveBySubject };
