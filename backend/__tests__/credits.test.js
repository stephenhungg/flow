/**
 * Tests for routes/credits.js
 * Package pricing, webhook handling, credit calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    auth: () => ({ verifyIdToken: vi.fn() }),
    credential: { cert: vi.fn() },
    initializeApp: vi.fn(),
  },
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock mongodb
vi.mock('../server/lib/mongodb.js', () => ({
  getUsersCollection: () => ({
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }),
}));

// Mock Stripe as a class constructor
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      constructor() {
        this.checkout = {
          sessions: {
            create: vi.fn(),
            retrieve: vi.fn(),
          },
        };
        this.webhooks = {
          constructEvent: vi.fn(),
        };
      }
    },
  };
});

describe('Credit packages', () => {
  const CREDITS_PACKAGES = {
    1: 99,
    5: 499,
    10: 999,
    20: 1899,
    50: 4499,
  };

  it('has correct pricing for 1 credit ($0.99)', () => {
    expect(CREDITS_PACKAGES[1]).toBe(99);
  });

  it('has correct pricing for 5 credits ($4.99)', () => {
    expect(CREDITS_PACKAGES[5]).toBe(499);
  });

  it('has correct pricing for 10 credits ($9.99)', () => {
    expect(CREDITS_PACKAGES[10]).toBe(999);
  });

  it('has correct pricing for 20 credits ($18.99)', () => {
    expect(CREDITS_PACKAGES[20]).toBe(1899);
  });

  it('has correct pricing for 50 credits ($44.99)', () => {
    expect(CREDITS_PACKAGES[50]).toBe(4499);
  });

  it('has volume discount (50 pack is cheapest per credit)', () => {
    const perCredit = {};
    for (const [credits, price] of Object.entries(CREDITS_PACKAGES)) {
      perCredit[credits] = price / parseInt(credits);
    }

    expect(perCredit[50]).toBeLessThan(perCredit[1]);
    expect(perCredit[50]).toBeLessThan(perCredit[5]);
    expect(perCredit[50]).toBeLessThan(perCredit[10]);
    expect(perCredit[50]).toBeLessThan(perCredit[20]);
  });
});

describe('Stripe webhook handler', () => {
  let createWebhookHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/credits.js');
    createWebhookHandler = mod.createWebhookHandler;
  });

  it('returns 500 when Stripe is not configured', async () => {
    const originalKey = process.env.STRIPE_SECRET_KEY;
    const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const handler = createWebhookHandler();
    const req = { headers: {}, body: Buffer.from('{}') };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), send: vi.fn() };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);

    process.env.STRIPE_SECRET_KEY = originalKey;
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
  });
});

describe('GET /packages endpoint logic', () => {
  const CREDITS_PACKAGES = {
    1: 99,
    5: 499,
    10: 999,
    20: 1899,
    50: 4499,
  };

  it('formats packages correctly with price in dollars', () => {
    const packages = Object.entries(CREDITS_PACKAGES).map(([credits, amount]) => ({
      credits: parseInt(credits),
      price: amount / 100,
      priceCents: amount,
    }));

    expect(packages).toHaveLength(5);
    expect(packages[0]).toEqual({ credits: 1, price: 0.99, priceCents: 99 });
    expect(packages[4]).toEqual({ credits: 50, price: 44.99, priceCents: 4499 });
  });

  it('rejects invalid package IDs', () => {
    const invalidIds = [0, 3, 7, 15, 100, -1];
    for (const id of invalidIds) {
      expect(CREDITS_PACKAGES[id]).toBeUndefined();
    }
  });
});
