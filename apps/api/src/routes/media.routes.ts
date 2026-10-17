import { Router } from 'express';
import { signedMediaDownload } from '../middleware/upload.js';
const router = Router();
router.get('/:id/download', signedMediaDownload);
export default router;
