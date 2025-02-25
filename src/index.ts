#!/usr/bin/env node
import { startServer } from './server.js';
import debug from 'debug';

// Set up debug logger that writes to stderr only
const log = debug('auth0-mcp:index');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = args.join(' ');
  process.stderr.write(msg + '\n');
  return true;
};

// Set process title
process.title = 'auth0-mcp-server';

// Handle process events
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Main function to start server
async function run(args: string[]) {
  try {
    log('Starting Auth0 MCP server...');
    
    // Ensure HOME is set
    if (!process.env.HOME) {
      process.env.HOME = require('os').homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }
    
    // Extract domain and token from command line if provided
    const domain = args[0];
    const token = args[1];
    
    if (domain && token) {
      log(`Using provided domain: ${domain}`);
      // Don't log the token for security reasons
      log('Using provided token from command line');
      
      // Set as environment variables for the config to pick up
      process.env.AUTH0_DOMAIN = domain;
      process.env.AUTH0_TOKEN = token;
    } else {
      log('No domain and token provided, will attempt to load from auth0-cli config');
    }
    
    await startServer();
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const command = process.argv[2];
if (command === 'run') {
  // Pass any additional arguments to the run function
  const args = process.argv.slice(3);
  run(args);
} else if (command === 'init') {
  console.error('Initialization is handled by the Auth0 CLI');
  process.exit(0);
} else {
  console.error('Usage: auth0-mcp run [domain] [token]');
  process.exit(1);
}

// Export for use in bin script
export { startServer }; 