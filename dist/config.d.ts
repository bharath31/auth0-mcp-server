export interface Auth0Config {
    token: string;
    domain: string;
    tenantName: string;
}
export declare function loadConfig(): Promise<Auth0Config | null>;
export declare function validateConfig(config: Auth0Config | null): config is Auth0Config;
