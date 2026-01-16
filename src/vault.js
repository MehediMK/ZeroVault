import { base64ToBytes, bytesToBase64 } from "./crypto/encoding.js";
import { encryptJsonWithPassword, decryptJsonWithPassword } from "./crypto/crypto.js";

export function newEmptyVaultPayload(vaultName = "My Vault") {
  const now = new Date().toISOString();
  return {
    vaultName,
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
}

export function validateVaultFileShape(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");
  if (typeof obj.version !== "number") throw new Error("Missing version");
  if (!obj.crypto || typeof obj.crypto !== "object") throw new Error("Missing crypto");
  if (typeof obj.encryptedData !== "string") throw new Error("Missing encryptedData");
}

export function normalizeVaultMetaFromFile(obj) {
  // Convert base64 salt/iv into Uint8Array for WebCrypto use
  const c = obj.crypto;
  if (!c.salt || !c.iv) throw new Error("Missing crypto salt/iv");
  return {
    version: obj.version,
    crypto: {
      kdf: c.kdf,
      hash: c.hash,
      iterations: c.iterations,
      salt: base64ToBytes(c.salt),
      cipher: c.cipher,
      iv: base64ToBytes(c.iv),
      tagLength: c.tagLength ?? 128,
    },
  };
}

export function fileJsonFromEncrypted(version, cryptoMeta, ciphertextBytes) {
  return {
    version,
    crypto: {
      kdf: cryptoMeta.kdf,
      hash: cryptoMeta.hash,
      iterations: cryptoMeta.iterations,
      salt: bytesToBase64(cryptoMeta.salt),
      cipher: cryptoMeta.cipher,
      iv: bytesToBase64(cryptoMeta.iv),
      tagLength: cryptoMeta.tagLength,
    },
    encryptedData: bytesToBase64(ciphertextBytes),
  };
}

export async function createEncryptedVaultFile(payload, masterPassword) {
  const enc = await encryptJsonWithPassword(payload, masterPassword);
  return fileJsonFromEncrypted(enc.version, enc.crypto, enc.ciphertext);
}

export async function openEncryptedVaultFile(fileObj, masterPassword) {
  validateVaultFileShape(fileObj);
  const meta = normalizeVaultMetaFromFile(fileObj);
  const encryptedBytes = base64ToBytes(fileObj.encryptedData);
  const data = await decryptJsonWithPassword(meta, encryptedBytes, masterPassword);
  return { meta, data };
}

export async function reencryptVaultToFile(vaultData, masterPassword, previousMeta = null) {
  // Optionally keep same iterations; always new salt+iv per save.
  const opts = previousMeta?.crypto?.iterations
    ? { iterations: previousMeta.crypto.iterations }
    : {};

  const enc = await encryptJsonWithPassword(vaultData, masterPassword, opts);
  return fileJsonFromEncrypted(enc.version, enc.crypto, enc.ciphertext);
}

export function downloadJson(obj, filename = "vault.json") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}
