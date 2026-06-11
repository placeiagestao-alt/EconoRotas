import dotenv from "dotenv";
import fs from "node:fs";

for (const path of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.worker.production",
]) {
  if (fs.existsSync(path)) dotenv.config({ path });
}

const required = [
  {
    name: "PERSISTENT_STORAGE",
    check: () => hasPersistentStorage(),
    message:
      "configure DATABASE_URL com MySQL gerenciado ou KV_REST_API_URL/KV_REST_API_TOKEN (Upstash Redis)",
  },
  {
    name: "JWT_SECRET",
    check: (value) => typeof value === "string" && value.length >= 32,
    message: "use um segredo aleatório com pelo menos 32 caracteres",
  },
  {
    name: "INTEGRATION_CREDENTIALS_SECRET",
    check: (value) => typeof value === "string" && value.length >= 32,
    message:
      "use um segredo aleatorio com pelo menos 32 caracteres para criptografar credenciais externas",
  },
  {
    name: "PUBLIC_APP_URL",
    check: (value) => /^https:\/\/.+/i.test(value || ""),
    message: "use a URL pública HTTPS do app",
  },
  {
    name: "ALLOWED_ORIGINS",
    check: (value) => Boolean(value),
    message: "liste os domínios autorizados para CORS",
  },
  {
    name: "VITE_ENABLE_DEV_LOGIN",
    check: (value) => value !== "true",
    message: "login de desenvolvimento deve ficar desligado",
  },
  {
    name: "ALLOW_EPHEMERAL_DB",
    check: (value) => value !== "true",
    message:
      "banco temporário deve ficar desligado em produção; use armazenamento persistente",
  },
];

const optionalWarnings = [
  {
    name: "REQUIRE_MANAGED_DATABASE",
    warn: (value) => Number(process.env.CAPACITY_TARGET_USERS || 0) >= 50 && value !== "true",
    message:
      "para teste real com 50 usuarios, use REQUIRE_MANAGED_DATABASE=true e DATABASE_URL MySQL gerenciado",
  },
  {
    name: "DATABASE_SSL",
    warn: (value) => Boolean(process.env.DATABASE_URL) && value !== "true",
    message: "bancos gerenciados normalmente exigem SSL em produção",
  },
  {
    name: "NOMINATIM_CONTACT_EMAIL",
    warn: (value) => !value,
    message: "configure um e-mail de contato para uso responsável do geocoding",
  },
  {
    name: "OSRM_BASE_URL",
    warn: (value) =>
      Number(process.env.CAPACITY_TARGET_USERS || 0) >= 50 &&
      (!value || value.includes("router.project-osrm.org")),
    message:
      "para teste real com 50 usuarios, configure uma instancia OSRM propria e evite depender do router.project-osrm.org",
  },
  {
    name: "OSRM_REQUIRED",
    warn: (value) =>
      Number(process.env.CAPACITY_TARGET_USERS || 0) >= 50 && value !== "true",
    message:
      "ative OSRM_REQUIRED=true depois de configurar OSRM proprio para impedir fallback geografico silencioso",
  },
];

function isPersistentDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return ![
      "mysql",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "host.docker.internal",
    ].includes(hostname);
  } catch {
    return false;
  }
}

function hasRedisRestConfig() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function hasPersistentStorage() {
  return (
    (Boolean(process.env.DATABASE_URL) &&
      isPersistentDatabaseUrl(process.env.DATABASE_URL)) ||
    (!requiresManagedDatabase() && hasRedisRestConfig())
  );
}

function requiresManagedDatabase() {
  return process.env.REQUIRE_MANAGED_DATABASE === "true";
}

const failures = [];
const warnings = [];

for (const item of required) {
  const value = process.env[item.name];
  if (!item.check(value)) {
    failures.push(`${item.name}: ${item.message}`);
  }
}

for (const item of optionalWarnings) {
  const value = process.env[item.name];
  if (item.warn(value)) {
    warnings.push(`${item.name}: ${item.message}`);
  }
}

if (warnings.length > 0) {
  console.log("Avisos de produção:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("Ambiente ainda não está pronto para produção:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Ambiente pronto para produção.");
