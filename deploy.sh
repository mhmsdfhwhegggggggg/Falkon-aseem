#!/bin/bash
# ================================================================
# FALKON PRO — Production Deployment Script
# Server: Hetzner CX42 / Ubuntu 24.04
# Run: curl -fsSL https://raw.githubusercontent.com/mhmsdfhwhegggggggg/Falkon-aseem/main/deploy.sh | bash
# ================================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[Falkon]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

log "=== Falkon Pro Production Setup ==="
log "Server: $(hostname) | Date: $(date)"

# ─── 1. System update ─────────────────────────────────────────────────────────
log "Updating system..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl git nginx ufw htop unzip
ok "System updated"

# ─── 2. Install Node.js 24 ────────────────────────────────────────────────────
log "Installing Node.js 24..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) installed"

# ─── 3. Install pnpm ──────────────────────────────────────────────────────────
log "Installing pnpm..."
npm install -g pnpm@latest --quiet
ok "pnpm $(pnpm -v) installed"

# ─── 4. Install PM2 ───────────────────────────────────────────────────────────
log "Installing PM2..."
npm install -g pm2 --quiet
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
ok "PM2 installed"

# ─── 5. Clone/Update repository ───────────────────────────────────────────────
log "Setting up Falkon repository..."
mkdir -p /opt/falkon
if [ -d "/opt/falkon/.git" ]; then
  cd /opt/falkon && git pull origin main
  ok "Repository updated"
else
  git clone https://github.com/mhmsdfhwhegggggggg/Falkon-aseem.git /opt/falkon
  ok "Repository cloned"
fi

# ─── 6. Install dependencies ──────────────────────────────────────────────────
log "Installing dependencies..."
cd /opt/falkon
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ─── 7. Create .env file if not exists ───────────────────────────────────────
if [ ! -f "/opt/falkon/artifacts/api-server/.env" ]; then
  log "Creating .env template..."
  cat > /opt/falkon/artifacts/api-server/.env << 'ENV_EOF'
# ================================================================
# FALKON PRO — Environment Variables
# Edit this file: nano /opt/falkon/artifacts/api-server/.env
# ================================================================

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
TELEGRAM_API_ID=YOUR_API_ID_FROM_MY_TELEGRAM_ORG
TELEGRAM_API_HASH=YOUR_API_HASH_FROM_MY_TELEGRAM_ORG
PORT=3000
NODE_ENV=production
ADMIN_SECRET_KEY=CHANGE_THIS_TO_A_STRONG_SECRET_KEY
ENV_EOF
  warn "Created .env template — EDIT IT before starting: nano /opt/falkon/artifacts/api-server/.env"
else
  ok ".env file already exists"
fi

# ─── 8. Build the application ─────────────────────────────────────────────────
log "Building Falkon API server..."
cd /opt/falkon/artifacts/api-server
pnpm run build
ok "Build complete"

# ─── 9. Create PM2 ecosystem file ─────────────────────────────────────────────
log "Creating PM2 config..."
cat > /opt/falkon/ecosystem.config.js << 'PM2_EOF'
module.exports = {
  apps: [{
    name:         "falkon-api",
    script:       "/opt/falkon/artifacts/api-server/dist/index.mjs",
    cwd:          "/opt/falkon/artifacts/api-server",
    instances:    1,
    exec_mode:    "fork",
    watch:        false,
    max_memory_restart: "12G",
    env_file:     "/opt/falkon/artifacts/api-server/.env",
    error_file:   "/var/log/falkon/error.log",
    out_file:     "/var/log/falkon/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    restart_delay: 3000,
    max_restarts:  10,
    autorestart:   true,
    // Graceful shutdown — wait for in-flight Telegram ops
    kill_timeout:  10000,
    listen_timeout: 8000,
  }]
};
PM2_EOF
mkdir -p /var/log/falkon
ok "PM2 ecosystem configured"

# ─── 10. Configure Nginx ──────────────────────────────────────────────────────
log "Configuring Nginx..."
cat > /etc/nginx/sites-available/falkon << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    # Increase timeouts for long-running Telegram operations
    proxy_connect_timeout   60s;
    proxy_send_timeout      300s;
    proxy_read_timeout      300s;

    # Large body for member lists
    client_max_body_size    50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
NGINX_EOF
ln -sf /etc/nginx/sites-available/falkon /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx
ok "Nginx configured"

# ─── 11. Firewall setup ───────────────────────────────────────────────────────
log "Configuring firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (API)
ufw allow 443/tcp  # HTTPS (future)
ufw --force enable
ok "Firewall configured (22, 80, 443)"

# ─── 12. Setup auto-update cron ──────────────────────────────────────────────
log "Setting up auto-update..."
cat > /opt/falkon/update.sh << 'UPDATE_EOF'
#!/bin/bash
cd /opt/falkon
git pull origin main 2>/dev/null
pnpm install --frozen-lockfile 2>/dev/null || true
cd artifacts/api-server && pnpm run build 2>/dev/null || true
pm2 reload falkon-api --update-env 2>/dev/null || true
echo "[$(date)] Update done" >> /var/log/falkon/update.log
UPDATE_EOF
chmod +x /opt/falkon/update.sh
# Auto-update every day at 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/falkon/update.sh") | crontab -
ok "Auto-update scheduled (3 AM daily)"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  Falkon Pro — Setup Complete!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "  ${YELLOW}NEXT STEPS:${NC}"
echo -e "  1. Edit .env:  ${BLUE}nano /opt/falkon/artifacts/api-server/.env${NC}"
echo -e "  2. Start:      ${BLUE}pm2 start /opt/falkon/ecosystem.config.js${NC}"
echo -e "  3. Save PM2:   ${BLUE}pm2 save${NC}"
echo -e "  4. Test:       ${BLUE}curl http://$(hostname -I | awk '{print $1}')/health${NC}"
echo ""
echo -e "  ${YELLOW}Useful commands:${NC}"
echo -e "  Logs:    pm2 logs falkon-api"
echo -e "  Status:  pm2 status"
echo -e "  Restart: pm2 restart falkon-api"
echo -e "  Update:  /opt/falkon/update.sh"
echo ""
