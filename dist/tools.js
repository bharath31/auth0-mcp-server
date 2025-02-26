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
function handleNetworkError(error) {
    if (error.name === 'AbortError') {
        return 'Request timed out. The Auth0 API did not respond in time.';
    }
    else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return `Connection failed: Unable to reach the Auth0 API (${error.code}). Check your network connection.`;
    }
    else if (error.code === 'ECONNRESET') {
        return 'Connection was reset by the server. Try again later.';
    }
    else {
        return `Network error: ${error.message || error}`;
    }
}
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
    },
    {
        name: 'auth0_get_application',
        description: 'Get details about a specific Auth0 application',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Client ID of the application to retrieve' }
            },
            required: ['client_id']
        }
    },
    {
        name: 'auth0_create_application',
        description: 'Create a new Auth0 application',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the application' },
                app_type: {
                    type: 'string',
                    description: 'Type of application (native, spa, regular_web, non_interactive)',
                    enum: ['native', 'spa', 'regular_web', 'non_interactive']
                },
                description: { type: 'string', description: 'Description of the application' },
                callbacks: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Allowed callback URLs'
                },
                allowed_origins: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Allowed origins for CORS'
                }
            },
            required: ['name', 'app_type']
        }
    },
    {
        name: 'auth0_update_application',
        description: 'Update an existing Auth0 application',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Client ID of the application to update' },
                name: { type: 'string', description: 'New name of the application' },
                description: { type: 'string', description: 'New description of the application' },
                callbacks: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'New allowed callback URLs'
                },
                allowed_origins: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'New allowed origins for CORS'
                }
            },
            required: ['client_id']
        }
    },
    {
        name: 'auth0_delete_application',
        description: 'Delete an Auth0 application',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Client ID of the application to delete' }
            },
            required: ['client_id']
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
                // Default to 5 items per page if not specified (reduced from 10 to make output more manageable)
                params.append('per_page', '5');
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
                    }
                    else if (response.status === 403) {
                        errorMessage += '\nError: Forbidden. Your token might not have the required scopes (read:clients). Try running "auth0 login --scopes read:clients" to get the proper permissions.';
                    }
                    else if (response.status === 429) {
                        errorMessage += '\nError: Rate limited. You have made too many requests to the Auth0 API. Please try again later.';
                    }
                    else if (response.status >= 500) {
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
                const responseData = await response.json();
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
                log(`Successfully retrieved ${applications.length} applications (page ${page + 1} of ${totalPages}, total: ${total})`);
                // Create table format
                let resultText = `### Auth0 Applications (${applications.length}/${total})\n\n`;
                resultText += '| Name | Type | Description | Domain |\n';
                resultText += '|------|------|-------------|--------|\n';
                applications.forEach(app => {
                    resultText += `| ${app.name} | ${app.type} | ${app.description || '-'} | ${app.domain || '-'} |\n`;
                });
                // Add pagination info
                if (totalPages > 1) {
                    resultText += `\n*Page ${page + 1} of ${totalPages} (${perPage} items per page)*`;
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
            }
            catch (fetchError) {
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
        }
        catch (error) {
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
    },
    auth0_get_application: async (request, config) => {
        try {
            if (!config.domain) {
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
            const clientId = request.parameters.client_id;
            if (!clientId) {
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: 'Error: client_id is required'
                            }],
                        isError: true
                    }
                };
            }
            // Ensure domain is properly formatted
            const domain = config.domain.includes('.') ? config.domain : `${config.domain}.us.auth0.com`;
            // API URL for getting an application
            const apiUrl = `https://${domain}/api/v2/clients/${clientId}`;
            log(`Making API request to ${apiUrl}`);
            try {
                // Make API request to Auth0 Management API
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
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
                    let errorMessage = `Failed to get application: ${response.status} ${response.statusText}`;
                    if (response.status === 404) {
                        errorMessage = `Application with client_id '${clientId}' not found.`;
                    }
                    else if (response.status === 401) {
                        errorMessage += '\nError: Unauthorized. Your token might be expired or invalid or missing read:clients scope.';
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
                const application = await response.json();
                // Format application details in markdown
                let resultText = `### Application: ${application.name}\n\n`;
                resultText += `- **Client ID**: ${application.client_id}\n`;
                resultText += `- **Type**: ${application.app_type || 'Not specified'}\n`;
                resultText += `- **Description**: ${application.description || 'No description'}\n\n`;
                if (application.client_secret) {
                    resultText += `- **Client Secret**: \`${application.client_secret}\`\n\n`;
                }
                if (application.callbacks && application.callbacks.length) {
                    resultText += `#### Callback URLs\n\n`;
                    application.callbacks.forEach((url) => {
                        resultText += `- ${url}\n`;
                    });
                    resultText += '\n';
                }
                if (application.allowed_origins && application.allowed_origins.length) {
                    resultText += `#### Allowed Origins\n\n`;
                    application.allowed_origins.forEach((url) => {
                        resultText += `- ${url}\n`;
                    });
                    resultText += '\n';
                }
                log(`Successfully retrieved application: ${application.name} (${application.client_id})`);
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: resultText
                            }],
                        isError: false
                    }
                };
            }
            catch (fetchError) {
                // Handle network-specific errors
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
        }
        catch (error) {
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
    },
    auth0_create_application: async (request, config) => {
        try {
            if (!config.domain) {
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
            const { name, app_type, description, callbacks, allowed_origins } = request.parameters;
            if (!name) {
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: 'Error: name is required'
                            }],
                        isError: true
                    }
                };
            }
            if (!app_type) {
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: 'Error: app_type is required'
                            }],
                        isError: true
                    }
                };
            }
            // Ensure domain is properly formatted
            const domain = config.domain.includes('.') ? config.domain : `${config.domain}.us.auth0.com`;
            // API URL for creating an application
            const apiUrl = `https://${domain}/api/v2/clients`;
            log(`Making API request to ${apiUrl}`);
            // Prepare request body
            const requestBody = {
                name,
                app_type,
                description,
                callbacks,
                allowed_origins
            };
            try {
                // Make API request to Auth0 Management API
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${request.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const errorText = await response.text();
                    log(`API request failed with status ${response.status}: ${errorText}`);
                    let errorMessage = `Failed to create application: ${response.status} ${response.statusText}`;
                    if (response.status === 401) {
                        errorMessage += '\nError: Unauthorized. Your token might be expired or invalid or missing create:clients scope.';
                    }
                    else if (response.status === 422) {
                        errorMessage += '\nError: Validation errors in your request. Check that your parameters are valid.';
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
                const newApplication = await response.json();
                // Format application details in markdown
                let resultText = `### Application Created Successfully\n\n`;
                resultText += `- **Name**: ${newApplication.name}\n`;
                resultText += `- **Client ID**: ${newApplication.client_id}\n`;
                resultText += `- **Type**: ${newApplication.app_type || 'Not specified'}\n`;
                resultText += `- **Description**: ${newApplication.description || 'No description'}\n\n`;
                if (newApplication.client_secret) {
                    resultText += `- **Client Secret**: \`${newApplication.client_secret}\`\n\n`;
                    resultText += `⚠️ **Important**: Save the client secret as it won't be accessible again.\n\n`;
                }
                if (newApplication.callbacks && newApplication.callbacks.length) {
                    resultText += `#### Callback URLs\n\n`;
                    newApplication.callbacks.forEach((url) => {
                        resultText += `- ${url}\n`;
                    });
                    resultText += '\n';
                }
                log(`Successfully created application: ${newApplication.name} (${newApplication.client_id})`);
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: resultText
                            }],
                        isError: false
                    }
                };
            }
            catch (fetchError) {
                // Handle network-specific errors
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
        }
        catch (error) {
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
    },
    auth0_update_application: async (request, config) => {
        try {
            if (!config.domain) {
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
            const clientId = request.parameters.client_id;
            if (!clientId) {
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: 'Error: client_id is required'
                            }],
                        isError: true
                    }
                };
            }
            // Extract other parameters to update
            const { name, description, callbacks, allowed_origins } = request.parameters;
            // Prepare update body, only including fields that are present
            const updateBody = {};
            if (name !== undefined)
                updateBody.name = name;
            if (description !== undefined)
                updateBody.description = description;
            if (callbacks !== undefined)
                updateBody.callbacks = callbacks;
            if (allowed_origins !== undefined)
                updateBody.allowed_origins = allowed_origins;
            // Ensure domain is properly formatted
            const domain = config.domain.includes('.') ? config.domain : `${config.domain}.us.auth0.com`;
            // API URL for updating an application
            const apiUrl = `https://${domain}/api/v2/clients/${clientId}`;
            log(`Making API request to ${apiUrl}`);
            try {
                // Make API request to Auth0 Management API
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(apiUrl, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${request.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const errorText = await response.text();
                    log(`API request failed with status ${response.status}: ${errorText}`);
                    let errorMessage = `Failed to update application: ${response.status} ${response.statusText}`;
                    if (response.status === 404) {
                        errorMessage = `Application with client_id '${clientId}' not found.`;
                    }
                    else if (response.status === 401) {
                        errorMessage += '\nError: Unauthorized. Your token might be expired or invalid or missing update:clients scope.';
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
                const updatedApplication = await response.json();
                // Format application details in markdown
                let resultText = `### Application Updated Successfully\n\n`;
                resultText += `- **Name**: ${updatedApplication.name}\n`;
                resultText += `- **Client ID**: ${updatedApplication.client_id}\n`;
                resultText += `- **Type**: ${updatedApplication.app_type || 'Not specified'}\n`;
                resultText += `- **Description**: ${updatedApplication.description || 'No description'}\n\n`;
                if (updatedApplication.callbacks && updatedApplication.callbacks.length) {
                    resultText += `#### Callback URLs\n\n`;
                    updatedApplication.callbacks.forEach((url) => {
                        resultText += `- ${url}\n`;
                    });
                    resultText += '\n';
                }
                log(`Successfully updated application: ${updatedApplication.name} (${updatedApplication.client_id})`);
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: resultText
                            }],
                        isError: false
                    }
                };
            }
            catch (fetchError) {
                // Handle network-specific errors
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
        }
        catch (error) {
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
    },
    auth0_delete_application: async (request, config) => {
        try {
            if (!config.domain) {
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
            const clientId = request.parameters.client_id;
            if (!clientId) {
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: 'Error: client_id is required'
                            }],
                        isError: true
                    }
                };
            }
            // Ensure domain is properly formatted
            const domain = config.domain.includes('.') ? config.domain : `${config.domain}.us.auth0.com`;
            // API URL for deleting an application
            const apiUrl = `https://${domain}/api/v2/clients/${clientId}`;
            log(`Making API request to ${apiUrl}`);
            try {
                // Make API request to Auth0 Management API
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(apiUrl, {
                    method: 'DELETE',
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
                    let errorMessage = `Failed to delete application: ${response.status} ${response.statusText}`;
                    if (response.status === 404) {
                        errorMessage = `Application with client_id '${clientId}' not found.`;
                    }
                    else if (response.status === 401) {
                        errorMessage += '\nError: Unauthorized. Your token might be expired or invalid or missing delete:clients scope.';
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
                // Delete operations typically return 204 No Content
                let resultText = `### Application Deleted Successfully\n\n`;
                resultText += `Application with client_id '${clientId}' has been deleted.`;
                log(`Successfully deleted application with client_id: ${clientId}`);
                return {
                    toolResult: {
                        content: [{
                                type: 'text',
                                text: resultText
                            }],
                        isError: false
                    }
                };
            }
            catch (fetchError) {
                // Handle network-specific errors
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
        }
        catch (error) {
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
//# sourceMappingURL=tools.js.map