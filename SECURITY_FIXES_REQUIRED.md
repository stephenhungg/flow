# 🚨 CRITICAL SECURITY FIXES REQUIRED

**Generated:** 2026-02-02
**Severity:** CRITICAL
**Status:** IMMEDIATE ACTION REQUIRED

## ⚠️ EXPOSED CREDENTIALS WARNING

Your repository has exposed credentials in the `.env` file. While the file is gitignored, if it was ever committed previously, the credentials are compromised.

### Immediate Actions Required

#### 1. Rotate ALL Credentials (DO THIS NOW!)

Login to each service and regenerate/rotate these keys immediately:

- [ ] **MongoDB Atlas** - Change database user password
- [ ] **Firebase** - Generate new service account key
- [ ] **Vercel Blob** - Regenerate read/write token
- [ ] **Stripe** - Roll API keys (use new test keys)
- [ ] **ElevenLabs** - Regenerate API key
- [ ] **Gemini** - Create new API key
- [ ] **Deepgram** - Generate new API key
- [ ] **Marble/World Labs** - Request new API key

#### 2. Check Git History

```bash
# Check if .env was ever committed
git log --all --full-history -- .env

# If it was committed, you need to remove it from history
# WARNING: This rewrites history - coordinate with team
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (after team coordination)
git push origin --force --all
git push origin --force --tags
```

## 🔴 Critical Security Vulnerabilities

### 1. Missing Authorization on Financial Endpoints

**File:** `backend/server.js`
**Lines:** Multiple locations
**Risk:** Any user can access/modify other users' financial data

**Fix Required:**
```javascript
// Before - INSECURE
app.delete('/api/scenes/:id', async (req, res) => {
  await scenesCollection.deleteOne({ _id: id });
});

// After - SECURE
app.delete('/api/scenes/:id', authenticate, async (req, res) => {
  const userId = req.user.uid;
  const scene = await scenesCollection.findOne({ _id: id });

  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }

  if (scene.userId !== userId && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await scenesCollection.deleteOne({ _id: id, userId });
});
```

### 2. No Rate Limiting

**Risk:** DoS attacks, abuse, resource exhaustion

**Install and Configure:**
```bash
npm install express-rate-limit express-slow-down
```

```javascript
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: 'Too many login attempts'
});

// Prevent API abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests'
});

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter, speedLimiter);
```

### 3. SQL/NoSQL Injection Risks

**Risk:** Database manipulation, data theft

**Fix Required:**
```javascript
// Before - VULNERABLE
const scenes = await scenesCollection.find({
  title: req.query.search
});

// After - SAFE
const sanitizedSearch = req.query.search?.replace(/[^\w\s]/gi, '');
const scenes = await scenesCollection.find({
  title: { $regex: sanitizedSearch, $options: 'i' }
});
```

### 4. Missing Input Validation

**Install Validator:**
```bash
npm install express-validator
```

```javascript
import { body, validationResult } from 'express-validator';

const validateScene = [
  body('title').trim().isLength({ min: 1, max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
  body('concept').optional().trim().escape(),
  body('isPublic').isBoolean(),
  body('allowRemix').isBoolean()
];

app.post('/api/scenes',
  authenticate,
  validateScene,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Process validated input
  }
);
```

### 5. No HTTPS Enforcement

**Add Security Headers:**
```bash
npm install helmet
```

```javascript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
```

### 6. Console.log in Production

**Replace with Proper Logging:**
```bash
npm install winston
```

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'flow-backend' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Replace all console.log
logger.info('Server started', { port: 3001 });
logger.error('Database error', { error: err.message });
```

### 7. Missing CORS Configuration

```javascript
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://flow.app', // Your production domain
      'http://localhost:5173' // Dev only
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

## 📋 Implementation Checklist

### Phase 1: Critical (Today)
- [ ] Rotate all compromised credentials
- [ ] Add authentication checks to all endpoints
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Fix CORS configuration

### Phase 2: High Priority (This Week)
- [ ] Replace console.log with winston
- [ ] Add security headers (helmet)
- [ ] Implement request sanitization
- [ ] Add error handling middleware
- [ ] Create security event logging

### Phase 3: Important (Next Week)
- [ ] Add automated security testing
- [ ] Implement session management
- [ ] Add API versioning
- [ ] Create security documentation
- [ ] Set up monitoring/alerting

## 🛡️ Security Best Practices Going Forward

1. **Never commit credentials** - Use environment variables
2. **Always validate input** - Never trust user data
3. **Implement least privilege** - Users should only access their own data
4. **Use parameterized queries** - Prevent injection attacks
5. **Enable audit logging** - Track all sensitive operations
6. **Regular security audits** - Use tools like:
   - `npm audit`
   - OWASP ZAP
   - Snyk
   - SonarQube

7. **Security testing in CI/CD**:
```yaml
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm audit
      - run: npm run test:security
```

## 🚨 If You've Been Breached

If credentials were exposed and used maliciously:

1. **Immediately revoke all credentials**
2. **Check logs for unauthorized access:**
   - MongoDB Atlas Activity Feed
   - Firebase Authentication logs
   - Stripe API logs
   - Vercel deployment logs

3. **Notify affected users** if data was accessed
4. **File incident report** if required by regulations
5. **Implement additional security measures:**
   - IP whitelisting
   - 2FA on all accounts
   - API key restrictions
   - Webhook signature validation

## 📞 Security Resources

- [OWASP Top 10](https://owasp.org/Top10/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)

## ⚡ Quick Security Hardening Script

```bash
#!/bin/bash
# Run this to quickly add security dependencies

npm install helmet express-rate-limit express-validator winston bcrypt jsonwebtoken
npm install --save-dev @types/helmet @types/express-rate-limit

echo "Security packages installed. Now implement the fixes above!"
```

---

**Remember:** Security is not a one-time fix but an ongoing process. After fixing these critical issues, establish regular security reviews and keep dependencies updated.