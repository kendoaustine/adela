const express = require('express');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requestId);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', [
  authenticate,
  authorize('platform_admin'),
], asyncHandler(async (req, res) => {
  // TODO: Implement user listing with pagination and filtering
  res.json({ message: 'Users endpoint - to be implemented' });
}));

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', [
  authenticate,
  authorize('platform_admin'),
], asyncHandler(async (req, res) => {
  // TODO: Implement get user by ID
  res.json({ message: 'Get user by ID - to be implemented' });
}));

module.exports = router;
