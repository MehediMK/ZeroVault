import { base64ToBytes, bytesToBase64 } from "./crypto/encoding.js";
import { encryptJsonWithPassword, decryptJsonWithPassword, DEFAULTS } from "./crypto/crypto.js";

function createDefaultSettings() {
  return {
    security: {
      inactivityMs: 2 * 60 * 1000,
      clipboardClearMs: 20000,
      preferredKdf: "PBKDF2",
      lockOnHide: false,
    },
  };
}

function normalizeEntry(entry = {}) {
  const now = new Date().toISOString();
  const passwordHistory = Array.isArray(entry.passwordHistory) ? entry.passwordHistory : [];
  return {
    id: entry.id || crypto.randomUUID(),
    title: entry.title || "",
    url: entry.url || "",
    username: entry.username || "",
    password: entry.password || "",
    notes: entry.notes || "",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    totpSecret: entry.totpSecret || "",
    totpDigits: entry.totpDigits || 6,
    totpPeriod: entry.totpPeriod || 30,
    history: Array.isArray(entry.history) ? entry.history : [],
    passwordHistory,
    passwordExpiryDays: Number(entry.passwordExpiryDays || 0) || 0,
    category: entry.category || "login",
    isSensitive: !!entry.isSensitive,
    isFavorite: !!entry.isFavorite,
    archived: !!entry.archived,
    importedFrom: entry.importedFrom || "",
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    lastPasswordChangeAt: entry.lastPasswordChangeAt || entry.updatedAt || now,
  };
}

function normalizeVaultData(data) {
  const now = new Date().toISOString();
  return {
    vaultName: data.vaultName || "My Vault",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    settings: {
      ...createDefaultSettings(),
      ...(data.settings || {}),
      security: {
        ...createDefaultSettings().security,
        ...(data.settings?.security || {}),
      },
    },
    saveHistory: Array.isArray(data.saveHistory) ? data.saveHistory : [],
    entries: Array.isArray(data.entries) ? data.entries.map(normalizeEntry) : [],
  };
}

export function newEmptyVaultPayload(vaultName = "My Vault") {
  return normalizeVaultData({ vaultName, entries: [] });
}

export function validateVaultFileShape(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");
  if (typeof obj.version !== "number") throw new Error("Missing version");
  if (!obj.crypto || typeof obj.crypto !== "object") throw new Error("Missing crypto");
  if (typeof obj.encryptedData !== "string") throw new Error("Missing encryptedData");
}

export function normalizeVaultMetaFromFile(obj) {
  const c = obj.crypto;
  if (!c.salt || !c.iv) throw new Error("Missing crypto salt/iv");
  return {
    version: obj.version,
    crypto: {
      kdf: c.kdf || "PBKDF2",
      hash: c.hash || "SHA-256",
      iterations: c.iterations || DEFAULTS.iterations,
      salt: base64ToBytes(c.salt),
      cipher: c.cipher || "AES-GCM",
      iv: base64ToBytes(c.iv),
      tagLength: c.tagLength ?? 128,
      memoryKiB: c.memoryKiB || DEFAULTS.memoryKiB,
      parallelism: c.parallelism || DEFAULTS.parallelism,
      passes: c.passes || DEFAULTS.passes,
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
      memoryKiB: cryptoMeta.memoryKiB,
      parallelism: cryptoMeta.parallelism,
      passes: cryptoMeta.passes,
    },
    encryptedData: bytesToBase64(ciphertextBytes),
  };
}

export async function createEncryptedVaultFile(payload, masterPassword, options = {}) {
  const enc = await encryptJsonWithPassword(normalizeVaultData(payload), masterPassword, options);
  return fileJsonFromEncrypted(enc.version, enc.crypto, enc.ciphertext);
}

export async function openEncryptedVaultFile(fileObj, masterPassword) {
  validateVaultFileShape(fileObj);
  const meta = normalizeVaultMetaFromFile(fileObj);
  const encryptedBytes = base64ToBytes(fileObj.encryptedData);
  const data = normalizeVaultData(await decryptJsonWithPassword(meta, encryptedBytes, masterPassword));
  return { meta, data };
}

export async function reencryptVaultToFile(vaultData, masterPassword, previousMeta = null, overrides = {}) {
  const nextKdf = overrides.kdf || vaultData?.settings?.security?.preferredKdf || previousMeta?.crypto?.kdf || "PBKDF2";
  const opts = {
    kdf: nextKdf,
    iterations: previousMeta?.crypto?.iterations || DEFAULTS.iterations,
    memoryKiB: previousMeta?.crypto?.memoryKiB || DEFAULTS.memoryKiB,
    parallelism: previousMeta?.crypto?.parallelism || DEFAULTS.parallelism,
    passes: previousMeta?.crypto?.passes || DEFAULTS.passes,
    ...overrides,
  };

  const enc = await encryptJsonWithPassword(normalizeVaultData(vaultData), masterPassword, opts);
  return fileJsonFromEncrypted(enc.version, enc.crypto, enc.ciphertext);
}

export function buildTimestampedFilename(filename = "vault.json") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parts = filename.split(".");
  if (parts.length < 2) return `${filename}-${stamp}.json`;
  const ext = parts.pop();
  return `${parts.join(".")}-${stamp}.${ext}`;
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
