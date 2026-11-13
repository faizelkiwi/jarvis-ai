import crypto from "node:crypto";

/**
 * AES-256-GCM envelope for secrets stored in the database.
 * Key: JARVIS_ENCRYPTION_KEY (32 bytes, base64 or hex). In development a key is
 * derived and persisted to .data/dev-encryption-key so restarts keep working.
 */
let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.JARVIS_ENCRYPTION_KEY;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("JARVIS_ENCRYPTION_KEY must decode to exactly 32 bytes");
    cachedKey = buf;
    return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JARVIS_ENCRYPTION_KEY is required in production");
  }
  // Development / test fallback: persisted random key (never used in production).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const file = path.join(process.cwd(), ".data", "dev-encryption-key");
  if (process.env.NODE_ENV !== "test" && fs.existsSync(file)) {
    cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  } else {
    cachedKey = crypto.randomBytes(32);
    if (process.env.NODE_ENV !== "test") {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, cachedKey.toString("hex"), { mode: 0o600 });
    }
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", loadKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Redacts anything that looks like a credential before it reaches logs or prompts. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_\-]{10,}/g, "[REDACTED_KEY]")
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, "[REDACTED_KEY]")
    .replace(/AIza[0-9A-Za-z_\-]{30,}/g, "[REDACTED_KEY]")
    .replace(/\b\d{8,10}:[A-Za-z0-9_\-]{30,}\b/g, "[REDACTED_TOKEN]")
    .replace(/(bearer\s+)[A-Za-z0-9._\-]{20,}/gi, "$1[REDACTED]");
}
