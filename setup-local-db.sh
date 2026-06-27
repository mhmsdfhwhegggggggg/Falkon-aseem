#!/bin/bash
# ================================================================
# FALKON PRO — Install Local PostgreSQL on Hetzner
# Run ONCE after deploy.sh, if you prefer local DB over Neon
# Run: bash /opt/falkon/setup-local-db.sh
# ================================================================

set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${BLUE}[DB Setup]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

log "=== Installing PostgreSQL 17 locally on Hetzner ==="

# Install PostgreSQL 17
log "Installing PostgreSQL 17..."
apt-get install -y -qq postgresql-17 postgresql-contrib-17
systemctl enable postgresql && systemctl start postgresql
ok "PostgreSQL 17 installed and running"

# Create falkon database and user
log "Creating falkon database..."
DB_PASS=$(tr -dc 'A-Za-z0-9!@#%^&*' < /dev/urandom | head -c 32)

sudo -u postgres psql << SQL
CREATE USER falkon WITH PASSWORD '${DB_PASS}';
CREATE DATABASE falkondb OWNER falkon;
GRANT ALL PRIVILEGES ON DATABASE falkondb TO falkon;
\c falkondb
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
GRANT ALL ON SCHEMA public TO falkon;
SQL

ok "Database 'falkondb' created with user 'falkon'"

# Configure PostgreSQL for performance
log "Tuning PostgreSQL for production..."
PG_CONF="/etc/postgresql/17/main/postgresql.conf"

# Performance settings for CX42 (16GB RAM)
cat >> ${PG_CONF} << PGCONF

# === Falkon Pro Tuning ===
shared_buffers = 4GB              # 25% of RAM
effective_cache_size = 12GB       # 75% of RAM
work_mem = 64MB                   # per-query
maintenance_work_mem = 1GB
max_connections = 200             # pool handles the rest
wal_compression = on
log_min_duration_statement = 1000 # log slow queries > 1s
PGCONF

# Allow local connections
PG_HBA="/etc/postgresql/17/main/pg_hba.conf"
echo "host falkondb falkon 127.0.0.1/32 md5" >> ${PG_HBA}

systemctl restart postgresql
ok "PostgreSQL tuned for CX42 (16GB RAM)"

# Update .env with local DATABASE_URL
ENV_FILE="/opt/falkon/artifacts/api-server/.env"
LOCAL_URL="postgresql://falkon:${DB_PASS}@localhost:5432/falkondb"

if [ -f "${ENV_FILE}" ]; then
  # Replace existing DATABASE_URL
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=${LOCAL_URL}|g" "${ENV_FILE}"
  ok ".env updated with local DATABASE_URL"
else
  echo "DATABASE_URL=${LOCAL_URL}" >> "${ENV_FILE}"
fi

# Save credentials
cat > /root/falkon-db-credentials.txt << CREDS
=== Falkon Pro — Local Database Credentials ===
Host:     localhost
Port:     5432
Database: falkondb
User:     falkon
Password: ${DB_PASS}
URL:      ${LOCAL_URL}
========================================
CREDS
chmod 600 /root/falkon-db-credentials.txt

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  Local PostgreSQL Ready!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "  DATABASE_URL has been set in .env automatically"
echo -e "  Credentials saved: ${YELLOW}cat /root/falkon-db-credentials.txt${NC}"
echo ""
echo -e "  Restart Falkon: ${BLUE}pm2 restart falkon-api${NC}"
echo -e "  Connect to DB:  ${BLUE}sudo -u postgres psql -d falkondb${NC}"
echo ""
echo -e "  ${YELLOW}Backup daily: add this to cron:${NC}"
echo -e "  ${BLUE}0 2 * * * pg_dump -U falkon falkondb > /opt/falkon-backup/\$(date +%Y%m%d).sql${NC}"
echo ""
warn "Keep /root/falkon-db-credentials.txt SECRET!"
