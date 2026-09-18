"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");

const VERSION = "1.0.0";

const SIMULATION_SCHEMA =
  "SAFEGATE_KEEPERHUB_SIMULATION_EVIDENCE_V1";

const EXECUTION_SCHEMA =
  "SAFEGATE_KEEPERHUB_EXECUTION_EVIDENCE_V1";

const BINDING_SCHEMA =
  "SAFEGATE_KEEPERHUB_REQUEST_EXECUTION_BINDING_V1";

const PROOF_SCHEMA =
  "SAFEGATE_KEEPERHUB_COMMERCE_PROOF_V1";

const ENVELOPE_SCHEMA =
  "SAFEGATE_SIGNED_KEEPERHUB_COMMERCE_PROOF_V1";

const SIGNING_STATEMENT_SCHEMA =
  "SAFEGATE_KEEPERHUB_SIGNING_STATEMENT_V1";

const SIGNING_DOMAIN =
  "safegate.keeperhub.execution.v1";

const SECRET_FIELD_NAMES = new Set([
  "authorization",
  "apikey",
  "api_key",
  "bearer",
  "token",
  "secret",
  "privatekey",
  "private_key",
  "mnemonic",
  "seed"
]);

const FORBIDDEN_ASSURANCE_FIELDS = [
  "assurance",
  "commerce_verified",
  "commerceVerified",
  "validated",
  "independently_validated",
  "production_evidence",
  "productionEvidence"
];

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      Buffer.from(
        String(value),
        "utf8"
      )
    )
    .digest("hex");
}

function sha256Canonical(value) {
  return sha256(
    canonicalJson(value)
  );
}

function assertNoSecrets(
  value,
  path = "root",
  seen = new Set()
) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "string") {
    if (
      /^kh_[A-Za-z0-9_-]{6,}$/.test(
        value.trim()
      )
    ) {
      fail(
        "KEEPERHUB_SECRET_VALUE_FORBIDDEN",
        `KeeperHub secret-like value found at ${path}.`
      );
    }

    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  for (
    const [key, child]
    of Object.entries(value)
  ) {
    const normalizedKey =
      String(key)
        .replace(/[-\s]/g, "_")
        .toLowerCase();

    if (
      SECRET_FIELD_NAMES.has(normalizedKey) ||
      SECRET_FIELD_NAMES.has(
        normalizedKey.replace(/_/g, "")
      )
    ) {
      fail(
        "KEEPERHUB_SECRET_FIELD_FORBIDDEN",
        `Forbidden secret field at ${path}.${key}.`
      );
    }

    assertNoSecrets(
      child,
      `${path}.${key}`,
      seen
    );
  }
}

function rejectCallerAssuranceElevation(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_KEEPERHUB_COMMERCE_INPUT"
    );
  }

  for (
    const field
    of FORBIDDEN_ASSURANCE_FIELDS
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field
      )
    ) {
      fail(
        "KEEPERHUB_CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
      );
    }
  }
}

function requireText(
  value,
  code,
  pattern = null
) {
  const text =
    String(value || "").trim();

  if (
    !text ||
    (
      pattern &&
      !pattern.test(text)
    )
  ) {
    fail(code);
  }

  return text;
}

function normalizeRequest(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_KEEPERHUB_REQUEST"
    );
  }

  assertNoSecrets(input);

  const requestId =
    requireText(
      input.requestId ??
      input.request_id,
      "KEEPERHUB_REQUEST_ID_REQUIRED",
      /^[A-Za-z0-9._:-]{8,120}$/
    );

  const method =
    requireText(
      input.method,
      "KEEPERHUB_REQUEST_METHOD_REQUIRED",
      /^(GET|POST|PUT|PATCH|DELETE)$/i
    ).toUpperCase();

  const path =
    requireText(
      input.path,
      "KEEPERHUB_REQUEST_PATH_REQUIRED",
      /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]{0,500}$/
    );

  const body =
    input.body === undefined
      ? null
      : input.body;

  const bodyHash =
    sha256Canonical(body);

  const descriptor = {
    request_id: requestId,
    method,
    path,
    body_hash: bodyHash
  };

  return {
    request_id: requestId,
    method,
    path,
    body,
    body_hash: bodyHash,
    request_hash:
      sha256Canonical(descriptor)
  };
}

