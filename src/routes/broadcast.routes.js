const { Router }          = require('express');
const BroadcastController = require('../controllers/broadcast.controller');
const { publicApiLimiter }= require('../middlewares/rateLimiter.middleware');

const router = Router();
router.use(publicApiLimiter);

router.get('/:teacher_id',           BroadcastController.getLiveByTeacher);
router.get('/:teacher_id/:subject',  BroadcastController.getLiveBySubject);

module.exports = router;
