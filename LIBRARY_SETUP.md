# 3D Library Setup Guide

Follow these steps to set up your 3D environment library system.

## Prerequisites

- Vultr account
- Firebase account (free tier)
- MongoDB Atlas account (free tier)

---

## Step 1: Firebase Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project"
   - Enter project name: `flow` (or your choice)
   - Follow the setup wizard (disable Google Analytics if you want)

2. **Enable Google Authentication**
   - In Firebase Console, go to **Authentication** → **Sign-in method**
   - Click on **Google**
   - Toggle **Enable**
   - Set support email (your email)
   - Click **Save**

3. **Get Firebase Config**
   - Go to **Project Settings** (gear icon)
   - Scroll down to "Your apps"
   - Click **Web** icon (`</>`)
   - Register app with nickname (e.g., "flow-web")
   - Copy the config values:
     - `apiKey`
     - `authDomain`
     - `projectId`

4. **Get Firebase Admin Service Account**
   - Still in Project Settings
   - Go to **Service accounts** tab
   - Click **Generate new private key**
   - Save the JSON file securely (you'll need this for server)
   - **DO NOT commit this file to git!**

---

## Step 2: MongoDB Atlas Setup

1. **Create MongoDB Atlas Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up (free tier available)

2. **Create Cluster**
   - Click **Build a Database**
   - Choose **FREE** (M0) tier
   - Select a cloud provider and region (closest to your Vultr server)
   - Click **Create**

3. **Configure Database Access**
   - Go to **Database Access** → **Add New Database User**
   - Username: `flow` (or your choice)
   - Password: Generate secure password (save it!)
   - Database User Privileges: **Read and write to any database**
   - Click **Add User**

4. **Configure Network Access**
   - Go to **Network Access** → **Add IP Address**
   - Click **Allow Access from Anywhere** (for development)
   - Or add your Vultr VPS IP address (for production)
   - Click **Confirm**

5. **Get Connection String**
   - Go to **Database** → **Connect**
   - Choose **Connect your application**
   - Copy the connection string (looks like: `mongodb+srv://<username>:<password>@cluster.mongodb.net/`)
   - Replace `<username>` and `<password>` with your database user credentials
   - Append database name: `mongodb+srv://user:pass@cluster.mongodb.net/flow`

---

## Step 3: Vultr Object Storage Setup

1. **Create Object Storage Bucket**
   - Log into [Vultr Control Panel](https://my.vultr.com/)
   - Go to **Object Storage** → **Create Bucket**
   - Bucket name: `flow-splats` (or your choice)
   - Region: Choose closest to your users
   - Click **Create Bucket**

2. **Get Access Keys**
   - Go to **Object Storage** → **Access Keys**
   - Click **Add Access Key**
   - Name: `flow-storage`
   - Click **Create Access Key**
   - **SAVE THESE VALUES** (shown only once):
     - Access Key
     - Secret Key
     - Hostname (e.g., `ewr1.vultrobjects.com`)

3. **Configure Bucket Permissions**
   - Go to your bucket → **Settings**
   - Enable **Public Access** (so files can be downloaded directly)
   - Or keep private and use signed URLs (more secure)

---

## Step 4: Environment Variables

Create a `.env` file in the project root:

```env
# Firebase (Client-side - VITE_ prefix required)
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id

# API URL (optional - defaults to http://localhost:3001)
VITE_API_URL=http://localhost:3001

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/flow

# Vultr Object Storage
VULTR_STORAGE_HOSTNAME=ewr1.vultrobjects.com
VULTR_STORAGE_ACCESS_KEY=your_access_key
VULTR_STORAGE_SECRET_KEY=your_secret_key
VULTR_STORAGE_BUCKET=flow-splats

# Firebase Admin (Service Account JSON as string)
# Option 1: Store as environment variable (JSON string)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your_project_id",...}

# Option 2: Store as file (recommended for production)
# Place serviceAccountKey.json in server/ directory
# Update server/lib/auth.js to read from file instead

# Firebase Project ID (for Admin SDK)
FIREBASE_PROJECT_ID=your_project_id
```

**Important**: Add `.env` to `.gitignore` if not already there!

---

## Step 5: Firebase Admin Setup (Choose One Method)

### Method 1: Environment Variable (Simple)

Convert your service account JSON to a single-line string:

```bash
# On Mac/Linux
cat path/to/serviceAccountKey.json | tr -d '\n' | tr -d ' ' > serviceAccountKey.txt

# Then copy the contents to FIREBASE_SERVICE_ACCOUNT in .env
```

### Method 2: File-based (Recommended for Production)

1. Create `server/serviceAccountKey.json`
2. Paste your Firebase service account JSON
3. Update `server/lib/auth.js`:

```javascript
// Replace the serviceAccountJson section with:
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
```

**Remember**: Add `server/serviceAccountKey.json` to `.gitignore`!

---

## Step 6: Test Locally

1. **Start the backend server**:
   ```bash
   npm run server
   ```

2. **Start the frontend** (in another terminal):
   ```bash
   npm run dev
   ```

3. **Test the flow**:
   - Open http://localhost:5173 (or the port Vite shows)
   - Click "library" button (should navigate to library page)
   - Click "sign in with google" (should open Google sign-in)
   - After signing in, create a scene by:
     - Going to landing page
     - Submitting a search query
     - Once scene loads, click "save to library"
     - Fill out the form and save
   - Go back to library - your scene should appear!

---

## Step 7: Common Issues & Fixes

### Firebase Authentication Not Working
- Check that `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` are set
- Verify Google sign-in is enabled in Firebase Console
- Check browser console for errors

### MongoDB Connection Errors
- Verify `MONGODB_URI` has correct username/password
- Check Network Access allows your IP
- Make sure connection string includes `/flow` database name

### Vultr Storage Upload Errors
- Verify all storage credentials are correct
- Check bucket name matches `VULTR_STORAGE_BUCKET`
- Ensure hostname format: `region.vultrobjects.com`

### Firebase Admin Token Verification Fails
- Make sure `FIREBASE_SERVICE_ACCOUNT` JSON is valid (no line breaks if using env var)
- Verify service account has proper permissions
- Check server logs for detailed error messages

---

## Step 8: Production Deployment (Vultr VPS)

1. **Set up Vultr VPS**
   - Create a Cloud Compute instance (Ubuntu 22.04)
   - Recommended: $6/mo (1 vCPU, 1GB RAM)

2. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone and Deploy**:
   ```bash
   git clone your-repo-url
   cd flow
   npm install
   npm run build
   ```

4. **Set Environment Variables**:
   ```bash
   # Create .env file on server
   nano .env
   # Paste all environment variables
   ```

5. **Run with PM2** (recommended):
   ```bash
   npm install -g pm2
   pm2 start server.js --name flow-server
   pm2 startup  # Run this and follow instructions
   pm2 save
   ```

6. **Serve Frontend**:
   - Option 1: Use PM2 to serve built files with express static
   - Option 2: Use Nginx to serve static files and proxy API

7. **Set up Nginx** (optional but recommended):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Serve static files
       location / {
           root /path/to/flow/dist;
           try_files $uri $uri/ /index.html;
       }

       # Proxy API requests
       location /api {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

8. **Set up SSL with Let's Encrypt**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## Next Steps

- ✅ Test all functionality locally
- ✅ Set up production environment variables
- ✅ Deploy to Vultr VPS
- ✅ Configure domain name and SSL
- ✅ Set up monitoring (optional)
- ✅ Add rate limiting (recommended for public API)

---

## Notes

- Keep all credentials secure - never commit `.env` or service account keys
- Use environment-specific configs for dev/prod
- Consider adding rate limiting to prevent abuse
- Monitor storage usage - Vultr Object Storage has usage-based pricing
- MongoDB Atlas free tier has 512MB storage limit

