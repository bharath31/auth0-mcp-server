#!/usr/bin/env node

/**
 * MCP Server Connection Test Script
 * 
 * This script tests the connection to the Auth0 MCP server by simulating
 * the Claude client's JSON-RPC calls and analyzing the responses.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DEBUG = process.env.DEBUG || true;
const SERVER_PATH = path.join(__dirname, 'dist', 'index.js');
const WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');
const AUTH0_DOMAIN = 'dev-e6lvf4q7ybhifyfp.us.auth0.com';
const NODE_PATH = process.env.NODE || process.env.NODE_PATH || 'node';
const LOCAL_AUTH0_CLI_PATH = '/Users/bharath/dev/mcp/auth0-cli/auth0';

// Utility functions
function log(...args) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Test functions
/**
 * Get Auth0 token using the CLI
 */
async function getToken() {
  log('Getting Auth0 token...');
  
  try {
    // Try local Auth0 CLI first
    if (fs.existsSync(LOCAL_AUTH0_CLI_PATH)) {
      try {
        // Make it executable
        fs.chmodSync(LOCAL_AUTH0_CLI_PATH, '755');
        
        // Get token with local CLI
        const { stdout } = await execAsync(`"${LOCAL_AUTH0_CLI_PATH}" api get-token`);
        const token = stdout.trim();
        
        if (token) {
          log(`Successfully retrieved token using local CLI (length: ${token.length})`);
          return token;
        }
      } catch (error) {
        log(`Failed to get token with local CLI: ${error.message}`);
        // Fall through to next method
      }
    }
    
    // Try global Auth0 CLI
    try {
      const { stdout } = await execAsync('auth0 api get-token');
      const token = stdout.trim();
      
      if (token) {
        log(`Successfully retrieved token using CLI (length: ${token.length})`);
        return token;
      }
    } catch (error) {
      log(`Failed to get token with global CLI: ${error.message}`);
      // Fall through to next method
    }
    
    // Try environment variables
    if (process.env.AUTH0_TOKEN) {
      log('Using token from environment variable');
      return process.env.AUTH0_TOKEN;
    }
    
    // Try to pull from Claude Desktop config
    try {
      const configPath = path.join(os.homedir(), '.claude-desktop', 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config && config.auth0 && config.auth0.token) {
          log('Using token from Claude Desktop config');
          return config.auth0.token;
        }
      }
    } catch (err) {
      log(`Error reading Claude Desktop config: ${err.message}`);
    }
    
    throw new Error('Failed to get Auth0 token through any method');
  } catch (err) {
    log(`Token retrieval error: ${err.message}`);
    throw err;
  }
}

async function testDirectApiConnection() {
  log('Testing direct connection to Auth0 API...');
  try {
    const token = await getToken();
    const curlCommand = `curl -s -H "Authorization: Bearer ${token}" "https://${AUTH0_DOMAIN}/api/v2/clients?per_page=1"`;
    const { stdout } = await execAsync(curlCommand);
    const response = JSON.parse(stdout);
    log('API connection successful:', Array.isArray(response) ? `Retrieved ${response.length} client(s)` : 'Retrieved data');
    return true;
  } catch (error) {
    log('Error testing API connection:', error.message);
    return false;
  }
}

// Simulate the JSON-RPC protocol for MCP
class MCP_JSONRPC_Client {
  constructor(serverProcess) {
    this.serverProcess = serverProcess;
    this.id = 1;
  }
  
  createRequest(method, params) {
    return {
      jsonrpc: "2.0",
      id: this.id++,
      method,
      params
    };
  }
  
  parseResponse(responseText) {
    try {
      return JSON.parse(responseText);
    } catch (error) {
      log('Error parsing JSON-RPC response:', error.message);
      log('Raw response:', responseText);
      throw new Error('Invalid JSON-RPC response');
    }
  }
}

