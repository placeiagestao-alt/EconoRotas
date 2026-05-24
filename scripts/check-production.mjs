const required = [
  {
    name: "DATABASE_URL",
    check: (value) => Boolean(value),
    message: "defina um MySQL persistente para nao perder usuarios, rotas e historico",
  },
  {
    name: "JWT_SECRET",
    check: (value) => typeof value === "string" && value.length >= 32,
    message: "use um segredo aleatorio com pelo menos 32 caracteres",
  },
  {
    name: "PUBLIC_APP_URL",
    check: (value) => /^https:\/\/.+/i.test(value || ""),
    message: "use a URL publica HTTPS do app",
  },
  {
    name: "ALLOWED_ORIGINS",
    check: (value) => Boolean(value),
    message: "liste os dominios autorizados para CORS",
  },
  {
    name: "VITE_ENABLE_DEV_LOGIN",
    check: (value) => value !== "true",
    message: "login de desenvolvimento deve ficar desligado",
  },
];

const optionalWarnings = [
  {
    name: "ALLOW_EPHEMERAL_DB",
    warn: (value) => value === "true",
    message: "banco temporario esta ligado; isso serve para demo, nao para cliente real",
  },
  {
    name: "DATABASE_SSL",
    warn: (value) => value !== "true",
    message: "bancos gerenciados normalmente exigem SSL em producao",
  },
  {
    name: "NOMINATIM_CONTACT_EMAIL",
    warn: (value) => !value,
    message: "configure um e-mail de contato para uso responsavel do geocoding",
  },
];

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
  console.log("Avisos de producao:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("Ambiente ainda nao esta pronto para producao:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Ambiente pronto para producao.");
