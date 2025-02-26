import { Tool, HandlerRequest, HandlerConfig, HandlerResponse } from './tools-common.js';
import { APPLICATION_TOOLS, APPLICATION_HANDLERS } from './tools-applications.js';
import { RESOURCE_SERVER_TOOLS, RESOURCE_SERVER_HANDLERS } from './tools-resource-servers.js';
import { ACTION_TOOLS, ACTION_HANDLERS } from './tools-actions.js';
import { LOG_TOOLS, LOG_HANDLERS } from './tools-logs.js';
import { FORM_TOOLS, FORM_HANDLERS } from './tools-forms.js';

// Set up debug logger
import { log } from './tools-common.js';

// Combine all tools into a single array
export const TOOLS: Tool[] = [
  ...APPLICATION_TOOLS,
  ...RESOURCE_SERVER_TOOLS,
  ...ACTION_TOOLS,
  ...LOG_TOOLS,
  ...FORM_TOOLS
];

// Combine all handlers into a single record
export const HANDLERS: Record<string, (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>> = {
  ...APPLICATION_HANDLERS,
  ...RESOURCE_SERVER_HANDLERS,
  ...ACTION_HANDLERS,
  ...LOG_HANDLERS,
  ...FORM_HANDLERS
}; 