#!/bin/bash

# Flow Deployment Preparation Script
# This script helps prepare your codebase for deployment

echo "🚀 Flow Deployment Preparation"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
echo "📋 Checking environment files..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} Root .env file exists"
else
    echo -e "${RED}✗${NC} Root .env file NOT found (needed for backend)"
fi

if [ -f "frontend/.env" ]; then
    echo -e "${GREEN}✓${NC} Frontend .env file exists"
else
    echo -e "${YELLOW}⚠${NC} Frontend .env file NOT found (will be set in Vercel)"
fi

echo ""

# Check backend dependencies
echo "📦 Checking backend dependencies..."
if [ -d "backend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
else
    echo -e "${YELLOW}⚠${NC} Backend dependencies NOT installed"
    echo "   Run: cd backend && npm install"
fi

# Check frontend dependencies
echo "📦 Checking frontend dependencies..."
if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
else
    echo -e "${YELLOW}⚠${NC} Frontend dependencies NOT installed"
    echo "   Run: cd frontend && npm install"
fi

echo ""

# Check backend build
echo "🔨 Testing backend start..."
cd backend
if node -e "require('./server.js')" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Backend server.js is valid"
else
    echo -e "${YELLOW}⚠${NC} Backend server.js syntax check (may need .env to fully test)"
fi
cd ..

# Test frontend build
echo "🔨 Testing frontend build..."
cd frontend
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend builds successfully"
    if [ -d "dist" ]; then
        echo -e "${GREEN}✓${NC} dist/ directory created"
    fi
else
    echo -e "${RED}✗${NC} Frontend build failed"
    echo "   Run: cd frontend && npm run build"
fi
cd ..

echo ""
echo "📝 Next Steps:"
echo "1. Review DEPLOY_CHECKLIST.md for step-by-step instructions"
echo "2. Make sure all environment variables are set"
echo "3. Deploy backend to Vultr VPS first"
echo "4. Deploy frontend to Vercel second"
echo ""
echo "📖 Full guide: DEPLOY_CHECKLIST.md"
echo ""

