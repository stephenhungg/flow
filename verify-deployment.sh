#!/bin/bash

# Verify Deployment Script
# Run this after deployment to check security patches

PROD_URL="https://your-app.com"  # CHANGE THIS TO YOUR ACTUAL URL

echo "🔍 Verifying Security Patches..."
echo "================================"

# 1. Check if API is up
echo "1. Checking API health..."
curl -s "$PROD_URL/api/health" || echo "❌ API not responding"

# 2. Test rate limiting
echo -e "\n2. Testing rate limiting (should see 429 after ~100 requests)..."
for i in {1..105}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/health")
    if [ "$STATUS" = "429" ]; then
        echo "✅ Rate limiting working! (blocked at request $i)"
        break
    fi
    if [ $i -eq 105 ]; then
        echo "⚠️ Rate limiting might not be working (no 429 after 105 requests)"
    fi
done

# 3. Check security headers
echo -e "\n3. Checking security headers..."
HEADERS=$(curl -sI "$PROD_URL/api/health")
if echo "$HEADERS" | grep -q "x-helmet"; then
    echo "✅ Helmet security headers present"
else
    echo "⚠️ Helmet headers not found"
fi

# 4. Test input validation
echo -e "\n4. Testing input validation..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/scenes" \
  -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(1)</script>"}')

if echo "$RESPONSE" | grep -q "Invalid input\|validation"; then
    echo "✅ Input validation working"
else
    echo "⚠️ Input validation might not be working"
fi

echo -e "\n================================"
echo "✅ Verification complete!"
echo ""
echo "Next steps:"
echo "1. Monitor your application logs"
echo "2. Check for any error spikes"
echo "3. Rotate credentials as precaution"