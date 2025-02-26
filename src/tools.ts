import fetch from 'node-fetch';
import debug from 'debug';

// Set up debug logger
const log = debug('auth0-mcp:tools');

// Make debug more verbose for network operations
const httpLog = debug('auth0-mcp:http');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = args.join(' ');
  process.stderr.write(msg + '\n');
  return true;
};

// Add network error handling utility
function handleNetworkError(error: any): string {
  if (error.name === 'AbortError') {
    return 'Request timed out. The Auth0 API did not respond in time.';
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return `Connection failed: Unable to reach the Auth0 API (${error.code}). Check your network connection.`;
  } else if (error.code === 'ECONNRESET') {
    return 'Connection was reset by the server. Try again later.';
  } else {
    return `Network error: ${error.message || error}`;
  }
}

// Define Tool interface
export interface Tool {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

// Define Handler interface
export interface HandlerRequest {
  token: string;
  parameters: Record<string, any>;
}

export interface HandlerConfig {
  domain: string | undefined;
}

export interface ToolResult {
  content: Array<{
    type: string;
    [key: string]: any;
  }>;
  isError: boolean;
}

export interface HandlerResponse {
  toolResult: ToolResult;
}

// Auth0 response interfaces
interface Auth0Application {
  client_id: string;
  name: string;
  [key: string]: any;
}

interface Auth0PaginatedResponse {
  clients?: Auth0Application[];
  total?: number;
  page?: number;
  per_page?: number;
  [key: string]: any;
}

// Define all available tools
export const TOOLS: Tool[] = [
  {
    name: 'auth0_list_applications',
    description: 'List all applications in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of applications per page' },
        include_totals: { type: 'boolean', description: 'Include total count' }
      }
    }
  }
];

// Define handlers for each tool
export const HANDLERS: Record<string, (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>> = {
  auth0_list_applications: async (request: HandlerRequest, config: HandlerConfig): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        log('Error: AUTH0_DOMAIN environment variable is not set');
        return {
          toolResult: {
            content: [{
              type: 'text',
              text: 'Error: AUTH0_DOMAIN environment variable is not set'
            }],
            isError: true
          }
        };
      }

      // Ensure domain is properly formatted
      const domain = config.domain.includes('.') ? config.domain : `${config.domain}.us.auth0.com`;
      
      // Log token info without exposing the full token
      const tokenLength = request.token ? request.token.length : 0;
      log(`Token information - Length: ${tokenLength}`);
      if (tokenLength > 0) {
        log(`Token preview: ${request.token.substring(0, 5)}...${request.token.substring(tokenLength - 5)}`);
      } else {
        log('Warning: Token is empty or undefined');
      }
      
      // Build query parameters
      const params = new URLSearchParams();
      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }
      if (request.parameters.per_page !== undefined) {
        params.append('per_page', request.parameters.per_page.toString());
      } else {
        // Default to 5 items per page if not specified (reduced from 10 to make output more manageable)
        params.append('per_page', '5');
      }
      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // Full URL for debugging
      const apiUrl = `https://${domain}/api/v2/clients?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);
      
      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15 second timeout
        
        // Log headers (without sensitive info)
        httpLog(`Request headers: ${JSON.stringify({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer [TOKEN_REDACTED]'
        })}`);
          
        // Detailed fetch implementation with more logging
        httpLog(`Starting network request to ${apiUrl}`);
        const startTime = Date.now();
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${request.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        const elapsed = Date.now() - startTime;
        httpLog(`Request completed in ${elapsed}ms with status ${response.status}`);
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);
          
          let errorMessage = `Failed to list applications: ${response.status} ${response.statusText}`;
          
          // Add more context based on common error codes
          if (response.status === 401) {
            errorMessage += '\nError: Unauthorized. Your token might be expired or invalid. Try running "auth0 login" to refresh your token.';
          } else if (response.status === 403) {
            errorMessage += '\nError: Forbidden. Your token might not have the required scopes (read:clients). Try running "auth0 login --scopes read:clients" to get the proper permissions.';
          } else if (response.status === 429) {
            errorMessage += '\nError: Rate limited. You have made too many requests to the Auth0 API. Please try again later.';
          } else if (response.status >= 500) {
            errorMessage += '\nError: Auth0 server error. The Auth0 API might be experiencing issues. Please try again later.';
          }
          
          return {
            toolResult: {
              content: [{
                type: 'text',
                text: errorMessage
              }],
              isError: true
            }
          };
        }
        
        // Parse the response
        httpLog('Parsing response body');
        const parseStartTime = Date.now();
        const responseData = await response.json() as Auth0PaginatedResponse;
        const parseElapsed = Date.now() - parseStartTime;
        httpLog(`Response parsed in ${parseElapsed}ms`);
        
        if (!responseData.clients || !Array.isArray(responseData.clients)) {
          log('Invalid response format - missing clients array');
          log('Response data:', responseData);
          
          return {
            toolResult: {
              content: [{
                type: 'text',
                text: 'Error: Received invalid response format from Auth0 API. The "clients" array is missing or invalid.'
              }],
              isError: true
            }
          };
        }
        
        // Format applications list
        const applications = responseData.clients.map(app => ({
          id: app.client_id,
          name: app.name,
          type: app.app_type || 'Unknown',
          description: app.description || '-',
          domain: app.callbacks?.length ? app.callbacks[0].split('/')[2] : '-'
        }));
        
        // Get pagination info
        const total = responseData.total || applications.length;
        const page = responseData.page !== undefined ? responseData.page : 0;
        const perPage = responseData.per_page || applications.length;
        const totalPages = Math.ceil(total / perPage);
        
        log(`Successfully retrieved ${applications.length} applications (page ${page+1} of ${totalPages}, total: ${total})`);
        
        // Create table format
        let resultText = `### Auth0 Applications (${applications.length}/${total})\n\n`;
        resultText += '| Name | Type | Description | Domain |\n';
        resultText += '|------|------|-------------|--------|\n';
        
        applications.forEach(app => {
          resultText += `| ${app.name} | ${app.type} | ${app.description || '-'} | ${app.domain || '-'} |\n`;
        });
        
        // Add pagination info
        if (totalPages > 1) {
          resultText += `\n*Page ${page+1} of ${totalPages} (${perPage} items per page)*`;
          resultText += '\n\nTo see more results, use: `auth0_list_applications(page=${nextPage})`';
        }
        
        return {
          toolResult: {
            content: [{
              type: 'text',
              text: resultText
            }],
            isError: false
          }
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        httpLog(`Network error: ${fetchError.message || fetchError}`);
        httpLog('Error details:', fetchError);
        
        const errorMessage = handleNetworkError(fetchError);
        
        return {
          toolResult: {
            content: [{
              type: 'text',
              text: errorMessage
            }],
            isError: true
          }
        };
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);
      
      return {
        toolResult: {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        }
      };
    }
  }
}; 