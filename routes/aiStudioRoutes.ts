const express = require('express');
const router = express.Router();
const controller = require('../controllers/aiStudioController');
const { isAuthenticated, authorize } = require('../middlewares/auth');

router.use(isAuthenticated, authorize(["system:manage"]));

router.get('/destinations', controller.getDestinations);
router.post('/destinations', controller.addDestination);
router.delete('/destinations/:id', controller.deleteDestination);

router.get('/history', controller.getHistory);
router.post('/generate-image', controller.requestImageGeneration);
router.post('/generate-copy', controller.requestCopyGeneration);
router.post('/broadcast', controller.broadcastContent);

module.exports = router;
