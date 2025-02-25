import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import debug from 'debug';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

// Promisify exec
const execAsync = promisify(exec);

// Set up debug logger
const log = debug('auth0-mcp:config');

// Handle ESM module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure HOME is set
if (!process.env.HOME) {
  process.env.HOME = os.homedir();
  log(`HOME environment variable was not set, setting to: ${process.env.HOME}`);
}

export interface Auth0Config {
  token: string;
  domain: string;
  tenantName: string;
}

export async function loadConfig(): Promise<Auth0Config | null> {
  try {
    // Try loading from environment variables first
    if (process.env.AUTH0_TOKEN && process.env.AUTH0_DOMAIN) {
      log('Loading configuration from environment variables');
      log(`Domain: ${process.env.AUTH0_DOMAIN}`);
      log(`Token length: ${process.env.AUTH0_TOKEN.length}`);
      log(`Path: ${process.env.PATH}`);
      
      return {
        token: process.env.AUTH0_TOKEN,
        domain: process.env.AUTH0_DOMAIN,
        tenantName: process.env.AUTH0_TENANT_NAME || 'default'
      };
    }

    // Check both possible auth0-cli config locations
    const configPaths = [
      path.join(os.homedir(), '.config', 'auth0', 'config.json'),
      path.join(os.homedir(), '.auth0', 'config.json')
    ];
    
    let configPath = '';
    let configData = null;
    
    // Try each path
    for (const possiblePath of configPaths) {
      log(`Checking for auth0-cli config at ${possiblePath}`);
      if (fs.existsSync(possiblePath)) {
        log(`Found auth0-cli config at ${possiblePath}`);
        configPath = possiblePath;
        try {
          configData = JSON.parse(fs.readFileSync(possiblePath, 'utf8'));
          break;
        } catch (e) {
          log(`Error parsing config at ${possiblePath}:`, e);
        }
      }
    }
    
    if (!configData) {
      log('Auth0 CLI config not found in any expected location');
      
      // Try to use auth0-cli to get config info
      try {
        log('Attempting to get auth0 tenant info using CLI');
        const { stdout } = await execAsync('auth0 tenants list --json');
        const tenants = JSON.parse(stdout);
        
        if (tenants && tenants.length > 0) {
          const activeTenant = tenants.find((t: any) => t.active) || tenants[0];
          log(`Found tenant via CLI: ${activeTenant.name}`);
          
          // Now try to get a token
          const tokenResult = await getTokenFromCLI();
          if (!tokenResult) {
            log('Failed to get token from CLI');
            return null;
          }
          
          return {
            token: tokenResult.token,
            domain: activeTenant.name,
            tenantName: activeTenant.name.split('.')[0]
          };
        }
      } catch (e) {
        log('Error using auth0-cli:', e);
      }
      
      return null;
    }

    if (!configData.default_tenant) {
      log('No default tenant configured in auth0-cli');
      return null;
    }

    const defaultTenant = configData.tenants[configData.default_tenant];
    if (!defaultTenant) {
      log(`Default tenant ${configData.default_tenant} not found in config`);
      return null;
    }
    
    log(`Default tenant: ${JSON.stringify(defaultTenant, null, 2)}`);

    // Check if token is expired and log a warning
    const expiresAt = new Date(defaultTenant.expires_at);
    log(`Expiration date: ${expiresAt.toISOString()}, current date: ${new Date().toISOString()}`);
    
    // Make sure to always compare dates using getTime() to handle string formats properly
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() < new Date().getTime()) {
      log('Warning: Auth0 token is expired. Please run `auth0 login` to refresh it');
      
      // Try to get a fresh token using the CLI
      const tokenResult = await getTokenFromCLI();
      if (!tokenResult) {
        return null;
      }
      
      return {
        token: tokenResult.token,
        domain: defaultTenant.domain,
        tenantName: defaultTenant.name
      };
    }

    // Get token from keyring if possible
    if (!defaultTenant.access_token || defaultTenant.access_token.length === 0) {
      log('No access token in config file, trying to get one from auth0-cli');
      const tokenResult = await getTokenFromCLI();
      if (!tokenResult) {
        return null;
      }
      
      return {
        token: tokenResult.token,
        domain: defaultTenant.domain,
        tenantName: defaultTenant.name
      };
    }

    log(`Using configuration for tenant: ${defaultTenant.name}`);
    return {
      token: defaultTenant.access_token,
      domain: defaultTenant.domain,
      tenantName: defaultTenant.name
    };
  } catch (error) {
    log('Error loading configuration:', error);
    return null;
  }
}

