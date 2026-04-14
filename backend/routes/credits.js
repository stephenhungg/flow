/**
 * Credits & payment route handlers
 * POST /create-checkout — create Stripe checkout session
 * POST /verify-session — verify Stripe checkout session
 * GET /packages — get available credit packages
 * POST /webhook — Stripe webhook (registered separately in server.js before express.json)
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { authMiddleware } from '../server/lib/auth.js';
import { getUsersCollection } from '../server/lib/mongodb.js';
import { ObjectId } from 'mongodb';

const router = Router();

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Credit system configuration
const CREDITS_PACKAGES = {
  1: 99,    // $0.99 for 1 credit - Single generation option
  5: 499,   // $4.99 for 5 credits (~$1.00/gen) - Small loss to attract users
  10: 999,  // $9.99 for 10 credits (~$1.00/gen)
  20: 1899, // $18.99 for 20 credits (~$0.95/gen) - Best value, covers cost
  50: 4499, // $44.99 for 50 credits (~$0.90/gen) - Best value, small profit
};

/**
 * POST /create-checkout
 * Create Stripe checkout session for purchasing credits
 */
router.post('/create-checkout', authMiddleware, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured. Please set STRIPE_SECRET_KEY.' });
    }

    const { packageId } = req.body;
    const credits = parseInt(packageId);
    const amount = CREDITS_PACKAGES[credits];

    if (!amount) {
      return res.status(400).json({ error: 'Invalid credit package' });
    }

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const origin = req.headers.origin || 'https://flow.stephenhung.me';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} Generation Credits`,
              description: `Purchase ${credits} credits to generate ${credits} 3D scenes`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/#credits?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#credits?credits=cancelled`,
      client_reference_id: user._id.toString(),
      metadata: {
        userId: user._id.toString(),
        firebaseUid: req.user.uid,
        credits: credits.toString(),
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ [STRIPE] Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify-session
 * Verify Stripe checkout session and add credits (fallback if webhook hasn't fired)
 */
router.post('/verify-session', authMiddleware, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Verify this session belongs to the current user
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (session.client_reference_id !== user._id.toString()) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Check if credits were already added (prevent double-crediting)
    const credits = parseInt(session.metadata.credits);
    if (!credits) {
      return res.status(400).json({ error: 'Invalid session metadata' });
    }

    await usersCollection.findOneAndUpdate(
      { _id: user._id },
      { $inc: { credits: credits } }
    );

    console.log(`💰 [CREDITS] Added ${credits} credits via session verification for user ${user._id}`);

    const updatedUser = await usersCollection.findOne({ _id: user._id });
    res.json({
      success: true,
      creditsAdded: credits,
      totalCredits: updatedUser?.credits || 0
    });
  } catch (error) {
    console.error('❌ [CREDITS] Session verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /packages
 * Get available credit packages
 */
router.get('/packages', (req, res) => {
  const packages = Object.entries(CREDITS_PACKAGES).map(([credits, amount]) => ({
    credits: parseInt(credits),
    price: amount / 100,
    priceCents: amount,
  }));

  // Cache credit packages for 5 minutes (can change when pricing updates)
  res.set({
    'Cache-Control': 'public, max-age=300, must-revalidate'
  });

  res.json({ packages });
});

/**
 * Create the Stripe webhook handler
 * Must be registered BEFORE express.json() middleware in server.js
 * @returns {Function} Express route handler
 */
export function createWebhookHandler() {
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  return async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      console.error('❌ [STRIPE] Webhook not configured - stripe:', !!stripe, 'secret:', !!STRIPE_WEBHOOK_SECRET);
      return res.status(500).json({ error: 'Stripe webhook not configured' });
    }

    const sig = req.headers['stripe-signature'];

    // Debug logging (remove in production if needed)
    console.log('🔔 [STRIPE] Webhook received');
    console.log('   Signature header present:', !!sig);
    console.log('   Body type:', typeof req.body);
    console.log('   Body is buffer:', Buffer.isBuffer(req.body));
    console.log('   Body length:', req.body?.length);

    if (!sig) {
      console.error('❌ [STRIPE] No stripe-signature header found');
      return res.status(400).send('Webhook Error: No signature header');
    }

    let event;
    try {
      // Ensure body is a Buffer (raw body)
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
      console.log('✅ [STRIPE] Webhook signature verified, event type:', event.type);
    } catch (err) {
      console.error('❌ [STRIPE] Webhook signature verification failed:', err.message);
      console.error('   Error type:', err.type);
      console.error('   Signature header:', sig?.substring(0, 20) + '...');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const credits = parseInt(session.metadata.credits);
      const userId = session.metadata.userId;

      try {
        const usersCollection = getUsersCollection();
        await usersCollection.findOneAndUpdate(
          { _id: new ObjectId(userId) },
          { $inc: { credits: credits } }
        );
        console.log(`💰 [CREDITS] Added ${credits} credits to user ${userId}`);
      } catch (error) {
        console.error('❌ [CREDITS] Failed to add credits:', error);
      }
    }

    res.json({ received: true });
  };
}

export default router;
