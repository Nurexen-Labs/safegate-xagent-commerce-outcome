export declare const SDK_VERSION: "0.3.0";
export declare const MCP_PROTOCOL_VERSION: "2026-07-28";

export interface SafeGateClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface SafeGateAssurance {
  level: "CLAIMED" | "OBSERVED" | "VALIDATED" | "THIRD_PARTY_ATTESTED" | string;
  payment?: string;
  payment_binding?: string;
  fulfillment?: string;
  independently_validated?: boolean;
  limitation?: string;
}

export interface SafeGateVerificationResult {
  ok: boolean;
  capability: string;
  version: string;
  decision: string;
  commerce_verified: boolean;
  assurance: SafeGateAssurance;
  adapter: Record<string, unknown>;
  verification: Record<string, unknown>;
}

export declare class SafeGateError extends Error {
  code: string;
  status: number;
  details: unknown;
}

export declare class SafeGateClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options: SafeGateClientOptions);

  getVerifyCapability(): Promise<Record<string, unknown>>;

  verifyCommerce(
    attestation: Record<string, unknown>
  ): Promise<SafeGateVerificationResult>;

  getMiddlewareCapability(): Promise<Record<string, unknown>>;

  mcpDiscover(): Promise<Record<string, unknown>>;

  mcpListTools(): Promise<Record<string, unknown>>;

  mcpVerifyCommerce(
    attestation: Record<string, unknown>
  ): Promise<SafeGateVerificationResult>;
}

export declare function createSafeGateClient(
  options: SafeGateClientOptions
): SafeGateClient;