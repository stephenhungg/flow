#!/bin/bash

# Stop script for Flow application
# Stops both frontend and backend servers

set -e

echo "🛑 Stopping Flow application..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop backend if PID file exists
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${YELLOW}🔧 Stopping backend server (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        sleep 1
        
        # Force kill if still running
        if kill -0 $BACKEND_PID 2>/dev/null; then
            echo -e "${RED}⚠️  Force killing backend...${NC}"
            kill -9 $BACKEND_PID 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✅ Backend stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend PID file exists but process not running${NC}"
    fi
    rm -f .backend.pid
else
    echo -e "${YELLOW}⚠️  No backend PID file found${NC}"
    # Try to kill by port as fallback
    if lsof -ti:3001 >/dev/null 2>&1; then
        echo -e "${YELLOW}🔧 Killing process on port 3001...${NC}"
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ Process on port 3001 stopped${NC}"
    fi
fi

# Stop frontend if PID file exists
if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${YELLOW}🎨 Stopping frontend server (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID 2>/dev/null || true
        sleep 1
        
        # Force kill if still running
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            echo -e "${RED}⚠️  Force killing frontend...${NC}"
            kill -9 $FRONTEND_PID 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✅ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  Frontend PID file exists but process not running${NC}"
    fi
    rm -f .frontend.pid
else
    echo -e "${YELLOW}⚠️  No frontend PID file found${NC}"
    # Try to kill by port as fallback
    if lsof -ti:5173 >/dev/null 2>&1; then
        echo -e "${YELLOW}🎨 Killing process on port 5173...${NC}"
        lsof -ti:5173 | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ Process on port 5173 stopped${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ Flow application stopped${NC}"
echo ""

