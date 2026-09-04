"use strict";

const crypto = require("crypto");

const CATALOG = Object.freeze({
  "SG-API-001": { availability: "IN_STOCK", unitPrice: 12.5, currency: "USD" },
  "SG-DATA-002": { availability: "IN_STOCK", unitPrice: 7.25, currency: "USD" },
  "SG-COMPUTE-003": { availability: "LIMITED", unitPrice: 19.0, currency: "USD" },
});

function serviceError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function runPremiumProductIntel({ sku, quantity = 1 } = {}) {
  const normalizedSku = String(sku || "").trim().toUpperCase();
  const normalizedQuantity = Number(quantity);

  if (!CATALOG[normalizedSku]) {
    throw serviceError("SKU_NOT_FOUND", "Unknown premium product SKU.", 404);
  }

  if (
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity < 1 ||
    normalizedQuantity > 100
  ) {
    throw serviceError(
      "INVALID_QUANTITY",
      "quantity must be an integer between 1 and 100."
    );
  }

  const item = CATALOG[normalizedSku];
  const generatedAt = new Date().toISOString();
  const total = Number((item.unitPrice * normalizedQuantity).toFixed(2));

  const quoteSeed = [
    normalizedSku,
    normalizedQuantity,
    item.unitPrice,
    generatedAt,
  ].join("|");

  const quoteId =
    "Q-" +
    crypto
      .createHash("sha256")
      .update(quoteSeed, "utf8")
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();

  return {
    service: "premium-product-intel",
    sku: normalizedSku,
    quantity: normalizedQuantity,
    availability: item.availability,
    unit_price: item.unitPrice,
    currency: item.currency,
    total,
    quote_id: quoteId,
    generated_at: generatedAt,
  };
}

module.exports = {
  runPremiumProductIntel,
};
