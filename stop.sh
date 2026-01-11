#!/bin/bash

# Stop script for Flow application
# Stops both frontend and backend servers

set -e

echo "🛑 Stopping Flow application..."
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to kill process by PID file
kill_by_pid_file() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}🔄 Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 1
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}⚠️  Force killing $service_name...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            echo -e "${GREEN}✅ $service_name stopped${NC}"
            rm -f "$pid_file"
        else
            echo -e "${YELLOW}⚠️  $service_name not running (PID file exists but process not found)${NC}"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}⚠️  $service_name not running (no PID file)${NC}"
    fi
}

# Also try to kill by port (fallback)
kill_by_port() {
    local port=$1
    local service_name=$2
    
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}🔄 Stopping $service_name on port $port (PID: $pid)...${NC}"
        kill "$pid" 2>/dev/null || true
        sleep 1
        
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${RED}⚠️  Force killing $service_name...${NC}"
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✅ $service_name stopped${NC}"
    fi
}

# Stop backend
kill_by_pid_file ".backend.pid" "Backend"
kill_by_port 3001 "Backend (port 3001)"

# Stop frontend
kill_by_pid_file ".frontend.pid" "Frontend"
kill_by_port 5173 "Frontend (port 5173)"

echo ""
echo "✅ Flow application stopped!"
echo ""

