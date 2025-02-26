#!/usr/bin/env node

/**
 * Auth0 Token Retrieval Fix
 * 
 * This script attempts to fix the token retrieval issue by:
 * 1. Creating a specific environment file for the server
 * 2. Creating a simplified wrapper script
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = os.homedir();

// Paths to check for existing token
const CONFIG_PATHS = [
  path.join(HOME_DIR, '.config', 'auth0', 'config.json'),
  path.join(HOME_DIR, '.auth0', 'config.json')
];

console.log('=== Auth0 Token Retrieval Fix ===');

// Try to find an existing token
function findExistingToken() {
  console.log('Looking for existing Auth0 token...');
  
  for (const configPath of CONFIG_PATHS) {
    console.log(`Checking ${configPath}...`);
    
    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const configJson = JSON.parse(configData);
        
        if (configJson.access_token) {
          console.log(`✅ Found token in ${configPath}`);
          return configJson.access_token;
        }
      } catch (error) {
        console.log(`Error reading config: ${error.message}`);
      }
    } else {
      console.log(`Config file not found at ${configPath}`);
    }
  }
  
  console.log('❌ No token found in config files');
  return null;
}

// Create an environment file
function createEnvFile(token) {
  if (!token) {
    console.log('No token available to create .env file');
    return false;
  }
  
  const envPath = path.join(__dirname, '.env');
  const envContent = `AUTH0_TOKEN=${token}\nAUTH0_DOMAIN=dev-e6lvf4q7ybhifyfp.us.auth0.com\n`;
  
  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Created .env file at ${envPath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error creating .env file: ${error.message}`);
    return false;
  }
}

// Create a simplified wrapper script
function createSimpleWrapper() {
  const wrapperPath = path.join(__dirname, 'simple-wrapper.sh');
  const wrapperContent = `#!/bin/bash

# Simple wrapper for Auth0 MCP Server
# This uses a .env file directly instead of trying to retrieve a token

# Path to Node.js
NODE_PATH=\${NODE_PATH:-node}

# Path to the server
SERVER_PATH="\$(dirname "\$0")/dist/index.js"

# Use .env file if it exists
if [ -f "\$(dirname "\$0")/.env" ]; then
  echo "Using .env file for Auth0 token" >&2
  source "\$(dirname "\$0")/.env"
fi

# Run the server
exec "\$NODE_PATH" "\$SERVER_PATH" "\$@"
`;
  
  try {
    fs.writeFileSync(wrapperPath, wrapperContent);
    fs.chmodSync(wrapperPath, '755'); // Make executable
    console.log(`✅ Created simple wrapper at ${wrapperPath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error creating wrapper: ${error.message}`);
    return false;
  }
}

// Update Claude Desktop config to use the new wrapper
function updateClaudeConfig() {
  const claudeConfigPath = path.join(HOME_DIR, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  
  if (!fs.existsSync(claudeConfigPath)) {
    console.log(`❌ Claude Desktop config not found at: ${claudeConfigPath}`);
    return false;
  }
  
  try {
    const configData = fs.readFileSync(claudeConfigPath, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config.mcpServers || !config.mcpServers.auth0) {
      console.log('❌ Auth0 MCP server not configured in Claude Desktop');
      return false;
    }
    
    // Save the original config
    const backupPath = `${claudeConfigPath}.backup`;
    fs.writeFileSync(backupPath, configData);
    console.log(`✅ Created backup of Claude config at ${backupPath}`);
    
    // Update to use the new wrapper
    const simplePath = path.join(__dirname, 'simple-wrapper.sh');
    config.mcpServers.auth0.command = simplePath;
    
    // Write the updated config
    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    console.log(`✅ Updated Claude Desktop config to use simplified wrapper`);
    
    return true;
  } catch (error) {
    console.log(`❌ Error updating Claude config: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Step 1: Find an existing token
    const token = findExistingToken();
    
    if (token) {
      // Step 2: Create .env file
      const envCreated = createEnvFile(token);
      
      // Step 3: Create simplified wrapper
      const wrapperCreated = createSimpleWrapper();
      
      // Step 4: Update Claude Desktop config
      if (envCreated && wrapperCreated) {
        const configUpdated = updateClaudeConfig();
        
        if (configUpdated) {
          console.log('\n✅ All fixes applied successfully!');
          console.log('Please restart Claude Desktop to apply changes.');
          return true;
        }
      }
    } else {
      console.log('\n❌ Unable to fix token issue: No token found');
      console.log('Please try logging in to Auth0 again:');
      console.log('1. Run: auth0 login');
      console.log('2. Then run this script again');
    }
    
    return false;
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    return false;
  }
}

main().then((success) => {
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}); 