function normalizeSimulationResult(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_KEEPERHUB_SIMULATION"
    );
  }

  assertNoSecrets(input);

  if (
    input.success !== true ||
    String(
      input.status || ""
    ).toLowerCase() !== "simulated"
  ) {
    fail(
      "KEEPERHUB_SIMULATION_NOT_SUCCESSFUL"
    );
  }

  if (input.wouldRevert === true) {
    fail(
      "KEEPERHUB_SIMULATION_REVERT"
    );
  }

  const chainCandidate =
    input.chainId ??
    input.chain_id ??
    input.network ??
    null;

  const chainId =
    chainCandidate === null
      ? null
      : Number(chainCandidate);

  return {
    schema:
      SIMULATION_SCHEMA,

    version:
      VERSION,

    source:
      "KEEPERHUB",

    evidence_class:
      "PREEXECUTION_SIMULATION",

    execution_proof:
      false,

    broadcast:
      false,

    success:
      true,

    status:
      "simulated",

    chain_id:
      Number.isInteger(chainId)
        ? chainId
        : null,

    from:
      input.from
        ? String(input.from)
            .toLowerCase()
        : null,

    to:
      input.to
        ? String(input.to)
            .toLowerCase()
        : null,

    value:
      input.value === undefined
        ? null
        : String(input.value),

    gas_estimate:
      input.gasEstimate === undefined
        ? null
        : String(input.gasEstimate),

    would_revert:
      typeof input.wouldRevert ===
      "boolean"
        ? input.wouldRevert
        : null,

    limitation:
      "Simulation is pre-execution evidence only. It is not proof that an onchain execution occurred."
  };
}

function failForReceiptStatus(
  receiptStatus
) {
  if (
    receiptStatus === "reverted" ||
    receiptStatus ===
      "safe_inner_failure"
  ) {
    fail(
      "KEEPERHUB_RECEIPT_REVERTED"
    );
  }

  if (
    receiptStatus === "timeout"
  ) {
    fail(
      "KEEPERHUB_RECEIPT_TIMEOUT"
    );
  }

  if (
    receiptStatus === "not_found"
  ) {
    fail(
      "KEEPERHUB_RECEIPT_NOT_FOUND"
    );
  }

  fail(
    "KEEPERHUB_RECEIPT_NOT_VERIFIED"
  );
}

function normalizeVerifiedReceipt(
  receipt
) {
  if (!isObject(receipt)) {
    fail(
      "KEEPERHUB_VERIFIED_RECEIPT_REQUIRED"
    );
  }

  assertNoSecrets(receipt);

  const receiptStatus =
    String(
      receipt.receiptStatus ??
      receipt.receipt_status ??
      ""
    )
      .trim()
      .toLowerCase();

  if (receipt.verified !== true) {
    failForReceiptStatus(
      receiptStatus
    );
  }

  if (
    receiptStatus !== "success"
  ) {
    failForReceiptStatus(
      receiptStatus
    );
  }

  const hash =
    requireText(
      receipt.hash ??
      receipt.transaction_hash,
      "KEEPERHUB_RECEIPT_HASH_REQUIRED"
    ).toLowerCase();

  if (
    !/^0x[a-f0-9]{64}$/.test(hash)
  ) {
    fail(
      "KEEPERHUB_RECEIPT_HASH_INVALID"
    );
  }

  const chainId =
    Number(
      receipt.chainId ??
      receipt.chain_id
    );

  if (
    !Number.isInteger(chainId) ||
    chainId <= 0
  ) {
    fail(
      "KEEPERHUB_RECEIPT_CHAIN_ID_REQUIRED"
    );
  }

  const blockNumber =
    Number(
      receipt.blockNumber ??
      receipt.block_number
    );

  if (
    !Number.isInteger(blockNumber) ||
    blockNumber < 0
  ) {
    fail(
      "KEEPERHUB_RECEIPT_BLOCK_REQUIRED"
    );
  }

  return {
    transaction_hash:
      hash,

    chain_id:
      chainId,

    verified:
      true,

    receipt_status:
      "success",

    block_number:
      blockNumber,

    gas_used:
      (
        receipt.gasUsed ??
        receipt.gas_used
      ) === undefined
        ? null
        : String(
            receipt.gasUsed ??
            receipt.gas_used
          ),

    verified_at:
      receipt.verifiedAt ??
      receipt.verified_at
        ? String(
            receipt.verifiedAt ??
            receipt.verified_at
          )
        : null
  };
}

