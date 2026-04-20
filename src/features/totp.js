import { utf8ToBytes } from "../crypto/encoding.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeBase32(secret) {
  return secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function isValidTotpSecret(secret) {
  return normalizeBase32(secret).length >= 16;
}

export function base32ToBytes(secret) {
  const normalized = normalizeBase32(secret);
  let bits = "";
  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 TOTP secret.");
    bits += idx.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(secretBytes, counterBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, counterBytes);
  return new Uint8Array(sig);
}

function numberToCounterBytes(counter) {
  const bytes = new Uint8Array(8);
  let value = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(value & 255n);
    value >>= 8n;
  }
  return bytes;
}

export async function generateTotpCode(secret, options = {}) {
  const period = options.period || 30;
  const digits = options.digits || 6;
  const epoch = options.now ? Math.floor(options.now / 1000) : Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);
  const secretBytes = base32ToBytes(secret);
  const digest = await hmacSha1(secretBytes, numberToCounterBytes(counter));
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  const otp = String(binary % (10 ** digits)).padStart(digits, "0");
  const expiresIn = period - (epoch % period);
  return { code: otp, expiresIn };
}

export function formatTotpLabel(entry) {
  const issuer = entry.title || entry.url || "ZeroVault";
  const account = entry.username || "account";
  return `${issuer} (${account})`;
}

export function createOtpAuthUrl(entry) {
  if (!entry.totpSecret) return "";
  const label = encodeURIComponent(formatTotpLabel(entry));
  return `otpauth://totp/${label}?secret=${encodeURIComponent(normalizeBase32(entry.totpSecret))}&digits=${entry.totpDigits || 6}&period=${entry.totpPeriod || 30}`;
}

export function secretFromText(text) {
  return normalizeBase32(text);
}
