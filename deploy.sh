#!/bin/bash
# Orchids AI Chat - VPS Deployment Script

set -e

VPS_IP="72.62.244.137"
APP_DIR="/var/www/orchids-ai"

echo "🚀 Starting deployment to $VPS_IP..."

# 1. Create app directory if not exists
ssh root@$VPS_IP "mkdir -p $APP_DIR"

# 2. Sync files (excluding node_modules and .git)
echo "📦 Syncing files..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.next' ./ root@$VPS_IP:$APP_DIR/

# 3. Sync build folder separately
echo "🏗️  Syncing build folder..."
rsync -avz .next/ root@$VPS_IP:$APP_DIR/.next/

# 4. Install production dependencies and restart app
echo "⚙️  Running remote commands..."
ssh root@$VPS_IP << EOF
    cd $APP_DIR
    npm install --production
    pm2 delete orchids-ai || true
    pm2 start npm --name "orchids-ai" -- start
    pm2 save
EOF

echo "✅ Deployment complete!"