function normalizeExecutionStatus(
  input
) {
  if (!isObject(input)) {
    fail(
      "INVALID_KEEPERHUB_EXECUTION_STATUS"
    );
  }

  assertNoSecrets(input);

  const executionId =
    requireText(
      input.executionId ??
      input.execution_id,
      "KEEPERHUB_EXECUTION_ID_REQUIRED"
    );

  const status =
    requireText(
      input.status,
      "KEEPERHUB_EXECUTION_STATUS_REQUIRED"
    ).toLowerCase();

  if (
    status === "pending" ||
    status === "running"
  ) {
    fail(
      "KEEPERHUB_EXECUTION_NOT_TERMINAL"
    );
  }

  if (
    status === "unconfirmed"
  ) {
    fail(
      "KEEPERHUB_EXECUTION_UNCONFIRMED"
    );
  }

  const receipts =
    Array.isArray(input.receipts)
      ? input.receipts
      : [];

  if (receipts.length === 0) {
    fail(
      "KEEPERHUB_VERIFIED_RECEIPT_REQUIRED"
    );
  }

  const normalizedReceipts =
    receipts.map(
      normalizeVerifiedReceipt
    );

  if (
    status !== "completed"
  ) {
    fail(
      "KEEPERHUB_EXECUTION_NOT_COMPLETED"
    );
  }

  const topLevelHash =
    input.transactionHash ??
    input.transaction_hash
      ? String(
          input.transactionHash ??
          input.transaction_hash
        )
          .trim()
          .toLowerCase()
      : null;

  if (
    topLevelHash &&
    normalizedReceipts.length === 1 &&
    normalizedReceipts[0]
      .transaction_hash !== topLevelHash
  ) {
    fail(
      "KEEPERHUB_TRANSACTION_HASH_MISMATCH"
    );
  }

  return {
    schema:
      EXECUTION_SCHEMA,

    version:
      VERSION,

    source:
      "KEEPERHUB",

    evidence_class:
      "CHAIN_VERIFIED_EXECUTION_RECEIPT",

    execution_proof:
      true,

    request_binding_proven:
      false,

    execution_id:
      executionId,

    status:
      "completed",

    network:
      input.network === undefined
        ? null
        : String(input.network),

    transaction_hash:
      normalizedReceipts.length === 1
        ? normalizedReceipts[0]
            .transaction_hash
        : null,

    receipts:
      normalizedReceipts,

    provenance: {
      provider:
        "KEEPERHUB",

      verification:
        "KEEPERHUB_CHAIN_REFETCHED_RECEIPT"
    },

    limitation:
      "KeeperHub receipt evidence proves the execution receipt. SafeGate separately proves request binding, replay safety, and proof integrity."
  };
}

function normalizeExecutionEvidence(
  input
) {
  if (
    !isObject(input) ||
    input.schema !== EXECUTION_SCHEMA ||
    input.execution_proof !== true ||
    input.source !== "KEEPERHUB"
  ) {
    fail(
      "INVALID_KEEPERHUB_EXECUTION_EVIDENCE"
    );
  }

  assertNoSecrets(input);

  const executionId =
    requireText(
      input.execution_id,
      "KEEPERHUB_EXECUTION_ID_REQUIRED"
    );

  if (
    String(input.status).toLowerCase() !==
    "completed"
  ) {
    fail(
      "KEEPERHUB_EXECUTION_NOT_COMPLETED"
    );
  }

  const receipts =
    Array.isArray(input.receipts)
      ? input.receipts.map(
          normalizeVerifiedReceipt
        )
      : [];

  if (!receipts.length) {
    fail(
      "KEEPERHUB_VERIFIED_RECEIPT_REQUIRED"
    );
  }

  return {
    ...input,
    execution_id:
      executionId,
    status:
      "completed",
    receipts
  };
}

