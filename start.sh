#!/bin/bash

# Start script for Flow application
# Starts both frontend and backend servers

set -e

echo "🚀 Starting Flow application..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found in root directory"
    echo "   Make sure to create .env with all required variables"
    echo ""
fi

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check if ports are already in use
if check_port 3001; then
    echo "⚠️  Port 3001 is already in use (backend)"
    echo "   Stop the existing server or use stop.sh first"
    exit 1
fi

if check_port 5173; then
    echo "⚠️  Port 5173 is already in use (frontend)"
    echo "   Stop the existing server or use stop.sh first"
    exit 1
fi

# Install dependencies if node_modules don't exist
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend
    npm install
    cd ..
    echo ""
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
    echo ""
fi

# Create logs directory
mkdir -p logs

# Start backend server
echo -e "${BLUE}🔧 Starting backend server (port 3001)...${NC}"
cd backend
NODE_ENV=development npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a bit for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Backend failed to start. Check logs/backend.log for errors"
    exit 1
fi

echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"

# Start frontend server
echo -e "${BLUE}🎨 Starting frontend server (port 5173)...${NC}"
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a bit for frontend to start
sleep 2

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "❌ Frontend failed to start. Check logs/frontend.log for errors"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
echo ""

# Save PIDs to file
echo $BACKEND_PID > .backend.pid
echo $FRONTEND_PID > .frontend.pid

echo "✅ Flow application started successfully!"
echo ""
echo "📡 Backend API: http://localhost:3001"
echo "🎨 Frontend: http://localhost:5173"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"
echo ""
echo "🛑 To stop: ./stop.sh"
echo ""

