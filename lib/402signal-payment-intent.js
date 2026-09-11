"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");


const SCHEMA =
  "SAFEGATE_402SIGNAL_PAYMENT_INTENT_V1";


const STATES =
  Object.freeze({
    PREPARED:
      "PREPARED",

    ROUTE_VERIFIED:
      "ROUTE_VERIFIED",

    BUDGET_RESERVED:
      "BUDGET_RESERVED",

    SUBMISSION_CLAIMED:
      "SUBMISSION_CLAIMED",

    AMBIGUOUS:
      "AMBIGUOUS",

    RECONCILING:
      "RECONCILING",

    SETTLED:
      "SETTLED",

    REJECTED_CONFIRMED:
      "REJECTED_CONFIRMED"
  });


const ALLOWED = Object.freeze({
  PREPARED:
    ["ROUTE_VERIFIED"],

  ROUTE_VERIFIED:
    ["BUDGET_RESERVED"],

  BUDGET_RESERVED:
    ["SUBMISSION_CLAIMED"],

  SUBMISSION_CLAIMED:
    [
      "SETTLED",
      "AMBIGUOUS",
      "REJECTED_CONFIRMED"
    ],

  AMBIGUOUS:
    ["RECONCILING"],

  RECONCILING:
    [
      "SETTLED",
      "AMBIGUOUS",
      "REJECTED_CONFIRMED"
    ],

  SETTLED:
    [],

  REJECTED_CONFIRMED:
    []
});


function fail(code, message) {
  const error =
    new Error(message || code);

  error.code =
    code;

  throw error;
}


function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}


function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


function deepFreeze(value) {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (
      const child of
      Object.values(value)
    ) {
      deepFreeze(child);
    }
  }

  return value;
}


function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      String(value),
      "utf8"
    )
    .digest("hex");
}


function requireText(
  value,
  code,
  maxLength = 256,
  pattern = null
) {
  const text =
    String(value || "").trim();

  if (
    !text ||
    text.length > maxLength ||
    (
      pattern &&
      !pattern.test(text)
    )
  ) {
    fail(code);
  }

  return text;
}


function requirePositiveIntegerString(
  value,
  code
) {
  const text =
    requireText(
      value,
      code,
      100,
      /^[1-9][0-9]*$/
    );

  return text;
}


function normalizeSpec(spec) {
  if (!isObject(spec)) {
    fail(
      "INVALID_PAYMENT_INTENT_SPEC"
    );
  }

  const requestId =
    requireText(
      spec.requestId,
      "INVALID_REQUEST_ID",
      100,
      /^SG-[A-Z0-9-]{8,96}$/
    );

  const routeEvidenceId =
    requireText(
      spec.routeEvidenceId,
      "INVALID_ROUTE_EVIDENCE_ID",
      120
    );

  const quoteSha256 =
    requireText(
      spec.quoteSha256,
      "INVALID_QUOTE_HASH",
      64,
      /^[a-f0-9]{64}$/i
    ).toLowerCase();

  const network =
    requireText(
      spec.network,
      "INVALID_NETWORK",
      100
    );

  const asset =
    requireText(
      spec.asset,
      "INVALID_ASSET",
      100
    );

  const amount =
    requirePositiveIntegerString(
      spec.amountBaseUnits,
      "INVALID_AMOUNT"
    );

  const recipient =
    requireText(
      spec.recipient,
      "INVALID_RECIPIENT",
      256
    ).toLowerCase();

  return {
    request_id:
      requestId,

    route_evidence_id:
      routeEvidenceId,

    quote_sha256:
      quoteSha256,

    network,

    asset,

    amount_base_units:
      amount,

    recipient
  };
}


function buildPaymentFingerprint(
  spec
) {
  const normalized =
    normalizeSpec(spec);

  return sha256(
    canonicalJson({
      domain:
        "safegate.payment-intent.v1",

      ...normalized
    })
  );
}


function createPaymentIntent(
  spec,
  options = {}
) {
  const normalized =
    normalizeSpec(spec);

  const fingerprint =
    buildPaymentFingerprint(spec);

  const createdAt =
    requireText(
      options.createdAt,
      "CREATED_AT_REQUIRED",
      64
    );

  const intentId =
    "SG-PAY-INTENT-" +
    fingerprint
      .slice(0, 32)
      .toUpperCase();

  return deepFreeze({
    schema:
      SCHEMA,

    version:
      "1.0.0",

    intent_id:
      intentId,

    payment_fingerprint:
      fingerprint,

    revision:
      0,

    state:
      STATES.PREPARED,

    economic_intent:
      normalized,

    safety: {
      automatic_payment_retry:
        false,

      durable_store_required:
        true,

      submission_claim_required:
        true,

      fresh_intent_after_ambiguity:
        false
    },

    budget: {
      reservation_status:
        "NONE",

      release_permitted:
        false
    },

    payment: {
      attempted:
        false,

      submission_claimed:
        false,

      transaction_reference:
        null,

      settlement_status:
        "NOT_ATTEMPTED"
    },

    recovery: {
      required:
        false,

      mode:
        null,

      last_result:
        null
    },

    created_at:
      createdAt,

    updated_at:
      createdAt,

    history: [
      {
        revision:
          0,

        state:
          STATES.PREPARED,

        event:
          "INTENT_CREATED",

        at:
          createdAt
      }
    ]
  });
}


