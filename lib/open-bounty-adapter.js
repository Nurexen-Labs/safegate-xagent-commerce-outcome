"use strict";

const crypto = require("crypto");

const {
  normalizeExecutionAdapterEvent
} = require("./execution-adapter-contract");

const SCHEMA = "SAFEGATE_OPEN_BOUNTY_ADAPTER_V1";
const VERSION = "1.0.0";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = 400;
  throw error;
}

function requireString(value, field) {
  const text =
    value === undefined || value === null
      ? ""
      : String(value).trim();

  if (!text) {
    fail(
      "INVALID_OPEN_BOUNTY_INPUT",
      `${field} is required`
    );
  }

  return text;
}

function requireVersion(value) {
  const version = Number(value);

  if (
    !Number.isInteger(version) ||
    version < 1
  ) {
    fail(
      "INVALID_OPEN_BOUNTY_VERSION",
      "submission.version must be a positive integer"
    );
  }

  return version;
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function rejectCallerAssuranceElevation(input) {
  const forbidden = [
    "assurance",
    "assurance_level",
    "commerce_verified",
    "independently_validated",
    "validated",
    "observed",
    "third_party_attested"
  ];

  for (const field of forbidden) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field
      )
    ) {
      fail(
        "CALLER_ASSURANCE_ELEVATION_FORBIDDEN",
        `Open Bounty input cannot set ${field}`
      );
    }
  }
}

function buildOpenBountyExecutionId({
  bountyId,
  submissionId,
  version
}) {
  return [
    "OPEN_BOUNTY",
    requireString(bountyId, "bountyId"),
    "SUBMISSION",
    requireString(
      submissionId,
      "submission.id"
    ),
    `V${requireVersion(version)}`
  ].join(":");
}

function buildCompositePaymentReference({
  workerPaymentReference,
  deliveryPaymentReference
}) {
  const worker =
    optionalString(workerPaymentReference);

  const delivery =
    optionalString(deliveryPaymentReference);

  if (!worker || !delivery) {
    return null;
  }

  const digest = sha256(
    JSON.stringify({
      provider: "OPEN_BOUNTY",
      worker,
      delivery
    })
  );

  return (
    "OPEN_BOUNTY_X402_COMPOSITE_SHA256:" +
    digest
  );
}

function mapOpenBountyToExecutionAdapter(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    fail(
      "INVALID_OPEN_BOUNTY_INPUT",
      "input must be an object"
    );
  }

  rejectCallerAssuranceElevation(input);

  const submission = input.submission;

  if (
    !submission ||
    typeof submission !== "object" ||
    Array.isArray(submission)
  ) {
    fail(
      "INVALID_OPEN_BOUNTY_INPUT",
      "submission must be an object"
    );
  }

  const bountyId =
    requireString(
      input.bountyId,
      "bountyId"
    );

  const submissionId =
    requireString(
      submission.id,
      "submission.id"
    );

  const version =
    requireVersion(
      submission.version
    );

  const status =
    requireString(
      submission.status,
      "submission.status"
    ).toUpperCase();

  const submissionHash =
    requireString(
      submission.submissionHash,
      "submission.submissionHash"
    );

  const criteriaHash =
    requireString(
      submission.criteriaHash,
      "submission.criteriaHash"
    );

  const requestBinding =
    requireString(
      input.requestBinding,
      "requestBinding"
    );

  const certificate =
    input.quorumCertificate &&
    typeof input.quorumCertificate === "object"
      ? input.quorumCertificate
      : null;

  const settlement =
    input.settlement &&
    typeof input.settlement === "object"
      ? input.settlement
      : {};

  const workerPaymentReference =
    optionalString(
      settlement.workerPaymentReference
    );

  const deliveryPaymentReference =
    optionalString(
      settlement.deliveryPaymentReference
    );

  const evidence = [
    {
      type:
        "OPEN_BOUNTY_SUBMISSION_HASH",
      reference:
        submissionHash,
      version:
        String(version)
    },
    {
      type:
        "OPEN_BOUNTY_CRITERIA_HASH",
      reference:
        criteriaHash
    }
  ];

  let certificateHash = null;
  let signedPayloadHash = null;

  if (certificate) {
    certificateHash =
      optionalString(certificate.hash);

    const signedPayload =
      optionalString(
        certificate.signedPayload
      );

    if (certificateHash) {
      evidence.push({
        type:
          "OPEN_BOUNTY_QUORUM_CERTIFICATE_HASH",
        reference:
          certificateHash
      });
    }

    if (signedPayload) {
      signedPayloadHash =
        sha256(signedPayload);

      evidence.push({
        type:
          "OPEN_BOUNTY_QUORUM_SIGNED_PAYLOAD_SHA256",
        reference:
          signedPayloadHash
      });
    }
  }

  if (workerPaymentReference) {
    evidence.push({
      type:
        "OPEN_BOUNTY_WORKER_X402_SETTLEMENT",
      reference:
        workerPaymentReference
    });
  }

  if (deliveryPaymentReference) {
    evidence.push({
      type:
        "OPEN_BOUNTY_DELIVERY_X402_SETTLEMENT",
      reference:
        deliveryPaymentReference
    });
  }

  const paymentReference =
    buildCompositePaymentReference({
      workerPaymentReference,
      deliveryPaymentReference
    });

  const executionId =
    buildOpenBountyExecutionId({
      bountyId,
      submissionId,
      version
    });

  const genericEvent =
    normalizeExecutionAdapterEvent({
      provider:
        "OPEN_BOUNTY",

      operation_type:
        "BOUNTY",

      execution_id:
        executionId,

      request_binding:
        requestBinding,

      status,

      payment_reference:
        paymentReference,

      evidence
    });

  return {
    schema: SCHEMA,
    version: VERSION,

    generic_event:
      genericEvent,

    open_bounty: {
      bounty_id:
        bountyId,

      submission_id:
        submissionId,

      submission_version:
        version,

      submission_status:
        status,

      submission_hash:
        submissionHash,

      criteria_hash:
        criteriaHash
    },

    quorum: {
      certificate_present:
        Boolean(certificateHash),

      signed_payload_present:
        Boolean(signedPayloadHash),

      safegate_verification:
        "NOT_PERFORMED",

      automatic_assurance_upgrade:
        false,

      eligible_after_independent_verification:
        certificateHash
          ? "THIRD_PARTY_ATTESTED"
          : null
    },

    settlement: {
      worker_payment_present:
        Boolean(workerPaymentReference),

      delivery_payment_present:
        Boolean(deliveryPaymentReference),

      complete:
        Boolean(
          workerPaymentReference &&
          deliveryPaymentReference
        ),

      composite_payment_reference:
        paymentReference
    },

    security: {
      custody: false,
      routes_funds: false,
      wallet_signing: false,
      payment_authorization: false
    }
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  buildOpenBountyExecutionId,
  buildCompositePaymentReference,
  mapOpenBountyToExecutionAdapter
};