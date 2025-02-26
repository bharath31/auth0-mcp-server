# Auth0 MCP Server

A Model Context Protocol (MCP) server implementation for integrating Auth0 Management API with Claude Desktop.

## Overview

This server allows Claude to interact with your Auth0 tenant using the Auth0 Management API. It implements the MCP protocol to provide Claude with tools for listing applications, users, and more.

## Features

- Secure authentication with Auth0 Management API
- Tools for interacting with Auth0 resources
- Detailed logging and error handling
- Easy integration with Claude Desktop

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/auth0-mcp-server.git
cd auth0-mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

## Configuration

The server uses Auth0 CLI for authentication. Make sure you have Auth0 CLI installed and configured:

```bash
# Install Auth0 CLI
npm install -g auth0-cli

# Login to Auth0
auth0 login
```

Alternatively, you can provide credentials directly:

```bash
# Start the server with domain and token
npm start -- your-tenant.auth0.com your-api-token
```

## Usage

### Starting the server

```bash
# Start the server
npm start
```

### Debugging

```bash
# Start with debug logging
npm run debug-server
```

### Testing

```bash
# Run the connection test
npm test
```

## Directory Structure

```
.
├── bin/                # Executable scripts
├── dist/               # Compiled TypeScript output
├── docs/               # Documentation
├── examples/           # Example scripts
├── logs/               # Log files
├── src/                # Source code
├── test/               # Test files
└── utils/              # Utility scripts
```

## License

ISC

## Additional Documentation

- [Simplified Usage](./SIMPLIFIED_USAGE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Connection Plan](./CONNECTION_PLAN.md) 