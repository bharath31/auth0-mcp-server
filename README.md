# Auth0 MCP Server

A Model Context Protocol (MCP) server for interacting with Auth0 Management APIs from Claude Desktop.

## Overview

This server implements the Model Context Protocol to expose Auth0 Management API operations as tools that can be used by Claude Desktop. It allows Claude to perform Auth0 operations on your behalf, enabling you to have AI-assisted Auth0 tenant management.

## Features

- Automatically loads credentials from auth0-cli configuration
- MCP-compliant tool implementation for Auth0 operations
- Seamless integration with Claude Desktop

## Prerequisites

- Node.js 16 or higher
- auth0-cli
- An Auth0 account

## Installation

### Recommended: Using auth0-cli

The easiest way to install and configure the Auth0 MCP server is to use the auth0-cli:

```bash
# Install auth0-cli if you haven't already
npm install -g auth0-cli

# Log in to your Auth0 account
auth0 login

# Initialize the Auth0 MCP server for Claude Desktop
auth0 mcp init
```

This will:
1. Install the Auth0 MCP server globally
2. Configure Claude Desktop to use it
3. Set up the connection to use your auth0-cli credentials

### Manual Installation

If you prefer a manual installation:

```bash
# Install the server globally
npm install -g auth0-mcp-server

# Configure Claude Desktop (see Connecting with Claude Desktop section)
```

## Authentication

The server automatically uses your auth0-cli credentials. To update or refresh these credentials:

```bash
# Log in to Auth0
auth0 login

# Reinitialize the MCP server configuration
auth0 mcp init
```

## Usage

### Starting the server

The server is automatically started by Claude Desktop when needed.

### Connecting with Claude Desktop

If you used `auth0 mcp init`, Claude Desktop is already configured. Otherwise:

1. Start Claude Desktop
2. Go to Settings > Extensions
3. Click "Add" under "Local Server Connections"
4. Enter a name (e.g., "Auth0")
5. Enter the command to start the server: `node /path/to/global/auth0-mcp-server/dist/index.js run`
6. Save the configuration

You can now ask Claude about your Auth0 tenant and use it to help manage your Auth0 resources.

## Available Tools

- **auth0_list_applications**: List all applications in your Auth0 tenant

## Troubleshooting

- **Invalid or expired token**: Run `auth0 login` followed by `auth0 mcp init` to refresh your token
- **Configuration not found**: Ensure you've logged in with auth0-cli
- **Connection issues**: Check your network connection and Auth0 domain

## License

MIT 