function policyForIntent(intent) {
  if (
    !isObject(intent) ||
    intent.schema !==
      SCHEMA
  ) {
    fail("INVALID_PAYMENT_INTENT");
  }

  return deepFreeze({
    automatic_payment_retry:
      false,

    allow_payment_submission:
      intent.state ===
        STATES.BUDGET_RESERVED &&
      intent.payment.attempted ===
        false,

    reconcile_only:
      [
        STATES.SUBMISSION_CLAIMED,
        STATES.AMBIGUOUS,
        STATES.RECONCILING
      ].includes(
        intent.state
      ),

    terminal:
      [
        STATES.SETTLED,
        STATES.REJECTED_CONFIRMED
      ].includes(
        intent.state
      ),

    budget_release_permitted:
      false
  });
}


function transitionIntent(
  intent,
  nextState,
  options = {}
) {
  if (
    !isObject(intent) ||
    intent.schema !==
      SCHEMA
  ) {
    fail("INVALID_PAYMENT_INTENT");
  }

  if (
    !Object.values(STATES)
      .includes(nextState)
  ) {
    fail("INVALID_PAYMENT_STATE");
  }

  const allowed =
    ALLOWED[intent.state] || [];

  if (
    !allowed.includes(
      nextState
    )
  ) {
    fail(
      "INVALID_PAYMENT_STATE_TRANSITION"
    );
  }

  const at =
    requireText(
      options.at,
      "TRANSITION_TIME_REQUIRED",
      64
    );

  const next =
    clone(intent);

  next.revision =
    intent.revision + 1;

  next.state =
    nextState;

  next.updated_at =
    at;


  if (
    nextState ===
      STATES.ROUTE_VERIFIED
  ) {
    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "ROUTE_VERIFIED",

      at
    });
  }


  if (
    nextState ===
      STATES.BUDGET_RESERVED
  ) {
    next.budget
      .reservation_status =
        "RESERVED";

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "BUDGET_RESERVED",

      at
    });
  }


  if (
    nextState ===
      STATES.SUBMISSION_CLAIMED
  ) {
    if (
      intent.budget
        .reservation_status !==
        "RESERVED"
    ) {
      fail(
        "BUDGET_RESERVATION_REQUIRED"
      );
    }

    if (
      intent.payment.attempted ===
        true
    ) {
      fail(
        "PAYMENT_ALREADY_ATTEMPTED"
      );
    }

    next.payment.attempted =
      true;

    next.payment
      .submission_claimed =
        true;

    next.payment
      .settlement_status =
        "SUBMISSION_UNKNOWN";

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "SUBMISSION_CLAIMED",

      at
    });
  }


  if (
    nextState ===
      STATES.AMBIGUOUS
  ) {
    next.recovery.required =
      true;

    next.recovery.mode =
      "READ_ONLY_RECONCILIATION";

    next.recovery.last_result =
      "UNKNOWN";

    next.payment
      .settlement_status =
        "UNKNOWN";

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "PAYMENT_RESULT_AMBIGUOUS",

      at
    });
  }


  if (
    nextState ===
      STATES.RECONCILING
  ) {
    next.recovery.required =
      true;

    next.recovery.mode =
      "READ_ONLY_RECONCILIATION";

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "RECONCILIATION_STARTED",

      at
    });
  }


  if (
    nextState ===
      STATES.SETTLED
  ) {
    next.payment
      .settlement_status =
        "SETTLED";

    next.payment
      .transaction_reference =
        requireText(
          options.transactionReference,
          "TRANSACTION_REFERENCE_REQUIRED",
          256
        );

    next.recovery.required =
      false;

    next.recovery.last_result =
      "SETTLED";

    /*
     * Reservation release remains separate policy.
     * Reconciliation itself never releases budget.
     */
    next.budget
      .release_permitted =
        false;

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "PAYMENT_SETTLED",

      at
    });
  }


  if (
    nextState ===
      STATES.REJECTED_CONFIRMED
  ) {
    next.payment
      .settlement_status =
        "REJECTED_CONFIRMED";

    next.recovery.required =
      false;

    next.recovery.last_result =
      "REJECTED_CONFIRMED";

    next.budget
      .release_permitted =
        false;

    next.history.push({
      revision:
        next.revision,

      state:
        nextState,

      event:
        "PAYMENT_REJECTED_CONFIRMED",

      at
    });
  }


  return deepFreeze(next);
}


