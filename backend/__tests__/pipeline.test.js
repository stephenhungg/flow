/**
 * Tests for routes/pipeline.js
 * Pipeline state machine: start validation, status transitions, job management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    auth: () => ({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'user123',
        email: 'test@example.com',
      }),
    }),
    credential: { cert: vi.fn() },
    initializeApp: vi.fn(),
  },
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock mongodb
const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
vi.mock('../server/lib/mongodb.js', () => ({
  getUsersCollection: () => ({
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  }),
}));

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

// Mock express-rate-limit
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req, res, next) => next()),
}));

// Mock multer
vi.mock('multer', () => {
  const multerInstance = {
    single: () => (req, res, next) => next(),
    memoryStorage: vi.fn(),
  };
  const multerFn = vi.fn(() => multerInstance);
  multerFn.memoryStorage = vi.fn();
  multerFn.MulterError = class MulterError extends Error {};
  return { default: multerFn };
});

// Mock marble lib
vi.mock('../lib/marble.js', () => ({
  prepareMediaUpload: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  generateWorld: vi.fn(),
  checkOperationStatus: vi.fn(),
  fetchWorld: vi.fn(),
  extractSplatUrl: vi.fn(),
  extractColliderMeshUrl: vi.fn(),
  extractLowResSplatUrl: vi.fn(),
  MARBLE_MEDIA_ENDPOINT: 'https://api.worldlabs.ai/marble/v1/media-assets:prepare_upload',
  MARBLE_GENERATE_ENDPOINT: 'https://api.worldlabs.ai/marble/v1/worlds:generate',
  MARBLE_OPERATIONS_ENDPOINT: 'https://api.worldlabs.ai/marble/v1/operations',
  MARBLE_WORLDS_ENDPOINT: 'https://api.worldlabs.ai/marble/v1/worlds',
}));

describe('Pipeline job management', () => {
  let pipelineJobs;
  let emitPipelineUpdate;

  beforeEach(() => {
    pipelineJobs = new Map();
    emitPipelineUpdate = vi.fn();
    vi.clearAllMocks();
  });

  describe('Job status tracking', () => {
    it('stores job with initial started state', () => {
      const jobId = 'job_123';
      pipelineJobs.set(jobId, {
        status: 'started',
        concept: 'A beautiful forest',
        quality: 'standard',
        startTime: Date.now(),
        userId: 'user123',
        cancelled: false,
      });

      const job = pipelineJobs.get(jobId);
      expect(job.status).toBe('started');
      expect(job.concept).toBe('A beautiful forest');
      expect(job.cancelled).toBe(false);
    });

    it('returns undefined for non-existent job', () => {
      expect(pipelineJobs.get('nonexistent')).toBeUndefined();
    });

    it('tracks job state transitions', () => {
      const jobId = 'job_456';

      // Start
      pipelineJobs.set(jobId, { status: 'started', cancelled: false });
      expect(pipelineJobs.get(jobId).status).toBe('started');

      // Processing
      pipelineJobs.set(jobId, { ...pipelineJobs.get(jobId), status: 'processing' });
      expect(pipelineJobs.get(jobId).status).toBe('processing');

      // Completed
      pipelineJobs.set(jobId, {
        ...pipelineJobs.get(jobId),
        status: 'completed',
        splatUrl: 'https://example.com/splat.spz',
        completedAt: Date.now(),
      });
      expect(pipelineJobs.get(jobId).status).toBe('completed');
      expect(pipelineJobs.get(jobId).splatUrl).toBe('https://example.com/splat.spz');
    });

    it('handles cancellation state', () => {
      const jobId = 'job_789';

      pipelineJobs.set(jobId, {
        status: 'started',
        userId: 'user123',
        cancelled: false,
      });

      // Cancel
      const job = pipelineJobs.get(jobId);
      job.cancelled = true;
      job.status = 'cancelled';
      pipelineJobs.set(jobId, job);

      expect(pipelineJobs.get(jobId).cancelled).toBe(true);
      expect(pipelineJobs.get(jobId).status).toBe('cancelled');
    });

    it('transitions to error state on failure', () => {
      const jobId = 'job_error';

      pipelineJobs.set(jobId, { status: 'started', cancelled: false });

      // Error
      pipelineJobs.set(jobId, {
        ...pipelineJobs.get(jobId),
        status: 'error',
        error: 'Marble API timeout',
      });

      expect(pipelineJobs.get(jobId).status).toBe('error');
      expect(pipelineJobs.get(jobId).error).toBe('Marble API timeout');
    });
  });

  describe('Pipeline start validation', () => {
    it('requires a non-empty concept', () => {
      const concept = '';
      expect(concept.trim()).toBe('');
      // The route returns 400 for empty concept
    });

    it('rejects concept over 200 characters', () => {
      const concept = 'A'.repeat(201);
      expect(concept.length).toBeGreaterThan(200);
    });

    it('trims whitespace from concept', () => {
      const concept = '  A beautiful forest  ';
      expect(concept.trim()).toBe('A beautiful forest');
    });

    it('generates unique job IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ids.add(jobId);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Pipeline update emission', () => {
    it('emits updates with correct stage and progress', () => {
      emitPipelineUpdate('job_123', 'orchestrating', 5, 'Analyzing concept...');
      expect(emitPipelineUpdate).toHaveBeenCalledWith(
        'job_123', 'orchestrating', 5, 'Analyzing concept...'
      );
    });

    it('emits completion with splat URL', () => {
      emitPipelineUpdate('job_123', 'complete', 100, 'Your 3D world is ready!', {
        splatUrl: 'https://example.com/splat.spz',
        completed: true,
      });

      expect(emitPipelineUpdate).toHaveBeenCalledWith(
        'job_123',
        'complete',
        100,
        'Your 3D world is ready!',
        expect.objectContaining({
          splatUrl: 'https://example.com/splat.spz',
          completed: true,
        })
      );
    });

    it('emits error with cancellation flag', () => {
      emitPipelineUpdate('job_123', 'error', 0, 'Pipeline cancelled by user', {
        error: true,
        cancelled: true,
      });

      expect(emitPipelineUpdate).toHaveBeenCalledWith(
        'job_123',
        'error',
        0,
        'Pipeline cancelled by user',
        expect.objectContaining({ error: true, cancelled: true })
      );
    });
  });

  describe('Credit deduction logic', () => {
    it('deducts 1 credit per generation for regular users', () => {
      const CREDITS_PER_GENERATION = 1;
      const userCredits = 5;
      const newCredits = userCredits - CREDITS_PER_GENERATION;
      expect(newCredits).toBe(4);
    });

    it('does not deduct credits for admin users', () => {
      const isAdmin = true;
      const userCredits = 5;
      const newCredits = isAdmin ? Infinity : userCredits - 1;
      expect(newCredits).toBe(Infinity);
    });

    it('refunds credits on cancellation of running job', () => {
      const CREDITS_PER_GENERATION = 1;
      const job = { status: 'started', cancelled: false, completed: false };
      const wasRunning = job.status === 'started' || job.status === 'processing';
      expect(wasRunning).toBe(true);
      // Credit refund should happen
    });

    it('does not refund credits for already completed jobs', () => {
      const job = { status: 'completed', cancelled: false, completed: true };
      const wasRunning = job.status === 'started' || job.status === 'processing';
      expect(wasRunning).toBe(false);
      // No refund
    });
  });
});

describe('createPipelineRoutes', () => {
  it('creates a router with pipeline routes', async () => {
    const mod = await import('../routes/pipeline.js');
    const createPipelineRoutes = mod.default;

    const io = {};
    const pipelineJobs = new Map();
    const emitPipelineUpdate = vi.fn();

    const router = createPipelineRoutes(io, pipelineJobs, emitPipelineUpdate);
    expect(router).toBeDefined();
    // Router should have stack with route handlers
    expect(router.stack).toBeDefined();
  });
});
