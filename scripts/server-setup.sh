#!/usr/bin/env bash
# One-time server setup. Installs Postgres, Rust, Node/bun and pm2, builds the
# Rust API (backend/) and the Next.js site, then checks GitHub every 2 minutes
# and rebuilds/restarts automatically when master has new commits.
# Safe to run again; it keeps existing passwords and keys.
#
# Usage (as root on the server):
#   bash <(curl -fsSL https://raw.githubusercontent.com/lucasdmarshall/orchidsai/master/scripts/server-setup.sh)
set -e

REPO_URL="https://github.com/lucasdmarshall/orchidsai.git"
BRANCH="master"
APP_DIR="/var/www/orchids-ai"
CHAT_URL="https://orchidchat.magickamimosa.com"
API_URL="https://orchidapi.magickamimosa.com"

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git unzip build-essential pkg-config postgresql

# Building Rust and Next.js needs more memory than small VPSes have.
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 4000 ]; then
  echo "==> Adding 4GB swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
[ -x "$HOME/.bun/bin/bun" ] || curl -fsSL https://bun.sh/install | bash
[ -x "$HOME/.cargo/bin/cargo" ] || curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
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

echo "==> Setting up the database"
systemctl enable --now postgresql
if [ ! -f backend/.env ]; then
  DB_PASSWORD=$(openssl rand -hex 24)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'orchid') THEN
    ALTER ROLE orchid WITH LOGIN PASSWORD '$DB_PASSWORD';
  ELSE
    CREATE ROLE orchid WITH LOGIN PASSWORD '$DB_PASSWORD';
  END IF;
END \$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'orchid'" | grep -q 1 \
    || sudo -u postgres createdb -O orchid orchid

  # Reuse the key from the old Next.js setup if there is one.
  OPENROUTER_KEYS=$(grep -s '^OPENROUTER_API_KEYS=' .env.local | cut -d= -f2- || true)
  if [ -z "$OPENROUTER_KEYS" ]; then
    read -rp "OpenRouter API key(s), comma-separated (Enter to skip): " OPENROUTER_KEYS < /dev/tty || true
  fi
  cat > backend/.env <<ENV
DATABASE_URL=postgres://orchid:$DB_PASSWORD@localhost/orchid
OPENROUTER_API_KEYS=$OPENROUTER_KEYS
HOST=127.0.0.1
PORT=8000
CORS_ORIGINS=$CHAT_URL
ENV
  chmod 600 backend/.env
fi

# The site only needs to know where the API is (baked in at build time).
echo "NEXT_PUBLIC_API_URL=$API_URL" > .env.local

echo "==> Installing auto-deploy script"
cat > /usr/local/bin/orchids-autodeploy <<SCRIPT
#!/usr/bin/env bash
# Rebuild and restart when GitHub has new commits. Runs from cron.
set -e
export PATH="\$HOME/.bun/bin:\$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
cd "$APP_DIR"
git fetch -q origin "$BRANCH"
if [ "\$1" != "--force" ] && [ "\$(git rev-parse HEAD)" = "\$(git rev-parse origin/$BRANCH)" ]; then
  exit 0
fi
echo "[\$(date)] deploying \$(git rev-parse --short origin/$BRANCH)"
git reset -q --hard "origin/$BRANCH"

cargo build --release --manifest-path backend/Cargo.toml
pm2 restart orchid-api 2>/dev/null \
  || pm2 start "$APP_DIR/backend/target/release/orchid-api" --name orchid-api --cwd "$APP_DIR/backend"

bun install --frozen-lockfile || bun install
bun run build
pm2 reload orchids-ai 2>/dev/null || pm2 start "bun run start" --name orchids-ai
pm2 save
echo "[\$(date)] done"
SCRIPT
chmod +x /usr/local/bin/orchids-autodeploy

echo "==> First build (takes 5-15 minutes)"
/usr/local/bin/orchids-autodeploy --force
pm2 startup systemd -u root --hp "$HOME" >/dev/null 2>&1 || true

echo "==> Scheduling GitHub check every 2 minutes"
CRON_LINE="*/2 * * * * flock -n /tmp/orchids-autodeploy.lock /usr/local/bin/orchids-autodeploy >> /var/log/orchids-autodeploy.log 2>&1"
( crontab -l 2>/dev/null | grep -v orchids-autodeploy; echo "$CRON_LINE" ) | crontab -

sleep 3
echo
if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then echo "API:  OK"; else echo "API:  NOT RUNNING - see: pm2 logs orchid-api"; fi
if curl -fsS -o /dev/null http://127.0.0.1:3000; then echo "Site: OK"; else echo "Site: NOT RUNNING - see: pm2 logs orchids-ai"; fi
echo
echo "Site: $CHAT_URL"
echo "API:  $API_URL/api/health"
echo "Auto-deploy log: tail -f /var/log/orchids-autodeploy.log"
