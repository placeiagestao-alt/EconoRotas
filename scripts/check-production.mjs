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
    check: value => typeof value === "string" && value.length >= 32,
    message: "use um segredo aleatório com pelo menos 32 caracteres",
  },
  {
    name: "INTEGRATION_CREDENTIALS_SECRET",
    check: value =>
      typeof (value || process.env.JWT_SECRET) === "string" &&
      (value || process.env.JWT_SECRET).length >= 32,
    message:
      "use um segredo aleatorio com pelo menos 32 caracteres para criptografar credenciais externas; JWT_SECRET e aceito como fallback",
  },
  {
    name: "PUBLIC_APP_URL",
    check: value => /^https:\/\/.+/i.test(value || ""),
    message: "use a URL pública HTTPS do app",
  },
  {
    name: "ALLOWED_ORIGINS",
    check: value => Boolean(value),
    message: "liste os domínios autorizados para CORS",
  },
  {
    name: "VITE_ENABLE_DEV_LOGIN",
    check: value => value !== "true",
    message: "login de desenvolvimento deve ficar desligado",
  },
  {
    name: "ALLOW_EPHEMERAL_DB",
    check: value => value !== "true",
    message:
      "banco temporário deve ficar desligado em produção; use armazenamento persistente",
  },
  {
    name: "OSRM_ENABLED",
    check: value => value !== "false",
    message: "mantenha OSRM_ENABLED=true para operacao comercial",
  },
  {
    name: "OSRM_BASE_URL",
    check: value => isOwnProductionOsrm(value),
    message:
      "configure uma URL HTTPS de OSRM proprio; router.project-osrm.org nao e aceito para escala",
  },
  {
    name: "OSRM_REQUIRED",
    check: value => value === "true",
    message:
      "use OSRM_REQUIRED=true para impedir fallback geografico silencioso em producao comercial",
  },
  {
    name: "OSRM_PROFILE",
    check: value => !value || /^[a-z0-9_-]+$/i.test(value),
    message: "use um perfil OSRM valido, por exemplo driving",
  },
];

const optionalWarnings = [
  {
    name: "REQUIRE_MANAGED_DATABASE",
    warn: value =>
      Number(process.env.CAPACITY_TARGET_USERS || 0) >= 50 && value !== "true",
    message:
      "para teste real com 50 usuarios, use REQUIRE_MANAGED_DATABASE=true e DATABASE_URL MySQL gerenciado",
  },
  {
    name: "DATABASE_SSL",
    warn: value => Boolean(process.env.DATABASE_URL) && value !== "true",
    message: "bancos gerenciados normalmente exigem SSL em produção",
  },
  {
    name: "NOMINATIM_CONTACT_EMAIL",
    warn: value => !value,
    message: "configure um e-mail de contato para uso responsável do geocoding",
  },
  {
    name: "DR_POLICY",
    warn: () =>
      [
        "DR_RPO_HOURS",
        "DR_RTO_HOURS",
        "DR_RESTORE_MAX_AGE_HOURS",
        "DR_RETENTION_DAYS",
      ].some(name => {
        const value = Number(process.env[name]);
        return !Number.isFinite(value) || value <= 0;
      }),
    message:
      "explicite valores numericos positivos para RPO, RTO, validade do restore e retencao",
  },
  {
    name: "DR_SCHEDULE_ENABLED",
    warn: value => value !== "true",
    message:
      "confirme true somente depois de validar a rotina recorrente de backup/restore",
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

function isOwnProductionOsrm(value) {
  try {
    const url = new URL(value || "");
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      hostname !== "router.project-osrm.org" &&
      !hostname.endsWith(".project-osrm.org")
    );
  } catch {
    return false;
  }
}

const failures = [];
const warnings = [];
const vercelEnvironment = process.env.VERCEL_ENV;
const enforceProductionReadiness =
  !vercelEnvironment || vercelEnvironment === "production";

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
  if (!enforceProductionReadiness) {
    console.log(
      `Check de produção em modo informativo para VERCEL_ENV=${vercelEnvironment}.`
    );
    console.log("Pendências exigidas antes de promover para produção:");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(0);
  }

  console.error("Ambiente ainda não está pronto para produção:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Ambiente pronto para produção.");
