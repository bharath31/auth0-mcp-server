#!/bin/bash

# Auth0 MCP Server setup script for Claude Desktop
# This script helps set up the Auth0 MCP Server for use with Claude Desktop

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Auth0 MCP Server Setup for Claude Desktop ===${NC}"
echo ""

# Check if auth0-cli is installed
if ! command -v auth0 &> /dev/null; then
    echo -e "${YELLOW}auth0-cli is not installed. Would you like to install it? (y/n)${NC}"
    read -r install_auth0
    if [[ "$install_auth0" =~ ^[Yy]$ ]]; then
        echo "Installing auth0-cli..."
        npm install -g auth0-cli
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install auth0-cli. Please install it manually: npm install -g auth0-cli${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Continuing without auth0-cli. You'll need to set environment variables manually.${NC}"
    fi
else
    echo -e "${GREEN}✓ auth0-cli is installed${NC}"
fi

# Check if user is logged in to Auth0
if command -v auth0 &> /dev/null; then
    echo "Checking Auth0 login status..."
    if ! auth0 tenants list &> /dev/null; then
        echo -e "${YELLOW}You are not logged in to Auth0. Would you like to login now? (y/n)${NC}"
        read -r login_auth0
        if [[ "$login_auth0" =~ ^[Yy]$ ]]; then
            auth0 login
            if [ $? -ne 0 ]; then
                echo -e "${RED}Auth0 login failed. You may need to set environment variables manually.${NC}"
            else
                echo -e "${GREEN}✓ Successfully logged in to Auth0${NC}"
            fi
        else
            echo -e "${YELLOW}Continuing without logging in. You'll need to set environment variables manually.${NC}"
        fi
    else
        echo -e "${GREEN}✓ You are already logged in to Auth0${NC}"
    fi
fi

# Install dependencies and build
echo "Installing dependencies..."
npm install

echo "Building server..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed. Please check the error messages above.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Server built successfully${NC}"

# Generate Claude Desktop configuration snippet
CURRENT_DIR=$(pwd)
echo ""
echo -e "${GREEN}=== Claude Desktop Configuration ===${NC}"
echo "To add this server to Claude Desktop:"
echo "1. Open Claude Desktop"
echo "2. Go to Settings > Extensions"
echo "3. Click 'Add' under 'Local Server Connections'"
echo "4. Enter 'Auth0' as the name"
echo -e "5. Enter the following command:\n"
echo -e "${YELLOW}cd $CURRENT_DIR && npm start${NC}"
echo ""
echo "6. Click 'Save'"

echo ""
echo -e "${GREEN}=== Test the Server ===${NC}"
echo "To test the server, run:"
echo -e "${YELLOW}npm start${NC}"

echo ""
echo -e "${GREEN}Setup complete! You can now use Auth0 tools with Claude Desktop.${NC}" 