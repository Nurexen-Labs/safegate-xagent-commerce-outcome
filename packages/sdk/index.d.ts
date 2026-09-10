export declare const SDK_VERSION: "0.4.0";
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

export interface SilentSwapRouteLeg {
  chain?: string | number;
  chainId?: string | number;
  asset: string;
  amount: string | number;
}

export interface SilentSwapMapInput {
  order: Record<string, unknown>;
  state: Record<string, unknown>;
  requestBinding: string;
  source: SilentSwapRouteLeg;
  destination: SilentSwapRouteLeg;
}

export interface SilentSwapExecutionResponse {
  statusCode: number;
  body?: unknown;
}

export interface SilentSwapObservedMiddlewareOptions {
  verifyPayment(
    proof: unknown
  ):
    | Record<string, unknown>
    | Promise<Record<string, unknown>>;

  consumeOnce(
    input: Record<string, unknown>
  ): boolean | Promise<boolean>;

  execute(
    input: Record<string, unknown>
  ):
    | SilentSwapExecutionResponse
    | Promise<SilentSwapExecutionResponse>;

  now?: () => string;
}

export interface SilentSwapObservedCommerceInput
  extends SilentSwapMapInput {

  consumeRouteOnce(
    input: Record<string, unknown>
  ): boolean | Promise<boolean>;

  middlewareInput:
    Record<string, unknown>;

  middlewareOptions:
    SilentSwapObservedMiddlewareOptions;
}

export interface SilentSwapObservedCommerceResult {
  ok: boolean;
  schema: string;
  version: string;
  capability: string;
  decision: string;
  assurance: "OBSERVED";
  commerce_verified: false;
  independently_validated: false;
  route: Record<string, unknown>;
  outcome: Record<string, unknown>;
  sdk_bridge: Record<string, unknown>;
}

export declare const
  SILENTSWAP_SDK_BRIDGE_SCHEMA:
    "SAFEGATE_SILENTSWAP_SDK_BRIDGE_V1";

export declare function
hashSilentSwapOrderReference(
  reference: Record<string, unknown>
): string;

export declare function
mapSilentSwapOrderState(
  input: SilentSwapMapInput
): Record<string, unknown>;

export declare function
executeSilentSwapObservedCommerce(
  input: SilentSwapObservedCommerceInput
): Promise<SilentSwapObservedCommerceResult>;

export declare function
getSilentSwapCapability():
  Record<string, unknown>;
