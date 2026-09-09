# @safegate/sdk

SafeGate SDK for programmable commerce verification and agent tooling.

SafeGate is an assurance layer for programmable commerce.

Included surfaces:

- Public Verify API
- Middleware capability discovery
- MCP server discovery
- MCP tool discovery
- MCP commerce verification

SafeGate does not process payments, hold funds, or provide custody.

Install:

    npm install @safegate/sdk

CommonJS example:

    const { SafeGateClient } = require("@safegate/sdk");

    const safegate = new SafeGateClient({
      baseUrl: "https://YOUR-SAFEGATE-ENDPOINT"
    });

    const result = await safegate.verifyCommerce(attestation);

MCP example:

    const discovery = await safegate.mcpDiscover();
    const tools = await safegate.mcpListTools();
    const result = await safegate.mcpVerifyCommerce(attestation);

Current MCP protocol target:

    2026-07-28

Current MCP tool:

    safegate_verify_commerce

Important assurance semantics:

- CLAIMED is not independently validated.
- OBSERVED means SafeGate observed execution evidence.
- VALIDATED requires an independent validation mechanism.
- Payment verification alone does not prove fulfillment.