// MCP server test function
async function testMCPServerConnection(useLiveServer = false) {
  let serverProcess = null;
  let closeServerProcess = () => {};
  
  // Define a response handler variable to collect server output
  let responseHandler = null;
  
  try {
    log('Starting MCP server locally for testing...');
    
    // If we're using a live server, don't start a local one
    if (!useLiveServer) {
      // Make executable
      const WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');
      fs.chmodSync(WRAPPER_PATH, '755');
      log('Made wrapper executable: %s', WRAPPER_PATH);
      
      // Debug info
      log('Wrapper path: %s', WRAPPER_PATH);
      log('Server path: %s', SERVER_PATH);
      log('NODE_PATH: %s', process.env.NODE_PATH || 'node');
      log('AUTH0_DOMAIN: %s', process.env.AUTH0_DOMAIN || 'dev-e6lvf4q7ybhifyfp.us.auth0.com');
      log('AUTH0_CLI_PATH: %s', process.env.AUTH0_CLI_PATH || '/Users/bharath/dev/mcp/auth0-cli/auth0');

      // Create environment for the server process
      const env = {
        ...process.env,
        DEBUG: 'auth0-mcp:*',
        AUTH0_CLI_PATH: process.env.AUTH0_CLI_PATH || '/Users/bharath/dev/mcp/auth0-cli/auth0',
        AUTH0_TOKEN_DYNAMIC: 'true'
      };
      
      // Start the server process
      serverProcess = spawn(WRAPPER_PATH, ['run'], { env });
      
      // Save function to close the server
      closeServerProcess = () => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill();
          log('Killed server process');
        }
      };
      
      // Log server output
      serverProcess.stdout.on('data', (data) => {
        const message = data.toString();
        log('[Server stdout]: %s', message.trim());
        
        // If someone is waiting for a response, call the handler
        if (responseHandler) {
          responseHandler(message);
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        log('[Server stderr]: %s', data.toString().trim());
      });
      
      serverProcess.on('error', (error) => {
        log('[Server error]: %s', error.message);
      });
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Start the initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        client: {
          name: 'test-client',
          version: '1.0.0'
        },
        capabilities: {
          tools: {}
        }
      }
    };
    
    console.log('Sending initialize request...');
    console.log('Initialize Request:', JSON.stringify(initRequest, null, 2));
    
    // Send the initialize request
    const initResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);
      
      // Set up response handler for this request
      responseHandler = (data) => {
        try {
          // Try to parse the response as JSON
          const json = JSON.parse(data);
          if (json.id === 1) {
            clearTimeout(timeoutId);
            resolve(json);
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      };
      
      // Send the request
      if (serverProcess) {
        serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
      } else {
        reject(new Error('Server process not available'));
      }
    }).catch(error => {
      log('Error in initialize request: %s', error.message);
      throw error;
    });
    
    console.log('Initialize response:', JSON.stringify(initResponse));
    
    // Now send the listTools request
    console.log('Sending tools/list request...');
    
    // Create request for listTools
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };
    
    console.log('tools/list Request:', JSON.stringify(listToolsRequest, null, 2));
    
    // Send the request
    const listToolsResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);
      
      // Set up response handler for this request
      responseHandler = (data) => {
        try {
          // Try to parse the response as JSON
          const json = JSON.parse(data);
          if (json.id === 2) {
            clearTimeout(timeoutId);
            resolve(json);
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      };
      
      // Send the request
      if (serverProcess) {
        serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
      } else {
        reject(new Error('Server process not available'));
      }
    }).catch(error => {
      log('Error in tools/list request: %s', error.message);
      throw error;
    });
    
    console.log('tools/list response:', JSON.stringify(listToolsResponse));
    
    // Parse the response
    console.log('Parsed tools/list response:', JSON.stringify(listToolsResponse, null, 2));
    
    // Check if we got an error
    if (listToolsResponse.error) {
      throw new Error(`Server error: ${listToolsResponse.error.message}`);
    }
    
    // Validate the response contains tools
    if (!listToolsResponse.result || !listToolsResponse.result.tools) {
      throw new Error('Invalid response: missing tools array');
    }
    
    // Test calling the list_applications tool
    try {
      console.log('\nTesting tool call: auth0_list_applications');
      
      // Create request for calling the tool
      const callToolRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'auth0_list_applications',
          parameters: {
            per_page: 5,
            include_totals: true
          }
        }
      };
      
      console.log('tools/call Request:', JSON.stringify(callToolRequest, null, 2));
      
      // Send the request
      const callToolResponse = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Server response timeout after 10 seconds'));
        }, 10000);
        
        // Set up response handler for this request
        responseHandler = (data) => {
          try {
            // Try to parse the response as JSON
            const json = JSON.parse(data);
            if (json.id === 3) {
              clearTimeout(timeoutId);
              resolve(json);
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        };
        
        // Send the request
        if (serverProcess) {
          serverProcess.stdin.write(JSON.stringify(callToolRequest) + '\n');
        } else {
          reject(new Error('Server process not available'));
        }
      }).catch(error => {
        log('Error in tools/call request: %s', error.message);
        throw error;
      });
      
      console.log('tools/call response:', JSON.stringify(callToolResponse, null, 2));
      
      // Check if the tool call was successful
      if (callToolResponse.error) {
        console.log(`Tool call error: ${callToolResponse.error.message}`);
      } else if (callToolResponse.result && callToolResponse.result.toolResult) {
        console.log('Tool call successful!');
        
        // Check if there was an error in the tool execution
        if (callToolResponse.result.toolResult.isError) {
          const errorContent = callToolResponse.result.toolResult.content[0];
          console.log(`Tool execution error: ${errorContent.text}`);
        } else {
          console.log('Tool execution successful!');
        }
      }
    } catch (error) {
      console.log(`Error testing tool call: ${error.message}`);
    }
    
    return {
      success: true,
      tools: listToolsResponse.result.tools
    };
    
  } catch (error) {
    log('Error in MCP server test: %s', error.message);
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close the server process if we started one
    log('Terminating server process');
    closeServerProcess();
  }
}

