#!/bin/bash

# ============================================================================
# Courthouse Digital Signage System - Development Environment Setup
# ============================================================================
# This script sets up and runs the development environment for the
# Frank E. Moss U.S. Courthouse Digital Signage System.
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=3000
ADMIN_PORT=5173
DISPLAY_PORT=8080

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Courthouse Digital Signage System${NC}"
echo -e "${BLUE}  Development Environment Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check for Node.js
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js version 20+ required (found v$NODE_VERSION)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check for SQLite
if ! command -v sqlite3 &> /dev/null; then
    echo -e "${YELLOW}Warning: sqlite3 CLI not found (optional, used for debugging)${NC}"
else
    echo -e "${GREEN}✓ sqlite3 installed${NC}"
fi

echo ""

# Install backend dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
if [ -d "backend" ]; then
    cd backend
    npm install
    cd ..
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${YELLOW}Backend directory not found - will be created during project setup${NC}"
fi

# Install admin frontend dependencies
echo -e "${YELLOW}Installing admin portal dependencies...${NC}"
if [ -d "admin" ]; then
    cd admin
    npm install
    cd ..
    echo -e "${GREEN}✓ Admin portal dependencies installed${NC}"
else
    echo -e "${YELLOW}Admin directory not found - will be created during project setup${NC}"
fi

# Setup database
echo -e "${YELLOW}Setting up database...${NC}"
if [ -d "backend" ]; then
    cd backend

    # Generate Prisma client
    if [ -f "prisma/schema.prisma" ]; then
        npx prisma generate 2>/dev/null || true

        # Run migrations
        npx prisma migrate deploy 2>/dev/null || npx prisma db push 2>/dev/null || true

        # Seed database if seed script exists
        if [ -f "prisma/seed.ts" ] || [ -f "prisma/seed.js" ]; then
            npx prisma db seed 2>/dev/null || true
        fi

        echo -e "${GREEN}✓ Database setup complete${NC}"
    else
        echo -e "${YELLOW}Prisma schema not found - database setup skipped${NC}"
    fi

    cd ..
fi

echo ""
echo -e "${YELLOW}Starting services...${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"

    # Kill background processes
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$ADMIN_PID" ]; then
        kill $ADMIN_PID 2>/dev/null || true
    fi
    if [ ! -z "$DISPLAY_PID" ]; then
        kill $DISPLAY_PID 2>/dev/null || true
    fi

    echo -e "${GREEN}Services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend server
if [ -d "backend" ] && [ -f "backend/package.json" ]; then
    echo -e "${BLUE}Starting backend server on port $BACKEND_PORT...${NC}"
    cd backend
    npm run dev &
    BACKEND_PID=$!
    cd ..
    sleep 3

    # Check if backend started
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${GREEN}✓ Backend server running (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${RED}✗ Backend server failed to start${NC}"
    fi
else
    echo -e "${YELLOW}Backend not ready - skipping${NC}"
fi

# Start admin portal
if [ -d "admin" ] && [ -f "admin/package.json" ]; then
    echo -e "${BLUE}Starting admin portal on port $ADMIN_PORT...${NC}"
    cd admin
    npm run dev &
    ADMIN_PID=$!
    cd ..
    sleep 3

    if kill -0 $ADMIN_PID 2>/dev/null; then
        echo -e "${GREEN}✓ Admin portal running (PID: $ADMIN_PID)${NC}"
    else
        echo -e "${RED}✗ Admin portal failed to start${NC}"
    fi
else
    echo -e "${YELLOW}Admin portal not ready - skipping${NC}"
fi

# Start display client server (simple static server)
if [ -d "display" ]; then
    echo -e "${BLUE}Starting display client on port $DISPLAY_PORT...${NC}"
    cd display
    if command -v npx &> /dev/null; then
        npx serve -l $DISPLAY_PORT . &
        DISPLAY_PID=$!
    else
        python3 -m http.server $DISPLAY_PORT &
        DISPLAY_PID=$!
    fi
    cd ..
    sleep 2

    if kill -0 $DISPLAY_PID 2>/dev/null; then
        echo -e "${GREEN}✓ Display client running (PID: $DISPLAY_PID)${NC}"
    else
        echo -e "${RED}✗ Display client failed to start${NC}"
    fi
else
    echo -e "${YELLOW}Display directory not ready - skipping${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Development Environment Ready!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Access Points:${NC}"
echo -e "  Backend API:    http://localhost:$BACKEND_PORT"
echo -e "  Admin Portal:   http://localhost:$ADMIN_PORT"
echo -e "  Display Client: http://localhost:$DISPLAY_PORT"
echo ""
echo -e "${BLUE}API Endpoints:${NC}"
echo -e "  Health Check:   GET  http://localhost:$BACKEND_PORT/api/health"
echo -e "  Login:          POST http://localhost:$BACKEND_PORT/api/auth/login"
echo -e "  Docket:         GET  http://localhost:$BACKEND_PORT/api/docket"
echo ""
echo -e "${BLUE}Default Admin Credentials:${NC}"
echo -e "  Email:    admin@courthouse.gov"
echo -e "  Password: admin123"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for background processes
wait