function createExecutionBinding(
  requestInput,
  executionInput
) {
  const request =
    normalizeRequest(
      requestInput
    );

  const execution =
    executionInput &&
    executionInput.schema ===
      EXECUTION_SCHEMA
      ? normalizeExecutionEvidence(
          executionInput
        )
      : normalizeExecutionStatus(
          executionInput
        );

  const transactionHashes =
    execution.receipts
      .map(
        receipt =>
          receipt.transaction_hash
      )
      .sort();

  const descriptor = {
    request_id:
      request.request_id,

    request_hash:
      request.request_hash,

    execution_id:
      execution.execution_id,

    transaction_hashes:
      transactionHashes
  };

  return {
    schema:
      BINDING_SCHEMA,

    version:
      VERSION,

    request_id:
      request.request_id,

    request_hash:
      request.request_hash,

    execution_id:
      execution.execution_id,

    transaction_hashes:
      transactionHashes,

    request_execution_binding:
      "VALID",

    binding_mechanism:
      "SAFEGATE_REQUEST_EXECUTION_COMMITMENT_V1",

    binding_hash:
      sha256Canonical(
        descriptor
      )
  };
}

function buildExecutionConsumeKey(
  executionInput
) {
  const execution =
    executionInput &&
    executionInput.schema ===
      EXECUTION_SCHEMA
      ? normalizeExecutionEvidence(
          executionInput
        )
      : normalizeExecutionStatus(
          executionInput
        );

  const receiptCommitments =
    execution.receipts
      .map(
        receipt =>
          [
            receipt.chain_id,
            receipt.transaction_hash
          ].join(":")
      )
      .sort();

  return sha256Canonical({
    domain:
      "SAFEGATE_KEEPERHUB_CONSUME_V1",

    provider:
      "KEEPERHUB",

    execution_id:
      execution.execution_id,

    receipt_commitments:
      receiptCommitments
  });
}

function normalizeSigner(provider) {
  if (!isObject(provider)) {
    fail(
      "KEEPERHUB_SIGNER_REQUIRED"
    );
  }

  assertNoSecrets(provider);

  const id =
    requireText(
      provider.id,
      "KEEPERHUB_SIGNER_ID_REQUIRED",
      /^[A-Za-z0-9._:-]{1,100}$/
    );

  if (
    provider.scheme !== "Ed25519"
  ) {
    fail(
      "KEEPERHUB_SIGNER_SCHEME_UNSUPPORTED"
    );
  }

  const publicKeyPem =
    requireText(
      provider.publicKeyPem,
      "KEEPERHUB_SIGNER_PUBLIC_KEY_REQUIRED"
    );

  let publicKey;

  try {
    publicKey =
      crypto.createPublicKey(
        publicKeyPem
      );
  } catch {
    fail(
      "KEEPERHUB_SIGNER_PUBLIC_KEY_INVALID"
    );
  }

  if (
    publicKey.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "KEEPERHUB_SIGNER_KEY_TYPE_UNSUPPORTED"
    );
  }

  if (
    typeof provider.sign !==
    "function"
  ) {
    fail(
      "KEEPERHUB_SIGN_CALLBACK_REQUIRED"
    );
  }

  const der =
    publicKey.export({
      type: "spki",
      format: "der"
    });

  return {
    id,
    scheme:
      "Ed25519",
    publicKeyPem,
    publicKey,
    fingerprint:
      crypto
        .createHash("sha256")
        .update(der)
        .digest("hex"),
    sign:
      provider.sign
  };
}

function createSigningStatement(
  payload,
  signerId
) {
  return {
    schema:
      SIGNING_STATEMENT_SCHEMA,

    version:
      VERSION,

    domain:
      SIGNING_DOMAIN,

    algorithm:
      "Ed25519",

    key_id:
      signerId,

    payload_schema:
      payload.schema,

    payload_sha256:
      sha256Canonical(
        payload
      ),

    proof_id:
      payload.proof_id,

    issued_at:
      payload.issued_at
  };
}

