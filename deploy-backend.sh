#!/bin/bash

# Backend Deployment Script for Vultr VPS
# Run this script from your local machine

SERVER_IP="149.28.52.229"
SERVER_USER="root"

echo "🚀 Deploying backend to Vultr VPS ($SERVER_IP)"
echo ""

# Check if SSH key exists or prompt for password
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'ENDSSH'

echo "✅ Connected to Vultr VPS"
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install Git
echo "📦 Installing Git..."
apt install -y git

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /root/flow
cd /root/flow

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository or copy files"
echo "2. Set up .env file"
echo "3. Install dependencies"
echo "4. Start with PM2"

ENDSSH

