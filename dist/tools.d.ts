import { Tool, HandlerRequest, HandlerConfig, HandlerResponse } from './tools-common.js';
export declare const TOOLS: Tool[];
export declare const HANDLERS: Record<string, (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>>;
