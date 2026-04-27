const { Router }        = require('express');
const ContentController = require('../controllers/content.controller');
const { authenticate }  = require('../middlewares/auth.middleware');
const { isTeacher, isPrincipal, isAnyRole } = require('../middlewares/rbac.middleware');
const { upload, handleUploadError } = require('../middlewares/upload.middleware');

const router = Router();
router.use(authenticate);

// Teacher: upload a new content item (status becomes 'uploaded')
router.post('/',
  isTeacher,
  upload.single('file'),
  handleUploadError,
  ContentController.upload
);

// Teacher: submit content for principal review (uploaded → pending)
router.post('/:id/submit',    isTeacher,   ContentController.submit);

// Teacher: list own content (filterable by status, subject)
router.get('/mine',           isTeacher,   ContentController.getMyContent);

// Principal: list all content with filters
router.get('/',               isPrincipal, ContentController.getAllContent);

// Any authenticated user: get single content by ID
router.get('/:id',            isAnyRole,   ContentController.getById);

// Teacher: set or update broadcast schedule window (allowed on any non-rejected status)
router.patch('/:id/schedule', isTeacher,   ContentController.schedule);

module.exports = router;
