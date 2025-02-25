#!/bin/bash

# Ensure proper environment setup
export HOME="${HOME:-$(eval echo ~$(whoami))}"
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:$(dirname "$0")/../auth0-cli"

# Define config locations
CONFIG_DIR="$HOME/.config/auth0"
CONFIG_FILE="$CONFIG_DIR/config.json"
ALT_CONFIG_DIR="$HOME/.auth0"
ALT_CONFIG_FILE="$ALT_CONFIG_DIR/config.json"

# Show debug info - redirect to stderr
echo "Debug information:" >&2
echo "HOME=$HOME" >&2
echo "PATH=$PATH" >&2
echo "PWD=$(pwd)" >&2
echo "Config path: $CONFIG_FILE" >&2
echo "Alt config path: $ALT_CONFIG_FILE" >&2
echo "CLI path: ${AUTH0_CLI_PATH:-auth0}" >&2

# Check if primary config exists
if [ -f "$CONFIG_FILE" ]; then
  echo "Config file exists at $CONFIG_FILE" >&2
else
  echo "Config file not found at $CONFIG_FILE" >&2
  
  # Try alternative location
  if [ -f "$ALT_CONFIG_FILE" ]; then
    echo "Found config at alternative location: $ALT_CONFIG_FILE" >&2
    # Create directory if it doesn't exist
    mkdir -p "$CONFIG_DIR"
    # Copy config file
    cp "$ALT_CONFIG_FILE" "$CONFIG_FILE"
    echo "Copied config from $ALT_CONFIG_FILE to $CONFIG_FILE" >&2
  else
    echo "No config file found in any standard location" >&2
  fi
fi

# Try to get token using auth0-cli
if [ -n "$AUTH0_CLI_PATH" ] && [ -f "$AUTH0_CLI_PATH" ]; then
  echo "Using explicit CLI path: $AUTH0_CLI_PATH" >&2
  
  # Try with explicit path
  TOKEN=$("$AUTH0_CLI_PATH" api get-token 2>/dev/null)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ] && [ -n "$TOKEN" ]; then
    echo "Successfully retrieved token using explicit CLI path" >&2
    echo "$TOKEN"
    exit 0
  else
    echo "Failed to get token with explicit CLI path (exit code: $EXIT_CODE)" >&2
  fi
else
  # Try with command in PATH
  echo "Trying with 'auth0' command from PATH" >&2
  TOKEN=$(auth0 api get-token 2>/dev/null)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ] && [ -n "$TOKEN" ]; then
    echo "Successfully retrieved token using PATH" >&2
    echo "$TOKEN"
    exit 0
  else
    echo "Failed to get token with PATH (exit code: $EXIT_CODE)" >&2
  fi
fi

# Try common locations for auth0-cli binary
COMMON_PATHS=(
  "/Users/bharath/dev/mcp/auth0-cli/auth0"
  "$(pwd)/../auth0-cli/auth0"
  "$(dirname "$0")/../auth0-cli/auth0"
)

for CLI_PATH in "${COMMON_PATHS[@]}"; do
  if [ -f "$CLI_PATH" ]; then
    echo "Trying with CLI at: $CLI_PATH" >&2
    TOKEN=$("$CLI_PATH" api get-token 2>/dev/null)
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ] && [ -n "$TOKEN" ]; then
      echo "Successfully retrieved token using $CLI_PATH" >&2
      echo "$TOKEN"
      exit 0
    fi
  fi
done

# Last resort: direct extraction from config
echo "All CLI methods failed, attempting direct extraction from config" >&2

for CONFIG in "$CONFIG_FILE" "$ALT_CONFIG_FILE"; do
  if [ -f "$CONFIG" ]; then
    echo "Attempting direct extraction from: $CONFIG" >&2
    # Extract access_token directly - this is a fallback
    TOKEN=$(grep -o '"access_token":"[^"]*"' "$CONFIG" | head -1 | cut -d':' -f2 | tr -d '"')
    
    if [ -n "$TOKEN" ]; then
      echo "Successfully extracted token directly from config" >&2
      echo "$TOKEN"
      exit 0
    fi
  fi
done

echo "All token retrieval methods failed" >&2
exit 1 