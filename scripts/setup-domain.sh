#!/usr/bin/env bash
# Puts the app behind nginx with free HTTPS (Let's Encrypt).
#   orchidchat.magickamimosa.com -> Next.js app   (localhost:3000)
#   orchidapi.magickamimosa.com  -> FastAPI server (localhost:8000)
#
# Usage (as root on the server, after the DNS A records point to it):
#   bash <(curl -fsSL https://raw.githubusercontent.com/lucasdmarshall/orchidsai/master/scripts/setup-domain.sh)
set -e

CHAT_DOMAIN="orchidchat.magickamimosa.com"
API_DOMAIN="orchidapi.magickamimosa.com"

echo "==> Installing nginx and certbot"
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx dnsutils

write_site() {
  local domain="$1" port="$2"
  cat > "/etc/nginx/sites-available/$domain" <<NGINX
server {
    listen 80;
    server_name $domain;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        # Chat replies are streamed; don't buffer them.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/$domain" "/etc/nginx/sites-enabled/$domain"
}

echo "==> Writing nginx config"
write_site "$CHAT_DOMAIN" 3000
write_site "$API_DOMAIN" 8000
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 'Nginx Full'
fi

echo "==> Getting HTTPS certificates"
SERVER_IP=$(curl -fsS https://api.ipify.org)
CERT_DOMAINS=()
for d in "$CHAT_DOMAIN" "$API_DOMAIN"; do
  if dig +short A "$d" | grep -qx "$SERVER_IP"; then
    CERT_DOMAINS+=("-d" "$d")
  else
    echo "!! $d does not point to $SERVER_IP yet - skipping HTTPS for it."
    echo "   Fix the DNS A record, wait a few minutes, then run this script again."
  fi
done
if [ ${#CERT_DOMAINS[@]} -gt 0 ]; then
  certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect "${CERT_DOMAINS[@]}"
fi

echo
echo "All done."
echo "  App: https://$CHAT_DOMAIN"
echo "  API: https://$API_DOMAIN  (needs the FastAPI server running on port 8000)"