// Helper function to read one line from a stream
function readLineFromStream(stream) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });
    
    rl.once('line', (line) => {
      rl.close();
      resolve(line);
    });
  });
}

// Verify Claude Desktop configuration
async function checkClaudeDesktopConfig() {
  log('Checking Claude Desktop configuration...');
  try {
    const configPath = path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Claude Desktop config file not found');
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!configData.mcpServers || !configData.mcpServers.auth0) {
      throw new Error('Auth0 MCP server not configured in Claude Desktop');
    }
    
    const auth0Config = configData.mcpServers.auth0;
    log('Auth0 MCP Server configuration:');
    log('- Command:', auth0Config.command);
    log('- Args:', auth0Config.args);
    log('- Capabilities:', auth0Config.capabilities);
    log('- Environment variables:');
    Object.entries(auth0Config.env || {}).forEach(([key, value]) => {
      log(`  - ${key}: ${key === 'AUTH0_TOKEN' ? '[REDACTED]' : value}`);
    });
    
    // Check for wrapper script usage
    if (auth0Config.command === WRAPPER_PATH) {
      log('✅ Using wrapper script for token retrieval');
    } else if (auth0Config.env && auth0Config.env.AUTH0_TOKEN) {
      log('⚠️ Using static token in config (not recommended)');
    } else {
      log('⚠️ No token mechanism detected in config');
    }
    
    return { 
      success: true, 
      config: auth0Config
    };
  } catch (error) {
    log('Error checking Claude Desktop config:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main function to run all tests
async function runTests() {
  console.log('=== Auth0 MCP Server Connection Test ===');
  console.log('Testing timestamp:', new Date().toISOString());
  console.log('Environment:');
  console.log('- HOME:', process.env.HOME);
  console.log('- PATH:', process.env.PATH);
  console.log('- AUTH0_DOMAIN:', AUTH0_DOMAIN);
  console.log('- NODE_PATH:', NODE_PATH);
  console.log('- SERVER_PATH:', SERVER_PATH);
  console.log('- WRAPPER_PATH:', WRAPPER_PATH);
  console.log('============================================');
  
  try {
    // Step 1: Check if token can be retrieved
    console.log('\n🔑 Step 1: Testing token retrieval');
    try {
      const token = await getToken();
      console.log(`✅ Successfully retrieved token (length: ${token.length})`);
    } catch (error) {
      console.log(`❌ Failed to retrieve token: ${error.message}`);
      console.log('This is a critical issue - the server needs a valid token to function');
    }
    
    // Step 2: Check direct API connection
    console.log('\n🌐 Step 2: Testing direct API connection');
    const apiConnectionResult = await testDirectApiConnection();
    if (apiConnectionResult) {
      console.log('✅ Successfully connected to Auth0 API');
    } else {
      console.log('❌ Failed to connect to Auth0 API');
      console.log('Check your network connection and Auth0 domain');
    }
    
    // Step 3: Check Claude Desktop configuration
    console.log('\n⚙️ Step 3: Checking Claude Desktop configuration');
    const configResult = await checkClaudeDesktopConfig();
    if (configResult.success) {
      console.log('✅ Claude Desktop configuration is valid');
    } else {
      console.log(`❌ Claude Desktop configuration issue: ${configResult.error}`);
    }
    
    // Step 4: Test local MCP server connection
    console.log('\n🔌 Step 4: Testing local MCP server connection');
    const localServerResult = await testMCPServerConnection(false);
    if (localServerResult.success) {
      console.log('✅ Local MCP server connection successful');
    } else {
      console.log(`❌ Local MCP server connection failed: ${localServerResult.error}`);
    }
    
    // Conclusion
    console.log('\n📊 Test Results Summary:');
    console.log('1. Token Retrieval: ' + (await canGetToken() ? '✅ Success' : '❌ Failed'));
    console.log('2. Direct API Access: ' + (apiConnectionResult ? '✅ Success' : '❌ Failed'));
    console.log('3. Claude Config: ' + (configResult.success ? '✅ Valid' : '❌ Invalid'));
    console.log('4. Local Server: ' + (localServerResult.success ? '✅ Working' : '❌ Issues'));
    
    if (await canGetToken() && apiConnectionResult && configResult.success && localServerResult.success) {
      console.log('\n🎉 All tests passed! If you are still experiencing connection issues with Claude Desktop:');
      console.log('1. Try restarting Claude Desktop');
      console.log('2. Check if there\'s a firewall or network issue when Claude is running');
      console.log('3. Verify all processes have the necessary permissions');
    } else {
      console.log('\n🔍 There are issues that need to be addressed - review the details above');
    }
    
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Helper function to check if we can get a token
async function canGetToken() {
  try {
    await getToken();
    return true;
  } catch (error) {
    return false;
  }
}

// Run the tests when this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTests();
}

export { runTests, testDirectApiConnection, testMCPServerConnection, getToken }; 