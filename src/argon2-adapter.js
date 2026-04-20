// Optional integration point for an Argon2id runtime.
// If you load a compatible library before this file and expose either:
// 1. window.ZeroVaultArgon2id = { deriveKey(...) { ... } }
// 2. window.argon2 from argon2-browser
// then the app's Argon2id migration path becomes available.

if (window.argon2 && !window.ZeroVaultArgon2id && typeof window.argon2.hash === "function") {
  window.ZeroVaultArgon2id = {
    async deriveKey({ password, salt, memoryKiB, parallelism, passes, length }) {
      const result = await window.argon2.hash({
        pass: password,
        salt,
        mem: memoryKiB,
        time: passes,
        parallelism,
        hashLen: length,
        type: window.argon2.ArgonType?.Argon2id ?? 2,
        raw: true,
      });
      return result.hash;
    }
  };
}
