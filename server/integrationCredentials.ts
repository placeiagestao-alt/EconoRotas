import crypto from "node:crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  if (!ENV.integrationCredentialsSecret || ENV.integrationCredentialsSecret.length < 32) {
    throw new Error("Configure INTEGRATION_CREDENTIALS_SECRET ou JWT_SECRET com no minimo 32 caracteres.");
  }

  return crypto.createHash("sha256").update(ENV.integrationCredentialsSecret).digest();
}

export function encryptIntegrationSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((item) => item.toString("base64url")).join(".");
}

export function decryptIntegrationSecret(value: string) {
  const [ivValue, authTagValue, encryptedValue] = value.split(".");
  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Credencial de integracao invalida.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
