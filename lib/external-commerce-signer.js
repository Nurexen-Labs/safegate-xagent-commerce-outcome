"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");

const {
  createCommerceProofPayload
} = require("./402signal-commerce-proof");

const {
  verifyTrustedCommerceProofEnvelope
} = require("./trusted-commerce-signer");


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


function validateProvider(provider) {
  if (!isObject(provider)) {
    fail("INVALID_SIGNER_PROVIDER");
  }

  /*
   * Core must never receive raw private-key material.
   * A real deployment can put the key behind KMS/HSM/secret service.
   */
  const forbidden = [
    "privateKey",
    "privateKeyPem",
    "seed",
    "mnemonic",
    "secret"
  ];

  for (const field of forbidden) {
    if (
      Object.prototype.hasOwnProperty.call(
        provider,
        field
      )
    ) {
      fail("RAW_PRIVATE_KEY_FORBIDDEN");
    }
  }

  const id =
    String(provider.id || "").trim();

  if (!id) {
    fail("SIGNER_PROVIDER_ID_REQUIRED");
  }

  if (provider.scheme !== "Ed25519") {
    fail("UNSUPPORTED_SIGNER_PROVIDER_SCHEME");
  }

  const publicKeyPem =
    String(
      provider.publicKeyPem || ""
    ).trim();

  let publicKey;

  try {
    publicKey =
      crypto.createPublicKey(
        publicKeyPem
      );
  } catch {
    fail("INVALID_SIGNER_PROVIDER_PUBLIC_KEY");
  }

  if (
    publicKey.asymmetricKeyType !==
      "ed25519"
  ) {
    fail("INVALID_SIGNER_PROVIDER_KEY_TYPE");
  }

  if (
    typeof provider.sign !==
      "function"
  ) {
    fail("SIGNER_PROVIDER_CALLBACK_REQUIRED");
  }

  return {
    id,
    scheme: "Ed25519",
    publicKeyPem,
    sign: provider.sign
  };
}


async function createTrustedCommerceProofWithProvider(
  lifecycle,
  options = {}
) {
  const provider =
    validateProvider(
      options.provider
    );

  if (!isObject(options.trustStore)) {
    fail("TRUST_STORE_REQUIRED");
  }

  const payload =
    createCommerceProofPayload(
      lifecycle,
      {
        issuedAt:
          options.issuedAt
      }
    );

  const bytes =
    Buffer.from(
      canonicalJson(payload),
      "utf8"
    );

  const rawSignature =
    await provider.sign(bytes);

  if (
    !Buffer.isBuffer(rawSignature) &&
    !(rawSignature instanceof Uint8Array)
  ) {
    fail("INVALID_PROVIDER_SIGNATURE");
  }

  const signature =
    Buffer.from(rawSignature);

  if (!signature.length) {
    fail("INVALID_PROVIDER_SIGNATURE");
  }

  const envelope = {
    schema:
      "SAFEGATE_SIGNED_COMMERCE_PROOF_V1",

    version:
      "1.0.0",

    payload,

    signer: {
      id:
        provider.id,

      scheme:
        provider.scheme,

      trust:
        "EXTERNAL_SIGNER_PROVIDER",

      public_key_pem:
        provider.publicKeyPem
    },

    signature_base64:
      signature.toString("base64")
  };

  /*
   * Fail closed:
   * do not return proof until external trust pin + signature pass.
   */
  const verification =
    verifyTrustedCommerceProofEnvelope(
      envelope,
      options.trustStore
    );

  return {
    envelope,
    verification
  };
}


module.exports = {
  validateProvider,
  createTrustedCommerceProofWithProvider
};