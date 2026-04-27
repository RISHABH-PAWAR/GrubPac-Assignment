const { Router }         = require('express');
const ApprovalController = require('../controllers/approval.controller');
const { authenticate }   = require('../middlewares/auth.middleware');
const { isPrincipal }    = require('../middlewares/rbac.middleware');

const router = Router();
router.use(authenticate, isPrincipal);

router.get('/',              ApprovalController.getPending);
router.patch('/:id/approve', ApprovalController.approve);
router.patch('/:id/reject',  ApprovalController.reject);

module.exports = router;
