# Deployment Guide: Vultr VPS (Backend) + Vercel (Frontend)

## Architecture

```
Frontend (Vercel)
  ↓ API calls
Backend API (Vultr VPS - Express.js on port 3001)
  ↓
MongoDB Atlas
  ↓
Vultr Object Storage
```

---

## Part 1: Vultr VPS Backend Deployment

### Step 1: Create Vultr VPS Instance

1. Go to [Vultr Compute](https://my.vultr.com/products/compute/)
2. Click **"Deploy Server"** or **"Add Server"**
3. Configure:
   - **Server Type**: Cloud Compute
   - **CPU & Storage**: Regular Performance
   - **Plan**: $6/mo (1 vCPU, 1GB RAM) - Good for testing
   - **Location**: Choose closest to you (or same region as Object Storage: New Jersey/EWR)
   - **OS**: Ubuntu 22.04 LTS
   - **Server Hostname**: `flow-backend` (or your choice)
4. Click **"Deploy Now"**
5. **Save your IP address** and **root password** (or SSH key)

### Step 2: SSH into Server

```bash
ssh root@YOUR_SERVER_IP
```

Or if you set up SSH keys:
```bash
ssh -i ~/.ssh/your_key root@YOUR_SERVER_IP
```

### Step 3: Update System and Install Node.js

```bash
# Update system packages
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

### Step 4: Install Git and Clone Repository

```bash
# Install Git
apt install -y git

# Clone your repository
cd /root
git clone https://github.com/YOUR_USERNAME/flow.git
# OR if private repo: git clone https://github.com/YOUR_USERNAME/flow.git

cd flow
```

### Step 5: Install Dependencies

```bash
npm install
```

### Step 6: Set Up Environment Variables

```bash
# Create .env file
nano .env
```

Paste all your environment variables:

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/flow?retryWrites=true&w=majority

# Firebase Admin
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Vultr Object Storage
VULTR_STORAGE_HOSTNAME=ewr1.vultrobjects.com
VULTR_STORAGE_ACCESS_KEY=your_access_key
VULTR_STORAGE_SECRET_KEY=your_secret_key
VULTR_STORAGE_BUCKET=flow

# Server Port (optional, defaults to 3001)
PORT=3001

# Marble API (if needed)
VITE_MARBLE_API_KEY=your_marble_api_key
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### Step 7: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

### Step 8: Start Server with PM2

```bash
# Start the server
pm2 start server.js --name flow-backend

# Make PM2 start on boot
pm2 startup
# Follow the instructions it prints (copy/paste the command it gives you)

# Save PM2 process list
pm2 save

# Check status
pm2 status
pm2 logs flow-backend
```

### Step 9: Set Up Firewall

```bash
# Allow SSH (if not already allowed)
ufw allow 22/tcp

# Allow HTTP
ufw allow 80/tcp

# Allow HTTPS
ufw allow 443/tcp

# Allow your API port (3001)
ufw allow 3001/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

### Step 10: Install and Configure Nginx (Reverse Proxy)

```bash
# Install Nginx
apt install -y nginx

# Create Nginx config
nano /etc/nginx/sites-available/flow-backend
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;  # Or your domain name if you have one

    # Proxy API requests to Express
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
    }
}
```

Save and exit (`Ctrl+X`, `Y`, `Enter`).

```bash
# Enable the site
ln -s /etc/nginx/sites-available/flow-backend /etc/nginx/sites-enabled/

# Test Nginx config
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx
```

### Step 11: Test Backend

```bash
# Test locally on server
curl http://localhost:3001/api/health

# Test from your computer
curl http://YOUR_SERVER_IP/api/health
```

You should see a response like:
```json
{"status":"ok"}
```

### Step 12: Set Up SSL with Let's Encrypt (Optional but Recommended)

**If you have a domain name:**

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
certbot renew --dry-run
```

**If you don't have a domain name**, you can skip SSL for now (HTTP only).

---

## Part 2: Vercel Frontend Deployment

### Step 1: Prepare Frontend for Production

Make sure your frontend environment variables are ready:

```env
# .env.local (for Vercel)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_API_URL=http://YOUR_VULTR_SERVER_IP/api
```

**Important**: Replace `YOUR_VULTR_SERVER_IP` with your actual VPS IP address.

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (your account)
# - Link to existing project? N
# - Project name? flow (or your choice)
# - Directory? ./
# - Override settings? N
```

#### Option B: Using Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_API_URL` (your Vultr VPS URL: `http://YOUR_IP/api` or `https://yourdomain.com/api`)
6. Click **"Deploy"**

### Step 3: Update CORS on Backend (if needed)

If Vercel gives you a different domain, update CORS in `server.js`:

```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-vercel-app.vercel.app',
    'https://your-domain.com'
  ],
  credentials: true
}));
```

Or allow all origins (less secure, but easier for development):

```javascript
app.use(cors());
```

---

## Part 3: Update MongoDB Network Access

Make sure MongoDB Atlas allows connections from your VPS:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Go to **Network Access**
3. Add your VPS IP address, OR
4. Add `0.0.0.0/0` (allows all IPs - less secure but easier)

---

## Part 4: Test Full Stack

1. **Test Backend API**:
   ```bash
   curl http://YOUR_VPS_IP/api/health
   ```

2. **Test Frontend**:
   - Visit your Vercel URL
   - Try signing in with Google
   - Try creating a scene
   - Try saving to library

---

## Troubleshooting

### Backend Not Starting

```bash
# Check PM2 logs
pm2 logs flow-backend

# Check if port is in use
netstat -tulpn | grep 3001

# Restart PM2
pm2 restart flow-backend
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
pm2 status

# Check Nginx error logs
tail -f /var/log/nginx/error.log

# Test backend directly
curl http://localhost:3001/api/health
```

### MongoDB Connection Errors

- Check MongoDB Network Access (allow your VPS IP)
- Verify `MONGODB_URI` in `.env` is correct
- Check MongoDB Atlas logs

### CORS Errors

- Update CORS in `server.js` to allow your Vercel domain
- Check `VITE_API_URL` in Vercel environment variables

---

## Useful Commands

### PM2 Commands

```bash
pm2 status              # Check status
pm2 logs flow-backend   # View logs
pm2 restart flow-backend # Restart
pm2 stop flow-backend   # Stop
pm2 delete flow-backend # Delete
pm2 monit               # Monitor
```

### Nginx Commands

```bash
nginx -t                # Test config
systemctl restart nginx # Restart
systemctl status nginx  # Status
tail -f /var/log/nginx/access.log  # Access logs
tail -f /var/log/nginx/error.log   # Error logs
```

---

## Next Steps

- [ ] Set up domain name (optional)
- [ ] Set up SSL with Let's Encrypt
- [ ] Add rate limiting to API
- [ ] Set up monitoring (optional)
- [ ] Configure backups (optional)

---

## Cost Estimate

- **Vultr VPS**: $6/month (1 vCPU, 1GB RAM)
- **Vercel**: Free tier (generous limits)
- **MongoDB Atlas**: Free tier (512MB)
- **Vultr Object Storage**: Pay-as-you-go (~$0.01/GB/month)
- **Firebase**: Free tier (generous limits)

**Total**: ~$6/month + storage costs (minimal for development)

