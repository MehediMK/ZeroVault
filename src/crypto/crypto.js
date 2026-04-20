import { utf8ToBytes, bytesToUtf8, randomBytes } from "./encoding.js";
import { getArgon2Support } from "../features/kdf.js";

export const DEFAULTS = {
  version: 2,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations: 310000,
  cipher: "AES-GCM",
  tagLength: 128,
  saltBytes: 16,
  ivBytes: 12,
  memoryKiB: 65536,
  parallelism: 1,
  passes: 3,
};

export async function deriveAesKeyPBKDF2(password, saltBytes, iterations) {
  const pwKey = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    pwKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveAesKeyArgon2id(password, cfg) {
  const support = getArgon2Support();
  if (!support.available) {
    throw new Error("Argon2id upgrade requested, but no Argon2id adapter is available.");
  }

  const keyBytes = await support.adapter.deriveKey({
    password,
    salt: cfg.salt,
    memoryKiB: cfg.memoryKiB,
    parallelism: cfg.parallelism,
    passes: cfg.passes,
    length: 32,
  });

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function deriveAesKey(cfg, password) {
  if (cfg.kdf === "PBKDF2") {
    return deriveAesKeyPBKDF2(password, cfg.salt, cfg.iterations);
  }
  if (cfg.kdf === "Argon2id") {
    return deriveAesKeyArgon2id(password, cfg);
  }
  throw new Error(`Unsupported KDF: ${cfg.kdf}`);
}

export async function encryptJsonWithPassword(plainObject, password, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const salt = randomBytes(cfg.saltBytes);
  const iv = randomBytes(cfg.ivBytes);
  const cryptoConfig = { ...cfg, salt, iv };
  const key = await deriveAesKey(cryptoConfig, password);

  const plaintextBytes = utf8ToBytes(JSON.stringify(plainObject));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: cfg.tagLength },
    key,
    plaintextBytes
  );

  return {
    version: cfg.version,
    crypto: {
      kdf: cfg.kdf,
      hash: cfg.hash,
      iterations: cfg.iterations,
      salt,
      cipher: cfg.cipher,
      iv,
      tagLength: cfg.tagLength,
      memoryKiB: cfg.memoryKiB,
      parallelism: cfg.parallelism,
      passes: cfg.passes,
    },
    ciphertext: new Uint8Array(ciphertext),
  };
}

export async function decryptJsonWithPassword(vaultMeta, encryptedBytes, password) {
  if (!vaultMeta?.crypto) throw new Error("Invalid vault metadata");

  const cfg = vaultMeta.crypto;
  const key = await deriveAesKey(cfg, password);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: cfg.iv, tagLength: cfg.tagLength },
      key,
      encryptedBytes
    );
  } catch {
    throw new Error("Invalid password or corrupted/tampered vault file");
  }

  const plainText = bytesToUtf8(new Uint8Array(plainBuf));
  return JSON.parse(plainText);
}
