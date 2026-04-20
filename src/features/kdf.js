export function getArgon2Support() {
  const adapter = globalThis.ZeroVaultArgon2id
    || (globalThis.argon2 && typeof globalThis.argon2.hash === "function"
      ? {
          async deriveKey({ password, salt, memoryKiB, parallelism, passes, length }) {
            const result = await globalThis.argon2.hash({
              pass: password,
              salt,
              mem: memoryKiB,
              time: passes,
              parallelism,
              hashLen: length,
              type: globalThis.argon2.ArgonType?.Argon2id ?? 2,
              raw: true,
            });
            return result.hash;
          }
        }
      : null);
  if (!adapter || typeof adapter.deriveKey !== "function") {
    return { available: false, reason: "No Argon2id adapter loaded. Load src/argon2-adapter.js with a compatible runtime." };
  }
  return { available: true, adapter };
}
