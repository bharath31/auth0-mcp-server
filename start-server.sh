#!/bin/bash

# Environment setup script for auth0-mcp-server
# This script ensures the proper environment is set up before starting the server

# Set essential environment variables
export HOME="${HOME:-$(eval echo ~$(whoami))}"
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:$(dirname "$0")/../auth0-cli"
export DEBUG="auth0-mcp:*"

# Set current directory to script location for proper path resolution
cd "$(dirname "$0")"

# Show environment information - redirect all to stderr
echo "Starting auth0-mcp-server with environment:" >&2
echo "HOME=$HOME" >&2
echo "PATH=$PATH" >&2
echo "Working directory: $(pwd)" >&2

if [ -n "$AUTH0_CLI_PATH" ]; then
  echo "Using AUTH0_CLI_PATH: $AUTH0_CLI_PATH" >&2
  
  # Verify CLI exists
  if [ -f "$AUTH0_CLI_PATH" ]; then
    echo "✓ CLI binary exists" >&2
    
    # Make sure it's executable
    chmod +x "$AUTH0_CLI_PATH"
  else
    echo "⚠️ WARNING: AUTH0_CLI_PATH points to non-existent file: $AUTH0_CLI_PATH" >&2
  fi
else
  # Try to find auth0-cli
  CLI_PATH="../auth0-cli/auth0"
  if [ -f "$CLI_PATH" ]; then
    export AUTH0_CLI_PATH="$(cd "$(dirname "$CLI_PATH")" && pwd)/$(basename "$CLI_PATH")"
    echo "Found auth0-cli at: $AUTH0_CLI_PATH" >&2
    chmod +x "$AUTH0_CLI_PATH"
  else
    echo "⚠️ WARNING: Could not find auth0-cli, token retrieval may fail" >&2
  fi
fi

# Check for config file
CONFIG_FILE="$HOME/.config/auth0/config.json"
if [ -f "$CONFIG_FILE" ]; then
  echo "✓ Config file exists at: $CONFIG_FILE" >&2
else
  echo "⚠️ WARNING: Config file not found at: $CONFIG_FILE" >&2
fi

# Get node executable
NODE_PATH=$(command -v node)
if [ -z "$NODE_PATH" ]; then
  echo "⚠️ ERROR: Node.js not found. Please install Node.js" >&2
  exit 1
else
  echo "Using Node.js at: $NODE_PATH" >&2
fi

# Ensure get-token.sh is executable
if [ -f "get-token.sh" ]; then
  chmod +x "get-token.sh"
  echo "✓ get-token.sh is executable" >&2
else
  echo "⚠️ WARNING: get-token.sh not found" >&2
fi

# Start the server
echo "Starting auth0-mcp-server..." >&2
exec "$NODE_PATH" dist/index.js "$@" 