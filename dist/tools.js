import fetch from 'node-fetch';
import debug from 'debug';
// Set up debug logger
const log = debug('auth0-mcp:tools');
// Make sure debug output goes to stderr
debug.log = (...args) => {
    const msg = args.join(' ');
    process.stderr.write(msg + '\n');
    return true;
};
// Define all available tools
export const TOOLS = [
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
export const HANDLERS = {
    auth0_list_applications: async (request, config) => {
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
            }
            else {
                log('Warning: Token is empty or undefined');
            }
            // Build query parameters
            const params = new URLSearchParams();
            if (request.parameters.page !== undefined) {
                params.append('page', request.parameters.page.toString());
            }
            if (request.parameters.per_page !== undefined) {
                params.append('per_page', request.parameters.per_page.toString());
            }
            else {
                // Default to 10 items per page if not specified
                params.append('per_page', '10');
            }
            if (request.parameters.include_totals !== undefined) {
                params.append('include_totals', request.parameters.include_totals.toString());
            }
            else {
                // Default to include totals
                params.append('include_totals', 'true');
            }
            // Full URL for debugging
            const apiUrl = `https://${domain}/api/v2/clients?${params.toString()}`;
            log(`Making API request to ${apiUrl}`);
            try {
                // Make API request to Auth0 Management API with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                const response = await fetch(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${request.token}`,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const errorText = await response.text();
                    log(`API request failed with status ${response.status}: ${errorText}`);
                    let errorMessage = `Failed to list applications: ${response.status} ${response.statusText}`;
                    // Add more context based on common error codes
                    if (response.status === 401) {
                        errorMessage += '\nError: Unauthorized. Your token might be expired or invalid. Try running "auth0 login" to refresh your token.';
                    }
                    else if (response.status === 403) {
                        errorMessage += '\nError: Forbidden. Your token might not have the required scopes (read:clients). Try running "auth0 login --scopes read:clients" to get the proper permissions.';
                    }
                    else if (response.status === 404) {
                        errorMessage += '\nError: Not Found. The Auth0 domain may be incorrect or the API endpoint may have changed.';
                    }
                    else if (response.status >= 500) {
                        errorMessage += '\nError: Server error. The Auth0 service might be experiencing issues. Please try again later.';
                    }
                    if (errorText) {
                        errorMessage += `\nDetails: ${errorText}`;
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
                const applications = await response.json();
                log(`Successfully retrieved ${Array.isArray(applications) ? applications.length : 'unknown'} applications`);
                // Format the response in a more user-friendly way
                let result;
                if (Array.isArray(applications)) {
                    result = applications;
                }
                else if (applications.clients && Array.isArray(applications.clients)) {
                    // Handle the case where the response includes pagination info
                    result = {
                        clients: applications.clients,
                        total: applications.total,
                        page: applications.page,
                        per_page: applications.per_page,
                        total_pages: Math.ceil(applications.total / applications.per_page)
                    };
                }
                else {
                    result = applications;
                }
                return {
                    toolResult: {
                        content: [{
                                type: 'application/json',
                                json: result
                            }],
                        isError: false
                    }
                };
            }
            catch (fetchError) {
                // Handle network-specific errors
                log('Fetch error:', fetchError);
                let errorMessage = 'Network error occurred while connecting to Auth0';
                if (fetchError.name === 'AbortError') {
                    errorMessage = 'Request timed out after 10 seconds. The Auth0 API may be slow or unreachable.';
                }
                else if (fetchError.code === 'ENOTFOUND') {
                    errorMessage = `DNS lookup failed for domain "${domain}". Please check your internet connection and the domain name.`;
                }
                else if (fetchError.code === 'ECONNREFUSED') {
                    errorMessage = 'Connection refused. The Auth0 server may be down or blocking requests.';
                }
                else if (fetchError.code === 'ETIMEDOUT') {
                    errorMessage = 'Connection timed out. Check your network connectivity or firewall settings.';
                }
                else if (fetchError.code === 'CERT_HAS_EXPIRED') {
                    errorMessage = 'SSL certificate error. The Auth0 API SSL certificate may have issues.';
                }
                else {
                    errorMessage = `Network error: ${fetchError.message || String(fetchError)}`;
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
        }
        catch (error) {
            // General error handling
            log('Error in auth0_list_applications handler:', error);
            let errorMessage = 'An unexpected error occurred';
            if (error instanceof Error) {
                errorMessage = `${error.name}: ${error.message}`;
                if (error.stack) {
                    log('Error stack:', error.stack);
                }
            }
            else if (typeof error === 'string') {
                errorMessage = error;
            }
            else {
                errorMessage = JSON.stringify(error);
            }
            return {
                toolResult: {
                    content: [{
                            type: 'text',
                            text: `Error listing applications: ${errorMessage}`
                        }],
                    isError: true
                }
            };
        }
    }
};
//# sourceMappingURL=tools.js.map