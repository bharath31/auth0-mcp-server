import { APPLICATION_TOOLS, APPLICATION_HANDLERS } from './tools-applications.js';
import { RESOURCE_SERVER_TOOLS, RESOURCE_SERVER_HANDLERS } from './tools-resource-servers.js';
// Combine all tools into a single array
export const TOOLS = [
    ...APPLICATION_TOOLS,
    ...RESOURCE_SERVER_TOOLS
];
// Combine all handlers into a single record
export const HANDLERS = {
    ...APPLICATION_HANDLERS,
    ...RESOURCE_SERVER_HANDLERS
};
//# sourceMappingURL=tools.js.map