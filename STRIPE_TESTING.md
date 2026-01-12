# Stripe Payment Testing Guide

## Overview
Stripe has two modes: **Test Mode** (for development) and **Live Mode** (for production). Test mode allows you to test payments without charging real cards.

## Setup

### 1. Get Test API Keys
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Copy your **Test Publishable Key** and **Test Secret Key**
3. Set them in your `.env` file:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...  # Test secret key
   STRIPE_WEBHOOK_SECRET=whsec_... # Get from webhook settings
   ```

### 2. Test Card Numbers
Stripe provides test card numbers that always succeed or fail. Use these in checkout:

#### Successful Payments
- **Visa**: `4242 4242 4242 4242`
- **Visa (debit)**: `4000 0566 5566 5556`
- **Mastercard**: `5555 5555 5555 4444`
- **American Express**: `3782 822463 10005`

#### Declined Payments
- **Declined card**: `4000 0000 0000 0002`
- **Insufficient funds**: `4000 0000 0000 9995`
- **Lost card**: `4000 0000 0000 9987`
- **Stolen card**: `4000 0000 0000 9979`

#### 3D Secure (3DS) Testing
- **3DS authentication required**: `4000 0027 6000 3184`
- **3DS authentication failed**: `4000 0000 0000 3055`

#### Test Card Details
- **CVV**: Any 3 digits (e.g., `123`)
- **Expiry**: Any future date (e.g., `12/25`)
- **ZIP**: Any 5 digits (e.g., `12345`)

## Testing Flow

### 1. Test Successful Payment
1. Navigate to Credits page (`/#credits`)
2. Click "Buy Credits" on any package
3. Use test card: `4242 4242 4242 4242`
4. Enter any future expiry, CVV, and ZIP
5. Complete checkout
6. Credits should be added to your account

### 2. Test Webhook Locally
For local development, use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Or download from: https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/credits/webhook

# This will output a webhook signing secret (whsec_...)
# Add it to your .env as STRIPE_WEBHOOK_SECRET
```

### 3. Test Webhook on Production
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Add endpoint: `https://your-backend-url.com/api/credits/webhook`
3. Select event: `checkout.session.completed`
4. Copy the webhook signing secret to your environment variables

## Test Scenarios

### ✅ Successful Payment
- Card: `4242 4242 4242 4242`
- Expected: Credits added to account, redirect to success page

### ❌ Declined Payment
- Card: `4000 0000 0000 0002`
- Expected: Payment declined, user stays on checkout

### 💳 3D Secure Authentication
- Card: `4000 0027 6000 3184`
- Expected: 3DS authentication prompt, then payment completes

### 🔄 Webhook Testing
Use Stripe CLI to trigger test events:
```bash
# Trigger test checkout.session.completed event
stripe trigger checkout.session.completed
```

## Verification

### Check Payments in Dashboard
1. Go to [Stripe Dashboard > Payments](https://dashboard.stripe.com/test/payments)
2. See all test payments (they have a "TEST" badge)
3. Click on any payment to see details

### Check Webhook Events
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click on your webhook endpoint
3. See all events and their responses
4. Check for successful webhook deliveries (green checkmark)

### Check Logs
- Backend logs: `logs/backend.log`
- Look for: `💰 [CREDITS] Added X credits to user Y`
- Webhook logs: Check Stripe Dashboard webhook event details

## Common Issues

### Webhook Not Working
- **Problem**: Credits not added after payment
- **Solution**: 
  - Check webhook endpoint is accessible
  - Verify `STRIPE_WEBHOOK_SECRET` is correct
  - Check webhook signature in logs
  - Ensure webhook is listening for `checkout.session.completed`

### Payment Succeeds but Credits Not Added
- **Problem**: Payment goes through but credits missing
- **Solution**:
  - Check webhook logs in Stripe Dashboard
  - Verify user ID in webhook metadata
  - Check MongoDB connection
  - Look for errors in backend logs

### Test Mode vs Live Mode
- **Problem**: Using live keys in development
- **Solution**: Always use test keys (`sk_test_...`) in development
- **Switch**: Use live keys (`sk_live_...`) only in production

## Production Checklist

Before going live:
- [ ] Switch to live API keys (`sk_live_...`)
- [ ] Set up production webhook endpoint
- [ ] Test with real card (use small amount first)
- [ ] Verify webhook signature verification works
- [ ] Monitor webhook deliveries
- [ ] Set up webhook failure alerts in Stripe Dashboard

## Additional Resources

- [Stripe Testing Documentation](https://stripe.com/docs/testing)
- [Stripe Test Cards](https://stripe.com/docs/testing#cards)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

