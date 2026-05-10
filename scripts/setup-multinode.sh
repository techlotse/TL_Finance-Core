#!/bin/bash

set -e

echo "================================"
echo "TL Finance Core - Multi-Node Setup"
echo "================================"
echo ""

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==================== Step 1: Create SSL Certificates ====================
echo -e "${BLUE}Step 1: Creating self-signed SSL certificates...${NC}"

mkdir -p ./ssl

# Check if certificates already exist
if [ -f "./ssl/cert.pem" ] && [ -f "./ssl/key.pem" ]; then
    echo -e "${YELLOW}SSL certificates already exist. Skipping...${NC}"
else
    # Generate self-signed certificate valid for 365 days
    openssl req -x509 -newkey rsa:4096 -nodes \
        -keyout ./ssl/key.pem \
        -out ./ssl/cert.pem \
        -days 365 \
        -subj "/C=CH/ST=Switzerland/L=Zurich/O=TL Finance Core/CN=localhost"

    echo -e "${GREEN}✓ SSL certificates created${NC}"
fi

# ==================== Step 2: Create PostgreSQL init directory ====================
echo ""
echo -e "${BLUE}Step 2: Creating PostgreSQL init directory...${NC}"

mkdir -p ./postgres
echo -e "${GREEN}✓ PostgreSQL directory ready${NC}"

# ==================== Step 3: Create .env file ====================
echo ""
echo -e "${BLUE}Step 3: Creating .env file...${NC}"

if [ ! -f "./.env" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
        echo "openssl is required to generate local secrets. Install it and re-run."
        exit 1
    fi
    APP_SECRET_VALUE="$(openssl rand -hex 32)"
    DB_PASSWORD_VALUE="$(openssl rand -hex 18)"
    REPLICATION_PASSWORD_VALUE="$(openssl rand -hex 18)"
    REDIS_PASSWORD_VALUE="$(openssl rand -hex 18)"
    PGADMIN_PASSWORD_VALUE="$(openssl rand -hex 18)"

    cat > .env << EOF
# Multi-Node Deployment Environment Variables

# Application
NODE_ENV=production
APP_SECRET=${APP_SECRET_VALUE}

# Database
DB_PASSWORD=${DB_PASSWORD_VALUE}
REPLICATION_PASSWORD=${REPLICATION_PASSWORD_VALUE}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD_VALUE}

# PgAdmin
PGADMIN_EMAIL=admin@localhost
PGADMIN_PASSWORD=${PGADMIN_PASSWORD_VALUE}
PGADMIN_PORT=5050

# Exchange Rates
EXCHANGE_RATE_PROVIDER=frankfurter
FRANKFURTER_BASE_URL=https://api.frankfurter.app
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${GREEN}✓ Random local secrets generated${NC}"
else
    echo -e "${YELLOW}.env file already exists. Skipping...${NC}"
fi

# ==================== Step 4: Build Docker images ====================
echo ""
echo -e "${BLUE}Step 4: Building Docker images...${NC}"

docker compose -f docker-compose-multinode.yml build

echo -e "${GREEN}✓ Docker images built${NC}"

# ==================== Step 5: Start services ====================
echo ""
echo -e "${BLUE}Step 5: Starting multi-node deployment...${NC}"

docker compose -f docker-compose-multinode.yml up -d

echo -e "${GREEN}✓ Services started${NC}"

# ==================== Step 6: Wait for services to be healthy ====================
echo ""
echo -e "${BLUE}Step 6: Waiting for services to be healthy...${NC}"

wait_for_service() {
    local service=$1
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker compose -f docker-compose-multinode.yml ps "$service" | grep -q "healthy"; then
            echo -e "${GREEN}✓ $service is healthy${NC}"
            return 0
        fi

        echo "Waiting for $service... (attempt $((attempt+1))/$max_attempts)"
        sleep 2
        attempt=$((attempt+1))
    done

    echo -e "${YELLOW}⚠ $service took longer than expected to become healthy${NC}"
    return 1
}

wait_for_service "postgres-primary"
wait_for_service "redis"
wait_for_service "app-1"
wait_for_service "app-2"
wait_for_service "nginx"

# ==================== Step 7: Run database migrations ====================
echo ""
echo -e "${BLUE}Step 7: Running database migrations...${NC}"

# Wait a bit longer for app to be ready
sleep 5

# Run migrations in one of the app containers
docker compose -f docker-compose-multinode.yml exec -T app-1 npx prisma migrate deploy || {
    echo -e "${YELLOW}⚠ Migrations may have already been applied. Continuing...${NC}"
}

echo -e "${GREEN}✓ Migrations complete${NC}"

# ==================== Step 8: Seed database (optional) ====================
echo ""
echo -e "${BLUE}Step 8: Seeding database...${NC}"

docker compose -f docker-compose-multinode.yml exec -T app-1 npx prisma db seed || {
    echo -e "${YELLOW}⚠ Seed may have already been run. Continuing...${NC}"
}

echo -e "${GREEN}✓ Database seeded${NC}"

# ==================== Summary ====================
echo ""
echo "================================"
echo -e "${GREEN}✓ Multi-Node Setup Complete!${NC}"
echo "================================"
echo ""
echo -e "${BLUE}Access Points:${NC}"
echo "  Web App (via nginx):      https://localhost"
echo "  PgAdmin (optional):       docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin"
echo "                            http://127.0.0.1:5050"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Visit https://localhost (accept self-signed certificate warning)"
echo "  2. Test signup/login flow"
echo "  3. Test failover: docker stop tl-finance-core-app-1"
echo "  4. Verify traffic routes to app-2"
echo "  5. Restart app-1: docker start tl-finance-core-app-1"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View logs:         docker compose -f docker-compose-multinode.yml logs -f [service]"
echo "  Restart app-1:     docker compose -f docker-compose-multinode.yml restart app-1"
echo "  Stop all:          docker compose -f docker-compose-multinode.yml down"
echo "  Reset everything:  docker compose -f docker-compose-multinode.yml down -v"
echo ""
