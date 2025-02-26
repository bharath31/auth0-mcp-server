#!/bin/bash

# Dynamic Wrapper for Auth0 MCP Server
# This wrapper script properly launches the server without storing tokens
# It sets up the environment for the server to fetch tokens dynamically

# Initialize with defaults
SERVER_PATH=$(dirname "$(realpath "$0")")
AUTH0_CLI_PATH="/Users/bharath/dev/mcp/auth0-cli/auth0"
NODE_PATH=$(which node)
DEBUG=${DEBUG:-false}
PORT=${SERVER_PORT:-4000}

# Debug mode
if [ "$DEBUG" = "true" ]; then
  echo "[DEBUG] NODE_PATH: $NODE_PATH"
  echo "[DEBUG] SERVER_PATH: $SERVER_PATH"
  echo "[DEBUG] AUTH0_CLI_PATH: $AUTH0_CLI_PATH"
  echo "[DEBUG] PORT: $PORT"
  echo "[DEBUG] Command line args: $@"
fi

# Check if Auth0 CLI exists and is executable
if [ ! -f "$AUTH0_CLI_PATH" ]; then
  echo "Error: Auth0 CLI not found at $AUTH0_CLI_PATH"
  exit 1
fi

if [ ! -x "$AUTH0_CLI_PATH" ]; then
  echo "Making Auth0 CLI executable: $AUTH0_CLI_PATH"
  chmod +x "$AUTH0_CLI_PATH"
fi

# Verify Auth0 CLI is authenticated
if [ "$DEBUG" = "true" ]; then
  echo "[DEBUG] Checking Auth0 CLI authentication status..."
  "$AUTH0_CLI_PATH" tenants list || {
    echo "Warning: Auth0 CLI not authenticated or error running command"
    echo "You may need to run: $AUTH0_CLI_PATH login"
  }
fi

# Add Auth0 CLI to PATH for subprocess calls
export PATH="$(dirname "$AUTH0_CLI_PATH"):$PATH"

# Also set environment variable for processes
export AUTH0_CLI_PATH="$AUTH0_CLI_PATH"

# Set default domain if not provided
export AUTH0_DOMAIN=${2:-"dev-e6lvf4q7ybhifyfp.us.auth0.com"}

# Enable dynamic token retrieval
export AUTH0_TOKEN_DYNAMIC=true

# Start the Auth0 MCP Server
cd "$SERVER_PATH" || { echo "Error: Failed to change directory to $SERVER_PATH"; exit 1; }
echo "Starting Auth0 MCP server with domain: $AUTH0_DOMAIN"
exec "$NODE_PATH" dist/index.js "$@" 