function validateStore(store) {
  if (
    !isObject(store) ||
    typeof store.createOnce !==
      "function" ||
    typeof store.get !==
      "function" ||
    typeof store.compareAndSwap !==
      "function"
  ) {
    fail(
      "DURABLE_STORE_CONTRACT_REQUIRED"
    );
  }

  return store;
}


function createCoordinator(store) {
  validateStore(store);

  async function initialize(
    spec,
    options = {}
  ) {
    const intent =
      createPaymentIntent(
        spec,
        options
      );

    const created =
      await store.createOnce(
        intent
      );

    if (created !== true) {
      fail(
        "DUPLICATE_PAYMENT_FINGERPRINT"
      );
    }

    return intent;
  }


  async function advance(
    intentId,
    expectedRevision,
    nextState,
    options = {}
  ) {
    const current =
      await store.get(
        intentId
      );

    if (!current) {
      fail(
        "PAYMENT_INTENT_NOT_FOUND"
      );
    }

    if (
      current.revision !==
      expectedRevision
    ) {
      fail(
        "STALE_INTENT_REVISION"
      );
    }

    const next =
      transitionIntent(
        current,
        nextState,
        options
      );

    const swapped =
      await store.compareAndSwap({
        intentId,
        expectedRevision,
        next
      });

    if (swapped !== true) {
      fail(
        "STALE_INTENT_REVISION"
      );
    }

    return next;
  }


  async function read(
    intentId
  ) {
    const current =
      await store.get(
        intentId
      );

    if (!current) {
      fail(
        "PAYMENT_INTENT_NOT_FOUND"
      );
    }

    return current;
  }


  return {
    initialize,
    advance,
    read
  };
}


async function reconcileReadOnly(
  coordinator,
  intentId,
  options = {}
) {
  if (
    !coordinator ||
    typeof coordinator.read !==
      "function" ||
    typeof coordinator.advance !==
      "function"
  ) {
    fail(
      "INVALID_COORDINATOR"
    );
  }

  /*
   * Recovery boundary accepts no payment capabilities.
   */
  const forbidden =
    [
      "signer",
      "sign",
      "wallet",
      "sendPayment",
      "submitPayment",
      "authorizePayment"
    ];

  for (
    const field of
    forbidden
  ) {
    if (
      Object.prototype
        .hasOwnProperty.call(
          options,
          field
        )
    ) {
      fail(
        "PAYMENT_CAPABILITY_FORBIDDEN_DURING_RECONCILIATION"
      );
    }
  }

  if (
    typeof options.observe !==
      "function"
  ) {
    fail(
      "READ_ONLY_OBSERVER_REQUIRED"
    );
  }

  let current =
    await coordinator.read(
      intentId
    );

  if (
    current.state !==
      STATES.AMBIGUOUS
  ) {
    fail(
      "RECONCILIATION_REQUIRES_AMBIGUOUS_STATE"
    );
  }

  current =
    await coordinator.advance(
      intentId,
      current.revision,
      STATES.RECONCILING,
      {
        at:
          options.startedAt
      }
    );

  const observation =
    await options.observe(
      deepFreeze(
        clone(current)
      )
    );

  if (!isObject(observation)) {
    fail(
      "INVALID_RECONCILIATION_RESULT"
    );
  }

  const result =
    String(
      observation.status || ""
    ).toUpperCase();

  if (
    result === "SETTLED"
  ) {
    return coordinator.advance(
      intentId,
      current.revision,
      STATES.SETTLED,
      {
        at:
          options.completedAt,

        transactionReference:
          observation.transactionReference
      }
    );
  }

  if (
    result ===
      "REJECTED_CONFIRMED"
  ) {
    return coordinator.advance(
      intentId,
      current.revision,
      STATES.REJECTED_CONFIRMED,
      {
        at:
          options.completedAt
      }
    );
  }

  if (
    result === "UNKNOWN"
  ) {
    return coordinator.advance(
      intentId,
      current.revision,
      STATES.AMBIGUOUS,
      {
        at:
          options.completedAt
      }
    );
  }

  fail(
    "UNSUPPORTED_RECONCILIATION_RESULT"
  );
}


module.exports = {
  SCHEMA,
  STATES,
  buildPaymentFingerprint,
  createPaymentIntent,
  transitionIntent,
  policyForIntent,
  createCoordinator,
  reconcileReadOnly
};