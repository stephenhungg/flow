/**
 * Tests for middleware/validation.js
 * Input validation: concept length limits, empty strings, sanitization
 */

import { describe, it, expect, vi } from 'vitest';
import { validateSceneCreation, validateSceneUpdate, handleValidationErrors } from '../middleware/validation.js';

/**
 * Helper: run express-validator middleware chain against a mock request
 * Returns the mock response if validation failed, or null if next() was called.
 */
async function runValidation(validators, body) {
  const req = {
    body: { ...body },
    // express-validator needs these on the req object
    query: {},
    params: {},
    headers: {},
  };

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  let nextCalled = false;
  const next = vi.fn(() => { nextCalled = true; });

  // Run each validator middleware in sequence
  for (const validator of validators) {
    await validator(req, res, () => {});
  }

  // Run the error handler
  handleValidationErrors(req, res, next);

  return { req, res, nextCalled };
}

describe('validateSceneCreation', () => {
  it('accepts valid scene creation input', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: 'A beautiful forest',
    });

    expect(nextCalled).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects empty title', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: '',
      concept: 'A forest',
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid input' })
    );
  });

  it('rejects title exceeding 100 characters', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'A'.repeat(101),
      concept: 'A forest',
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects empty concept', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: '',
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects concept exceeding 200 characters', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: 'A'.repeat(201),
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects description exceeding 500 characters', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: 'A forest',
      description: 'D'.repeat(501),
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('sanitizes HTML in title via escape()', async () => {
    const { nextCalled, req } = await runValidation(validateSceneCreation, {
      title: '<script>alert("xss")</script>',
      concept: 'A forest',
    });

    // express-validator escape() converts < > to &lt; &gt;
    expect(nextCalled).toBe(true);
    expect(req.body.title).not.toContain('<script>');
  });

  it('trims whitespace from title and concept', async () => {
    const { nextCalled, req } = await runValidation(validateSceneCreation, {
      title: '  My Scene  ',
      concept: '  A forest  ',
    });

    expect(nextCalled).toBe(true);
    expect(req.body.title).toBe('My Scene');
    expect(req.body.concept).toBe('A forest');
  });

  it('allows optional description', async () => {
    const { nextCalled } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: 'A forest',
      // description omitted
    });

    expect(nextCalled).toBe(true);
  });

  it('rejects tags array exceeding 10 items', async () => {
    const { nextCalled, res } = await runValidation(validateSceneCreation, {
      title: 'My Scene',
      concept: 'A forest',
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('validateSceneUpdate', () => {
  it('accepts valid partial update', async () => {
    const { nextCalled } = await runValidation(validateSceneUpdate, {
      title: 'Updated Title',
    });

    expect(nextCalled).toBe(true);
  });

  it('allows empty body (all fields optional)', async () => {
    const { nextCalled } = await runValidation(validateSceneUpdate, {});

    expect(nextCalled).toBe(true);
  });

  it('rejects title exceeding 100 characters on update', async () => {
    const { nextCalled, res } = await runValidation(validateSceneUpdate, {
      title: 'A'.repeat(101),
    });

    expect(nextCalled).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('handleValidationErrors', () => {
  it('calls next() when there are no errors', async () => {
    // Run with valid data
    const { nextCalled } = await runValidation([], {});
    expect(nextCalled).toBe(true);
  });
});
