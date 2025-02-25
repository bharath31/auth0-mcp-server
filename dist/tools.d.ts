export interface Tool {
    name: string;
    description: string;
    inputSchema?: Record<string, any>;
}
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
export declare const TOOLS: Tool[];
export declare const HANDLERS: Record<string, (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>>;
