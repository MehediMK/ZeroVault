const CATEGORY_FIELDS = {
  card: ["cardholderName", "cardNumber", "expiry", "cvv"],
  identity: ["fullName", "documentId", "issuingCountry"],
  bank: ["bankName", "accountNumber", "routingNumber"],
  license: ["product", "licenseKey", "seatCount"],
  note: ["topic", "owner"],
  login: ["website", "loginHint"],
};

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

export function detailFieldsForCategory(category = "login") {
  return CATEGORY_FIELDS[category] || CATEGORY_FIELDS.login;
}

export function validateEntry(values = {}) {
  const issues = [];
  const category = values.category || "login";
  const details = values.details || {};

  if (!hasValue(values.title)) {
    issues.push("Title is required.");
  }

  if (category === "card") {
    const number = cleanDigits(details.cardNumber);
    const cvv = cleanDigits(details.cvv);
    if (hasValue(details.cardNumber) && number.length < 12) issues.push("Card number looks too short.");
    if (hasValue(details.expiry) && !/^(0[1-9]|1[0-2])\/\d{2,4}$/.test(String(details.expiry).trim())) issues.push("Card expiry must use MM/YY.");
    if (hasValue(details.cvv) && !/^\d{3,4}$/.test(cvv)) issues.push("CVV must be 3 or 4 digits.");
  }

  if (category === "bank") {
    const account = cleanDigits(details.accountNumber);
    if (hasValue(details.accountNumber) && account.length < 6) issues.push("Bank account number looks too short.");
    if (hasValue(details.routingNumber) && String(details.routingNumber).trim().length < 6) issues.push("Routing / SWIFT looks incomplete.");
  }

  if (category === "identity") {
    if (hasValue(details.documentId) && String(details.documentId).trim().length < 4) issues.push("Document ID looks too short.");
    if (hasValue(details.issuingCountry) && !/^[A-Za-z][A-Za-z .-]{1,}$/.test(String(details.issuingCountry).trim())) issues.push("Issuing country contains unexpected characters.");
  }

  if (category === "license") {
    if (hasValue(details.seatCount) && !/^\d+$/.test(String(details.seatCount).trim())) issues.push("Seat count must be a whole number.");
  }

  if (values.totpSecret && !String(values.totpSecret).trim()) {
    issues.push("TOTP secret is empty.");
  }

  return issues;
}

