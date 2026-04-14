/**
 * Input validation middleware
 * Uses express-validator for request validation
 */

import { body, validationResult } from 'express-validator';

// Validation rules for scene creation
export const validateSceneCreation = [
  body('title').trim().isLength({ min: 1, max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
  body('concept').trim().isLength({ min: 1, max: 200 }).escape(),
  body('isPublic').optional().isBoolean().toBoolean(),
  body('allowRemix').optional().isBoolean().toBoolean(),
  body('tags').optional().isArray({ max: 10 }),
  body('thumbnailBase64').optional().isBase64(),
];

// Validation rules for scene updates
export const validateSceneUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
  body('isPublic').optional().isBoolean().toBoolean(),
  body('allowRemix').optional().isBoolean().toBoolean(),
];

// Helper to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Invalid input',
      details: errors.array()
    });
  }
  next();
};
