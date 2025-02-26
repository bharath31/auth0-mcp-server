import { APPLICATION_TOOLS, APPLICATION_HANDLERS } from './tools-applications.js';
import { RESOURCE_SERVER_TOOLS, RESOURCE_SERVER_HANDLERS } from './tools-resource-servers.js';
import { ACTION_TOOLS, ACTION_HANDLERS } from './tools-actions.js';
import { LOG_TOOLS, LOG_HANDLERS } from './tools-logs.js';
// Combine all tools into a single array
export const TOOLS = [
    ...APPLICATION_TOOLS,
    ...RESOURCE_SERVER_TOOLS,
    ...ACTION_TOOLS,
    ...LOG_TOOLS
];
// Combine all handlers into a single record
export const HANDLERS = {
    ...APPLICATION_HANDLERS,
    ...RESOURCE_SERVER_HANDLERS,
    ...ACTION_HANDLERS,
    ...LOG_HANDLERS
};
//# sourceMappingURL=tools.js.map