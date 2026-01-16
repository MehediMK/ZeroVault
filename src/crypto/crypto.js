import { utf8ToBytes, bytesToUtf8, randomBytes } from "./encoding.js";

export const DEFAULTS = {
  version: 1,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations: 310000,
  cipher: "AES-GCM",
  tagLength: 128,
  saltBytes: 16,
  ivBytes: 12,
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

export async function encryptJsonWithPassword(plainObject, password, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const salt = randomBytes(cfg.saltBytes);
  const iv = randomBytes(cfg.ivBytes);
  const key = await deriveAesKeyPBKDF2(password, salt, cfg.iterations);

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
    },
    ciphertext: new Uint8Array(ciphertext),
  };
}

export async function decryptJsonWithPassword(vaultMeta, encryptedBytes, password) {
  if (!vaultMeta?.crypto) throw new Error("Invalid vault metadata");

  const { iterations, salt, iv, tagLength, kdf, cipher } = vaultMeta.crypto;

  if (vaultMeta.version !== 1) throw new Error("Unsupported vault version");
  if (kdf !== "PBKDF2") throw new Error("Unsupported KDF");
  if (cipher !== "AES-GCM") throw new Error("Unsupported cipher");

  const key = await deriveAesKeyPBKDF2(password, salt, iterations);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength },
      key,
      encryptedBytes
    );
  } catch {
    // Wrong password or tampered file => same response
    throw new Error("Invalid password or corrupted/tampered vault file");
  }

  const plainText = bytesToUtf8(new Uint8Array(plainBuf));
  const obj = JSON.parse(plainText);
  return obj;
}