async function getTokenFromCLI(): Promise<{ token: string } | null> {
  try {
    // Ensure HOME is set before doing anything
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`HOME was undefined, set to: ${process.env.HOME}`);
    }
    
    log('Attempting to get token using auth0-cli');
    log(`Current PATH: ${process.env.PATH}`);
    log(`Current HOME: ${process.env.HOME}`);
    log(`Current working directory: ${process.cwd()}`);
    
    // Try using our shell script first
    try {
      // Get the absolute path to the script
      const scriptDir = path.resolve(__dirname, '..');
      const scriptPath = path.join(scriptDir, 'get-token.sh');
      log(`Using token retrieval script at: ${scriptPath}`);
      
      if (fs.existsSync(scriptPath)) {
        // Make sure the script is executable
        fs.chmodSync(scriptPath, '755');
        log('Script exists, making it executable');
        
        // Execute the script with explicit environment variables
        const { stdout } = await execAsync(`${scriptPath}`, {
          env: {
            ...process.env,
            HOME: process.env.HOME || os.homedir(),
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
            AUTH0_CLI_PATH: process.env.AUTH0_CLI_PATH || ''
          },
          cwd: scriptDir // Set the cwd to the script's directory for better relative path resolution
        });
        
        const token = stdout.trim();
        if (token && token.length > 0) {
          log(`Successfully got token using script (length: ${token.length})`);
          if (token.length > 10) {
            log(`Token preview: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
          }
          return { token };
        } else {
          log('Empty token returned from script');
        }
      } else {
        log(`Script not found at ${scriptPath}`);
      }
    } catch (scriptError: any) {
      log(`Error using token script: ${scriptError.message}`);
      if (scriptError.stderr) {
        log(`Script error output: ${scriptError.stderr}`);
      }
    }
    
    // Check if we have a specific CLI path in the environment
    const cliPath = process.env.AUTH0_CLI_PATH;
    if (cliPath) {
      log(`AUTH0_CLI_PATH environment variable found: ${cliPath}`);
      
      // Check if the file exists
      if (fs.existsSync(cliPath)) {
        log(`File exists at ${cliPath}`);
        
        try {
          // Use the specified path directly with explicit HOME environment variable
          const { stdout } = await execAsync(`${cliPath} api get-token`, {
            env: {
              ...process.env,
              HOME: process.env.HOME || os.homedir()
            }
          });
          const token = stdout.trim();
          
          if (token && token.length > 0) {
            log(`Successfully got token using AUTH0_CLI_PATH (length: ${token.length})`);
            if (token.length > 10) {
              log(`Token preview: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
            }
            return { token };
          } else {
            log(`Empty token returned from ${cliPath}`);
          }
        } catch (envPathError: any) {
          log(`Failed to use AUTH0_CLI_PATH: ${envPathError.message}`);
          // Try to read the error output if available
          if (envPathError.stderr) {
            log(`Error output: ${envPathError.stderr}`);
          }
        }
      } else {
        log(`AUTH0_CLI_PATH points to non-existent file: ${cliPath}`);
      }
    }
    
    // Log environment variables for debugging
    log('Environment variables:');
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('AUTH0_') || key === 'HOME' || key === 'PATH') {
        log(`${key}: ${key === 'AUTH0_TOKEN' ? '[REDACTED]' : value}`);
      }
    }
    
    // Try to directly copy the config file to a known location
    try {
      const homeDir = os.homedir();
      const sourceConfigPath = path.join(homeDir, '.config', 'auth0', 'config.json');
      const tempConfigPath = path.join(os.tmpdir(), 'auth0_config.json');
      
      log(`Checking for config at: ${sourceConfigPath}`);
      if (fs.existsSync(sourceConfigPath)) {
        log(`Found config at ${sourceConfigPath}, copying to ${tempConfigPath}`);
        fs.copyFileSync(sourceConfigPath, tempConfigPath);
        
        // Try using auth0-cli with explicit config path
        try {
          if (cliPath) {
            const { stdout } = await execAsync(`${cliPath} api get-token --config ${tempConfigPath}`, {
              env: {
                ...process.env,
                HOME: process.env.HOME || os.homedir()
              }
            });
            const token = stdout.trim();
            
            if (token && token.length > 0) {
              log(`Successfully got token using explicit config path (length: ${token.length})`);
              return { token };
            }
          }
        } catch (explicitConfigError: any) {
          log(`Failed with explicit config path: ${explicitConfigError.message}`);
        }
      } else {
        log(`Source config not found at ${sourceConfigPath}`);
      }
    } catch (configCopyError) {
      log(`Error copying config file: ${configCopyError}`);
    }
    
    // Try to directly extract the token from the config file
    try {
      const homeDir = os.homedir();
      const configPath = path.join(homeDir, '.config', 'auth0', 'config.json');
      
      if (fs.existsSync(configPath)) {
        log(`Attempting to extract token directly from ${configPath}`);
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (configData.default_tenant && configData.tenants && configData.tenants[configData.default_tenant]) {
          const tenant = configData.tenants[configData.default_tenant];
          if (tenant.access_token) {
            log('Found token directly in config file');
            return { token: tenant.access_token };
          }
        }
      }
    } catch (directExtractError) {
      log(`Error extracting token directly from config: ${directExtractError}`);
    }
    
    // Try with the command directly (should use PATH)
    try {
      log('Trying with direct command (uses PATH)');
      const { stdout } = await execAsync('auth0 api get-token', {
        env: {
          ...process.env,
          HOME: process.env.HOME || os.homedir()
        }
      });
      const token = stdout.trim();
      
      if (token && token.length > 0) {
        log(`Successfully got token using PATH (length: ${token.length})`);
        if (token.length > 10) {
          log(`Token preview: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
        }
        return { token };
      }
    } catch (directError: any) {
      log('Failed with direct command:', directError.message);
    }
    
    // Try with explicit path as fallback
    log('Attempting with specific paths to auth0-cli');
    // Try a few common locations, using the absolute path
    const possiblePaths = [
      '/Users/bharath/dev/mcp/auth0-cli/auth0',
      path.join(os.homedir(), 'dev', 'mcp', 'auth0-cli', 'auth0'),
      './auth0',
      path.resolve(process.cwd(), 'auth0'),
      path.resolve(process.cwd(), '..', 'auth0-cli', 'auth0')
    ];
    
    for (const possibleCliPath of possiblePaths) {
      try {
        log(`Trying with path: ${possibleCliPath}`);
        // Check if file exists first
        if (fs.existsSync(possibleCliPath)) {
          log(`File exists at ${possibleCliPath}`);
          const { stdout } = await execAsync(`${possibleCliPath} api get-token`, {
            env: {
              ...process.env,
              HOME: process.env.HOME || os.homedir()
            }
          });
          const token = stdout.trim();
          
          if (token && token.length > 0) {
            log(`Successfully got token using path: ${possibleCliPath} (length: ${token.length})`);
            return { token };
          } else {
            log(`Empty token returned from ${possibleCliPath}`);
          }
        } else {
          log(`File does not exist at ${possibleCliPath}`);
        }
      } catch (pathError: any) {
        log(`Failed with path ${possibleCliPath}:`, pathError.message);
      }
    }
    
    log('All attempts to get token failed');
    return null;
  } catch (e) {
    log('Error in getTokenFromCLI:', e);
    return null;
  }
}

// Helper function to validate config
export function validateConfig(config: Auth0Config | null): config is Auth0Config {
  if (!config) {
    log('Configuration is null');
    return false;
  }
  
  if (!config.token) {
    log('Auth0 token is missing');
    return false;
  }
  
  if (!config.domain) {
    log('Auth0 domain is missing');
    return false;
  }
  
  return true;
}