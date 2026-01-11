# Flow - Voice-Guided 3D Explorer

A voice-guided 3D environment explorer using Gaussian Splatting, AI-generated scenes, and immersive interactions.

## 🏗️ Project Structure

```
flow/
├── frontend/          # React + Vite frontend
│   ├── src/          # React components and pages
│   ├── public/       # Static assets
│   ├── package.json  # Frontend dependencies
│   └── vite.config.ts
│
├── backend/          # Express.js backend API
│   ├── server.js     # Main server file
│   ├── server/       # Backend libraries
│   │   └── lib/      # MongoDB, Auth, Storage utilities
│   └── package.json  # Backend dependencies
│
├── start.sh          # Start both servers
├── stop.sh           # Stop both servers
├── .env              # Environment variables (create from .env.example)
└── README.md         # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20.x or later
- npm or yarn
- MongoDB Atlas account
- Firebase account
- Vultr account (for Object Storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd flow
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Install dependencies**
   ```bash
   # Backend dependencies
   cd backend
   npm install
   cd ..
   
   # Frontend dependencies
   cd frontend
   npm install
   cd ..
   ```

### Running the Application

**Option 1: Using start/stop scripts (Recommended)**

```bash
# Start both servers
./start.sh

# Stop both servers
./stop.sh
```

**Option 2: Manual start**

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

## 📦 Environment Variables

Create a `.env` file in the root directory with:

```env
# Firebase (Client-side)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id

# Firebase Admin (Server-side)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/flow

# Vultr Object Storage
VULTR_STORAGE_HOSTNAME=ewr1.vultrobjects.com
VULTR_STORAGE_ACCESS_KEY=your_access_key
VULTR_STORAGE_SECRET_KEY=your_secret_key
VULTR_STORAGE_BUCKET=flow

# API URL (defaults to http://localhost:3001)
VITE_API_URL=http://localhost:3001

# Server Port (defaults to 3001)
PORT=3001
```

## 🛠️ Development

### Frontend Development

```bash
cd frontend
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run linter
```

### Backend Development

```bash
cd backend
npm run dev      # Start dev server
```

## 📚 API Endpoints

- `GET /health` - Health check
- `POST /api/auth/verify` - Verify Firebase token and create/update user
- `GET /api/auth/me` - Get current user profile
- `GET /api/scenes` - List public scenes
- `POST /api/scenes` - Create new scene
- `GET /api/scenes/:id` - Get scene by ID
- `DELETE /api/scenes/:id` - Delete scene (authenticated)
- `GET /api/users/:id/scenes` - Get user's scenes

## 🚀 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions:

- **Backend**: Deploy to Vultr VPS
- **Frontend**: Deploy to Vercel

## 📖 Documentation

- [LIBRARY_SETUP.md](./LIBRARY_SETUP.md) - Library setup guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [PROXY_SETUP.md](./PROXY_SETUP.md) - Proxy server setup

## 🛑 Troubleshooting

### Ports Already in Use

```bash
# Stop all servers
./stop.sh

# Or manually kill processes
lsof -ti:3001 | xargs kill -9  # Backend
lsof -ti:5173 | xargs kill -9  # Frontend
```

### Dependencies Issues

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Logs

Check logs in the `logs/` directory:
```bash
tail -f logs/backend.log
tail -f logs/frontend.log
```

## 📝 License

MIT
