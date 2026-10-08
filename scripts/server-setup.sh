#!/usr/bin/env bash
# One-time server setup: installs the app, then checks GitHub every 2 minutes
# and rebuilds/restarts automatically when master has new commits.
#
# Usage (as root on the server):
#   SUPABASE_URL=... SUPABASE_KEY=... bash <(curl -fsSL https://raw.githubusercontent.com/lucasdmarshall/orchidsai/master/scripts/server-setup.sh)
set -e

REPO_URL="https://github.com/lucasdmarshall/orchidsai.git"
BRANCH="master"
APP_DIR="/var/www/orchids-ai"

echo "==> Installing system packages"
apt-get update -y
apt-get install -y curl git unzip
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
[ -x "$HOME/.bun/bin/bun" ] || curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
command -v pm2 >/dev/null || npm install -g pm2

echo "==> Getting the code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env.local ]; then
  echo "==> Writing .env.local"
  if [ -z "$SUPABASE_URL" ]; then read -rp "Supabase URL: " SUPABASE_URL < /dev/tty; fi
  if [ -z "$SUPABASE_KEY" ]; then read -rp "Supabase anon key: " SUPABASE_KEY < /dev/tty; fi
  if [ -z "$OPENROUTER_KEYS" ]; then read -rp "OpenRouter API key(s), comma-separated (Enter to skip): " OPENROUTER_KEYS < /dev/tty; fi
  {
    echo "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY"
    [ -n "$OPENROUTER_KEYS" ] && echo "OPENROUTER_API_KEYS=$OPENROUTER_KEYS"
  } > .env.local
fi

echo "==> Installing auto-deploy script"
cat > /usr/local/bin/orchids-autodeploy <<SCRIPT
#!/usr/bin/env bash
# Rebuild and restart when GitHub has new commits. Runs from cron.
set -e
export PATH="\$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
cd "$APP_DIR"
git fetch -q origin "$BRANCH"
if [ "\$1" != "--force" ] && [ "\$(git rev-parse HEAD)" = "\$(git rev-parse origin/$BRANCH)" ]; then
  exit 0
fi
echo "[\$(date)] deploying \$(git rev-parse --short origin/$BRANCH)"
git reset -q --hard "origin/$BRANCH"
bun install --frozen-lockfile || bun install
bun run build
pm2 reload orchids-ai 2>/dev/null || pm2 start "bun run start" --name orchids-ai
pm2 save
echo "[\$(date)] done"
SCRIPT
chmod +x /usr/local/bin/orchids-autodeploy

echo "==> First build (takes a few minutes)"
/usr/local/bin/orchids-autodeploy --force
pm2 startup systemd -u root --hp "$HOME" >/dev/null 2>&1 || true

echo "==> Scheduling GitHub check every 2 minutes"
CRON_LINE="*/2 * * * * flock -n /tmp/orchids-autodeploy.lock /usr/local/bin/orchids-autodeploy >> /var/log/orchids-autodeploy.log 2>&1"
( crontab -l 2>/dev/null | grep -v orchids-autodeploy; echo "$CRON_LINE" ) | crontab -

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 3000/tcp; fi

IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "All done. Open: http://$IP:3000"
echo "Auto-deploy log: tail -f /var/log/orchids-autodeploy.log"
