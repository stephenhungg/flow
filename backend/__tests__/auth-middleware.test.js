/**
 * Tests for middleware/auth.js
 * Token verification, credit checking, admin detection, rate limiting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before importing auth module
vi.mock('firebase-admin', () => {
  const mockVerifyIdToken = vi.fn();
  return {
    default: {
      apps: [{}], // pretend already initialized
      auth: () => ({ verifyIdToken: mockVerifyIdToken }),
      credential: { cert: vi.fn() },
      initializeApp: vi.fn(),
    },
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

// Mock mongodb
const mockFindOne = vi.fn();
vi.mock('../server/lib/mongodb.js', () => ({
  getUsersCollection: () => ({
    findOne: mockFindOne,
  }),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

const { default: admin, __mockVerifyIdToken } = await import('firebase-admin');

describe('authMiddleware', () => {
  let authMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get the re-exported middleware
    const mod = await import('../server/lib/auth.js');
    authMiddleware = mod.authMiddleware;
  });

  it('passes OPTIONS requests through without auth', async () => {
    const req = { method: 'OPTIONS', headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects requests without Authorization header', async () => {
    const req = { method: 'GET', headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'No authorization token provided' })
    );
  });

  it('rejects requests with non-Bearer token', async () => {
    const req = { method: 'GET', headers: { authorization: 'Basic abc123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches user info on valid token', async () => {
    __mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer validtoken' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      uid: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    });
  });

  it('returns 401 on invalid token', async () => {
    __mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

    const req = { method: 'GET', headers: { authorization: 'Bearer invalidtoken' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
  });
});

describe('creditCheckMiddleware', () => {
  let creditCheckMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../middleware/auth.js');
    creditCheckMiddleware = mod.creditCheckMiddleware;
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = { user: null };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 404 when user not found in database', async () => {
    mockFindOne.mockResolvedValue(null);

    const req = { user: { uid: 'user123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('grants unlimited credits to admin users', async () => {
    // Set admin email via env
    const originalEnv = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'admin@example.com';

    mockFindOne.mockResolvedValue({
      _id: 'mongoId123',
      firebaseUid: 'user123',
      email: 'admin@example.com',
      credits: 5,
    });

    const req = { user: { uid: 'user123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userCredits).toBe(Infinity);
    expect(req.isAdmin).toBe(true);

    process.env.ADMIN_EMAILS = originalEnv;
  });

  it('returns 402 when user has insufficient credits', async () => {
    const originalEnv = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = '';

    mockFindOne.mockResolvedValue({
      _id: 'mongoId123',
      firebaseUid: 'user123',
      email: 'user@example.com',
      credits: 0,
    });

    const req = { user: { uid: 'user123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Insufficient credits' })
    );

    process.env.ADMIN_EMAILS = originalEnv;
  });

  it('passes through when user has enough credits', async () => {
    const originalEnv = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = '';

    mockFindOne.mockResolvedValue({
      _id: 'mongoId123',
      firebaseUid: 'user123',
      email: 'user@example.com',
      credits: 5,
    });

    const req = { user: { uid: 'user123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userCredits).toBe(5);
    expect(req.userId).toBe('mongoId123');

    process.env.ADMIN_EMAILS = originalEnv;
  });

  it('handles database errors gracefully', async () => {
    mockFindOne.mockRejectedValue(new Error('DB connection lost'));

    const req = { user: { uid: 'user123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await creditCheckMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rateLimitMiddleware', () => {
  let rateLimitMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../middleware/auth.js');
    rateLimitMiddleware = mod.rateLimitMiddleware;
  });

  it('bypasses rate limit for admin users', () => {
    const req = { isAdmin: true, ip: '127.0.0.1' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows first request from an IP', () => {
    const req = { isAdmin: false, ip: '10.0.0.1' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
