/**
 * Auth0 Token Service
 *
 * This module provides secure, reliable token retrieval with proper timeouts,
 * caching, and expiration checking.
 */
/**
 * Get an Auth0 token with proper timeout and caching
 */
export declare function getToken(forceRefresh?: boolean): Promise<string>;