async function signKeeperHubProof(
  payload,
  provider
) {
  const signer =
    normalizeSigner(provider);

  const statement =
    createSigningStatement(
      payload,
      signer.id
    );

  const bytes =
    Buffer.from(
      canonicalJson(statement),
      "utf8"
    );

  const rawSignature =
    await signer.sign(bytes);

  if (
    !Buffer.isBuffer(rawSignature) &&
    !(
      rawSignature instanceof
      Uint8Array
    )
  ) {
    fail(
      "KEEPERHUB_SIGNATURE_INVALID"
    );
  }

  const signature =
    Buffer.from(
      rawSignature
    );

  if (!signature.length) {
    fail(
      "KEEPERHUB_SIGNATURE_INVALID"
    );
  }

  if (
    !crypto.verify(
      null,
      bytes,
      signer.publicKey,
      signature
    )
  ) {
    fail(
      "KEEPERHUB_SIGNATURE_SELF_CHECK_FAILED"
    );
  }

  return {
    schema:
      ENVELOPE_SCHEMA,

    version:
      VERSION,

    payload,

    signing_statement:
      statement,

    signer: {
      key_id:
        signer.id,

      scheme:
        signer.scheme,

      trust:
        "CRYPTOGRAPHIC_INTEGRITY_ONLY",

      public_key_sha256:
        signer.fingerprint,

      public_key_pem:
        signer.publicKeyPem
    },

    signature_base64:
      signature.toString(
        "base64"
      )
  };
}

function verifySignedKeeperHubProof(
  envelope
) {
  if (
    !isObject(envelope) ||
    envelope.schema !==
      ENVELOPE_SCHEMA
  ) {
    fail(
      "INVALID_KEEPERHUB_PROOF_ENVELOPE"
    );
  }

  assertNoSecrets(envelope);

  const payload =
    envelope.payload;

  if (
    !isObject(payload) ||
    payload.schema !== PROOF_SCHEMA
  ) {
    fail(
      "INVALID_KEEPERHUB_PROOF_PAYLOAD"
    );
  }

  if (
    payload.request
      ?.request_execution_binding !==
      "VALID" ||
    payload.assurance
      ?.execution !==
      "THIRD_PARTY_ATTESTED" ||
    payload.assurance
      ?.independently_validated !==
      false ||
    payload.commerce_verified !==
      false
  ) {
    fail(
      "INVALID_KEEPERHUB_ASSURANCE"
    );
  }

  const signer =
    envelope.signer;

  if (
    !isObject(signer) ||
    signer.scheme !== "Ed25519"
  ) {
    fail(
      "INVALID_KEEPERHUB_SIGNER"
    );
  }

  let publicKey;

  try {
    publicKey =
      crypto.createPublicKey(
        String(
          signer.public_key_pem || ""
        )
      );
  } catch {
    fail(
      "INVALID_KEEPERHUB_SIGNER_PUBLIC_KEY"
    );
  }

  if (
    publicKey.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "INVALID_KEEPERHUB_SIGNER_KEY_TYPE"
    );
  }

  const der =
    publicKey.export({
      type: "spki",
      format: "der"
    });

  const fingerprint =
    crypto
      .createHash("sha256")
      .update(der)
      .digest("hex");

  if (
    fingerprint !==
    signer.public_key_sha256
  ) {
    fail(
      "KEEPERHUB_SIGNER_FINGERPRINT_MISMATCH"
    );
  }

  const expectedStatement =
    createSigningStatement(
      payload,
      signer.key_id
    );

  if (
    canonicalJson(
      envelope.signing_statement
    ) !==
    canonicalJson(
      expectedStatement
    )
  ) {
    fail(
      "KEEPERHUB_SIGNING_STATEMENT_MISMATCH"
    );
  }

  let signature;

  try {
    signature =
      Buffer.from(
        String(
          envelope.signature_base64 ||
          ""
        ),
        "base64"
      );
  } catch {
    fail(
      "KEEPERHUB_SIGNATURE_INVALID"
    );
  }

  const bytes =
    Buffer.from(
      canonicalJson(
        expectedStatement
      ),
      "utf8"
    );

  if (
    !signature.length ||
    !crypto.verify(
      null,
      bytes,
      publicKey,
      signature
    )
  ) {
    fail(
      "KEEPERHUB_SIGNATURE_INVALID"
    );
  }

  return {
    ok:
      true,

    proof_id:
      payload.proof_id,

    signature_status:
      "VERIFIED",

    signer_key_id:
      signer.key_id,

    signer_fingerprint_sha256:
      fingerprint,

    assurance_level:
      "THIRD_PARTY_ATTESTED",

    independently_validated:
      false,

    commerce_verified:
      false
  };
}

