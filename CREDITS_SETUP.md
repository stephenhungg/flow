# Credit Payment System Setup Guide

This guide will help you set up Stripe payments so users can purchase credits for generating 3D scenes.

## Overview

- Each 3D generation costs **1 credit**
- Users must be signed in to generate scenes
- Credits are deducted before generation starts
- Credits are automatically refunded if generation fails
- Users start with 0 credits and must purchase more

## Step 1: Create Stripe Account

1. Go to [Stripe](https://stripe.com) and create an account
2. Complete account setup (business details, bank account, etc.)
3. For testing, you can use test mode (no real charges)

## Step 2: Get Stripe API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for production)
4. Keep this secure - never commit it to git!

## Step 3: Set Up Webhook

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL:
   ```
   https://flow-production-f962.up.railway.app/api/credits/webhook
   ```
   (Replace with your actual Railway URL)
4. Select event: `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
   - This is your `STRIPE_WEBHOOK_SECRET`

## Step 4: Add Environment Variables to Railway

In your Railway project settings, add these environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Important**: 
- Use `sk_test_...` for testing (no real charges)
- Use `sk_live_...` for production (real charges)
- Never commit these to git!

## Step 5: Install Stripe Package

The Stripe package should already be in `package.json`. If not, Railway will install it automatically during build.

If you need to install manually:
```bash
cd backend
npm install stripe
```

## Step 6: Test the System

### Test Mode (Recommended First)

1. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Any future expiry date (e.g., 12/34)
   - Any 3-digit CVC
   - Any ZIP code

2. Test the flow:
   - Sign in to your app
   - Try to generate a scene (should fail with "Insufficient credits")
   - Purchase credits via Stripe checkout
   - Generate a scene (should work)

### Production Mode

1. Switch to live keys in Railway:
   - Change `STRIPE_SECRET_KEY` to `sk_live_...`
   - Update webhook URL to use live mode
   - Get new webhook secret for live mode

2. Test with a small purchase first!

## Credit Packages

Current pricing (can be adjusted in `backend/server.js`):

- **5 credits**: $4.99 ($1.00 per generation)
- **10 credits**: $8.99 ($0.90 per generation)
- **20 credits**: $15.99 ($0.80 per generation)
- **50 credits**: $34.99 ($0.70 per generation)

## API Endpoints

### Get Credit Packages
```
GET /api/credits/packages
```
Returns available credit packages and prices.

### Create Checkout Session
```
POST /api/credits/create-checkout
Headers: Authorization: Bearer <firebase_token>
Body: { "packageId": 5 } // or 10, 20, 50
```
Returns Stripe checkout session URL.

### Webhook (Stripe calls this)
```
POST /api/credits/webhook
```
Handled automatically by Stripe - adds credits to user account after payment.

## Frontend Integration

You'll need to add frontend components to:
1. Display user's credit balance
2. Show "Buy Credits" button
3. Handle Stripe checkout redirect
4. Show success/error messages

Example frontend code will be added separately.

## Troubleshooting

### Webhook not working?
- Check webhook URL is correct in Stripe dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check Railway logs for webhook errors
- Make sure webhook endpoint is accessible (not blocked by CORS)

### Credits not being added?
- Check Stripe dashboard → Payments → Check if payment succeeded
- Check Stripe dashboard → Webhooks → See webhook delivery logs
- Check Railway logs for webhook processing errors
- Verify user ID matches between checkout and webhook

### Generation failing credit check?
- Make sure user is signed in (authMiddleware required)
- Check user has credits in database
- Verify `CREDITS_PER_GENERATION` constant matches your pricing

## Security Notes

- Never expose `STRIPE_SECRET_KEY` in frontend code
- Always verify webhook signatures (already implemented)
- Use HTTPS in production (Railway handles this)
- Validate user authentication before allowing purchases
- Consider adding rate limiting to checkout endpoint

## Cost Management

- Monitor Stripe dashboard for refunds/chargebacks
- Set up Stripe email alerts for failed payments
- Consider adding admin dashboard to view credit usage
- Track API costs vs credit revenue to ensure profitability

