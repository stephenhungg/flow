# 🚀 Flow Deployment Checklist

**Step-by-step deployment guide for Frontend (Vercel) + Backend (Vultr VPS)**

---

## ✅ PRE-DEPLOYMENT CHECKS

### 1. Environment Variables Checklist

Make sure you have all these ready:

#### Backend (`.env` in root):
```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/flow?retryWrites=true&w=majority

# Firebase Admin (full JSON as string or separate vars)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Vultr Object Storage
VULTR_STORAGE_HOSTNAME=ewr1.vultrobjects.com
VULTR_STORAGE_ACCESS_KEY=your_access_key
VULTR_STORAGE_SECRET_KEY=your_secret_key
VULTR_STORAGE_BUCKET=flow-bucket

# API Keys
VITE_GEMINI_API_KEY=your_gemini_key
VITE_MARBLE_API_KEY=your_marble_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id (optional)
DEEPGRAM_API_KEY=your_deepgram_key

# Stripe Payment (for credit system)
STRIPE_SECRET_KEY=sk_test_... (get from Stripe dashboard)
STRIPE_WEBHOOK_SECRET=whsec_... (get from Stripe webhook settings)

# Server
PORT=3001
```

#### Frontend (`.env` in `frontend/` folder - for Vercel):
```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# This will be updated after backend is deployed
VITE_API_URL=http://YOUR_VPS_IP:3001
```

---

## 📦 BACKEND DEPLOYMENT (Vultr VPS)

### Step 1: Get VPS Ready
```bash
# SSH into your Vultr VPS
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node --version  # Should show v20.x
npm --version
```

### Step 2: Clone & Setup Repository
```bash
cd /root
git clone https://github.com/YOUR_USERNAME/flow.git
cd flow

# Install backend dependencies
cd backend
npm install

# Go back to root
cd ..
```

### Step 3: Create `.env` File on VPS
```bash
# Create .env file using cat (since nano might not work)
cat > .env << 'ENVEOF'
# Paste all your environment variables here
# (Use the template from the checklist above)
ENVEOF
```

**OR copy from local machine:**
```bash
# From your local machine:
scp .env root@YOUR_VPS_IP:/root/flow/.env
```

### Step 4: Install PM2
```bash
npm install -g pm2
```

### Step 5: Start Backend with PM2
```bash
cd backend

# Start the server
pm2 start server.js --name flow-backend

# Make PM2 start on boot
pm2 startup
# Copy and run the command it gives you (usually something like: sudo env PATH=...)

# Save PM2 process list
pm2 save

# Check status
pm2 status
pm2 logs flow-backend
```

### Step 6: Configure Firewall
```bash
# Allow SSH
ufw allow 22/tcp

# Allow your API port
ufw allow 3001/tcp

# Allow HTTP/HTTPS (for nginx later)
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

### Step 7: Test Backend
```bash
# Test locally on server
curl http://localhost:3001/health

# Test from your computer (replace with your VPS IP)
curl http://YOUR_VPS_IP:3001/health
```

**Expected response:**
```json
{"status":"ok"}
```

### Step 8: Get Your VPS IP
```bash
# On VPS, run:
curl ifconfig.me
```

**Save this IP!** You'll need it for the frontend deployment.

---

## 🎨 FRONTEND DEPLOYMENT (Vercel)

### Step 1: Push Code to GitHub
```bash
# On your local machine
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Connect GitHub to Vercel

1. Go to [Vercel](https://vercel.com/)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### Step 3: Add Environment Variables in Vercel

In Vercel project settings → Environment Variables, add:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_URL=http://YOUR_VPS_IP:3001  # Replace with your actual VPS IP
```

### Step 4: Deploy
Click **"Deploy"** in Vercel!

---

## 🔒 SECURITY CHECKS

### MongoDB Atlas Network Access

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Click **"Network Access"**
3. Add your VPS IP address
   - OR add `0.0.0.0/0` (allows all - less secure but easier)

### Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add your Vercel domain (e.g., `your-app.vercel.app`)

---

## ✅ POST-DEPLOYMENT TESTS

### 1. Test Backend Health
```bash
curl http://YOUR_VPS_IP:3001/health
# Should return: {"status":"ok"}
```

### 2. Test Frontend
- Visit your Vercel URL
- Try signing in with Google
- Try creating a world (voice or text input)
- Try saving to library
- Try exploring a saved world from library

### 3. Check Logs

**Backend logs:**
```bash
pm2 logs flow-backend
```

---

## 🐛 TROUBLESHOOTING

### Backend not starting?
```bash
# Check PM2 logs
pm2 logs flow-backend

# Check if port is in use
netstat -tulpn | grep 3001

# Restart
pm2 restart flow-backend

# Check environment variables
cd /root/flow
cat .env  # Make sure all vars are there
```

### Frontend CORS errors?
- Check `VITE_API_URL` in Vercel environment variables
- Check backend CORS settings
- Make sure backend is running: `pm2 status`

### MongoDB connection errors?
- Check MongoDB Network Access (allow your VPS IP)
- Verify `MONGODB_URI` in `.env` is correct
- Test connection from VPS: `curl http://localhost:3001/health`

### Firebase auth not working?
- Check authorized domains in Firebase Console
- Verify all `VITE_FIREBASE_*` vars are set in Vercel
- Check browser console for errors

---

## 📝 QUICK REFERENCE

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs flow-backend   # View logs
pm2 restart flow-backend # Restart
pm2 stop flow-backend   # Stop
pm2 delete flow-backend # Delete
pm2 monit               # Monitor in real-time
```

### Update Backend Code
```bash
cd /root/flow
git pull
cd backend
npm install  # If new dependencies
pm2 restart flow-backend
```

### Update Frontend
Just push to GitHub - Vercel auto-deploys!

---

## 🎯 DEPLOYMENT ORDER

1. ✅ **Backend first** (Vultr VPS)
   - Set up VPS
   - Deploy backend
   - Test API endpoints
   - Get VPS IP address

2. ✅ **Frontend second** (Vercel)
   - Update `VITE_API_URL` with backend IP
   - Deploy to Vercel
   - Test full stack

3. ✅ **Security & cleanup**
   - Configure MongoDB network access
   - Configure Firebase authorized domains
   - Test everything end-to-end

---

**🚀 Good luck with deployment!**