async function createKeeperHubCommerceProof(
  input,
  options = {}
) {
  rejectCallerAssuranceElevation(
    input
  );

  assertNoSecrets(input);

  if (
    typeof options.consumeOnce !==
    "function"
  ) {
    fail(
      "KEEPERHUB_CONSUME_ONCE_REQUIRED"
    );
  }

  const request =
    normalizeRequest(
      input.request
    );

  const execution =
    input.execution &&
    input.execution.schema ===
      EXECUTION_SCHEMA
      ? normalizeExecutionEvidence(
          input.execution
        )
      : normalizeExecutionStatus(
          input.execution
        );

  const binding =
    createExecutionBinding(
      input.request,
      execution
    );

  const consumeKey =
    buildExecutionConsumeKey(
      execution
    );

  const consumed =
    await options.consumeOnce({
      consumeKey,
      provider:
        "KEEPERHUB",
      executionId:
        execution.execution_id,
      requestId:
        request.request_id,
      requestHash:
        request.request_hash,
      bindingHash:
        binding.binding_hash,
      transactionHashes:
        binding.transaction_hashes
    });

  if (consumed !== true) {
    fail(
      "ALREADY_CONSUMED"
    );
  }

  const now =
    typeof options.now ===
    "function"
      ? options.now
      : () =>
          new Date()
            .toISOString();

  const issuedAt =
    String(now());

  const proofIdentity = {
    request_hash:
      request.request_hash,

    execution_id:
      execution.execution_id,

    transaction_hashes:
      binding.transaction_hashes,

    consume_key:
      consumeKey
  };

  const proofId =
    "SG-KH-PROOF-" +
    sha256Canonical(
      proofIdentity
    )
      .slice(0, 32)
      .toUpperCase();

  const payload = {
    schema:
      PROOF_SCHEMA,

    version:
      VERSION,

    proof_id:
      proofId,

    issued_at:
      issuedAt,

    scope:
      "KEEPERHUB_EXECUTION_INTEROP",

    request: {
      request_id:
        request.request_id,

      request_hash:
        request.request_hash,

      request_execution_binding:
        "VALID",

      binding_hash:
        binding.binding_hash,

      binding_mechanism:
        binding.binding_mechanism
    },

    execution: {
      provider:
        "KEEPERHUB",

      execution_id:
        execution.execution_id,

      status:
        "completed",

      evidence_class:
        execution.evidence_class,

      transaction_hash:
        execution.transaction_hash,

      receipts:
        execution.receipts
    },

    replay_safety: {
      consume_status:
        "CONSUMED",

      consume_key:
        consumeKey,

      durability:
        "PROVIDED_BY_INTEGRATOR_CONSUME_ONCE"
    },

    provenance: {
      execution_provider:
        "KEEPERHUB",

      receipt_verification:
        "KEEPERHUB_CHAIN_REFETCHED_RECEIPT",

      request_binding:
        "SAFEGATE_REQUEST_EXECUTION_COMMITMENT_V1"
    },

    assurance: {
      execution:
        "THIRD_PARTY_ATTESTED",

      independently_validated:
        false,

      limitation:
        "KeeperHub supplies third-party execution receipt evidence. SafeGate binds that evidence to the request and enforces replay safety. This is not independent execution validation."
    },

    commerce_verified:
      false
  };

  const envelope =
    await signKeeperHubProof(
      payload,
      options.signer
    );

  const proofVerification =
    verifySignedKeeperHubProof(
      envelope
    );

  return {
    ok:
      true,

    capability:
      "safegate_keeperhub_execution_assurance",

    version:
      VERSION,

    request_binding:
      "VALID",

    execution_binding:
      "VALID",

    replay_status:
      "CONSUMED",

    assurance_level:
      "THIRD_PARTY_ATTESTED",

    independently_validated:
      false,

    commerce_verified:
      false,

    binding,

    execution_evidence:
      execution,

    commerce_proof:
      envelope,

    proof_verification:
      proofVerification
  };
}

module.exports = {
  VERSION,
  SIMULATION_SCHEMA,
  EXECUTION_SCHEMA,
  BINDING_SCHEMA,
  PROOF_SCHEMA,
  ENVELOPE_SCHEMA,
  assertNoSecrets,
  rejectCallerAssuranceElevation,
  normalizeRequest,
  normalizeSimulationResult,
  normalizeExecutionStatus,
  normalizeExecutionEvidence,
  createExecutionBinding,
  buildExecutionConsumeKey,
  signKeeperHubProof,
  verifySignedKeeperHubProof,
  createKeeperHubCommerceProof
};