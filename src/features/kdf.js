export function getArgon2Support() {
  const adapter = globalThis.ZeroVaultArgon2id;
  if (!adapter || typeof adapter.deriveKey !== "function") {
    return { available: false, reason: "No Argon2id adapter loaded." };
  }
  return { available: true, adapter };
}
