// Type shim for @replit/oidc-provider v8 (CommonJS fork of oidc-provider).
// The package ships as CJS (dist/index.cjs) but has no type declarations.
// This shim declares the surface we use.

declare module '@replit/oidc-provider' {
  import { NextFunction, Request, Response } from 'express';

  interface ProviderOptions {
    clients?: Array<{
      client_id: string;
      client_secret?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      response_types?: string[];
      token_endpoint_auth_method?: string;
      [key: string]: unknown;
    }>;
    pkce?: { required?: () => boolean };
    features?: Record<string, unknown>;
    claims?: Record<string, string[]>;
    cookies?: Record<string, unknown>;
    ttl?: Record<string, number>;
    scopes?: string[];
    adapter?: unknown;
    jwks?: unknown;
    [key: string]: unknown;
  }

  export default class Provider {
    constructor(issuer: string, configuration?: ProviderOptions);
    callback(): (
      req: Request,
      res: Response,
      next?: NextFunction,
    ) => void;
    on(
      event: string,
      listener: (ctx: unknown, err: unknown) => void,
    ): this;
  }
}