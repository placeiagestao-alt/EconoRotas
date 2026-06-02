import fs from "node:fs";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;

function fail(message) {
  console.error(`[MySQL] ${message}`);
  process.exit(1);
}

function readPositiveIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readNonNegativeIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function shouldUseSsl(url) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;

  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(url);
}

function getDatabaseSslCa() {
  if (process.env.DATABASE_SSL_CA) {
    return process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n");
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    return fs.readFileSync(caPath, "utf8");
  }

  return undefined;
}

function assertManagedMysqlUrl(value) {
  if (!value) fail("DATABASE_URL nao foi configurado.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("DATABASE_URL invalido.");
  }

  if (!["mysql:", "mysql2:"].includes(parsed.protocol)) {
    fail("DATABASE_URL precisa ser MySQL. Nao use Postgres/Supabase neste projeto.");
  }

  const host = parsed.hostname.toLowerCase();
  const blockedHosts = new Set([
    "mysql",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "host.docker.internal",
  ]);

  if (blockedHosts.has(host)) {
    fail("DATABASE_URL aponta para host local/Docker. Use MySQL gerenciado acessivel pela Vercel.");
  }

  if (!parsed.username || !parsed.password || parsed.pathname.length <= 1) {
    fail("DATABASE_URL precisa conter usuario, senha e nome do banco.");
  }
}

function getPoolOptions(value) {
  const options = {
    uri: value,
    waitForConnections: true,
    connectionLimit: readPositiveIntegerEnv("DB_CONNECTION_LIMIT", 3),
    queueLimit: readNonNegativeIntegerEnv("DB_QUEUE_LIMIT", 0),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  if (shouldUseSsl(value)) {
    options.ssl = {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ca: getDatabaseSslCa(),
    };
  }

  return options;
}

assertManagedMysqlUrl(databaseUrl);

const pool = mysql.createPool(getPoolOptions(databaseUrl));

try {
  const [rows] = await pool.query(
    "SELECT DATABASE() AS database_name, VERSION() AS version, @@hostname AS host"
  );
  const [tables] = await pool.query("SHOW TABLES");

  console.log("[MySQL] Conexao OK.");
  console.log(
    JSON.stringify(
      {
        database: rows[0]?.database_name,
        host: rows[0]?.host,
        version: rows[0]?.version,
        ssl: shouldUseSsl(databaseUrl),
        pool: {
          connectionLimit: readPositiveIntegerEnv("DB_CONNECTION_LIMIT", 3),
          queueLimit: readNonNegativeIntegerEnv("DB_QUEUE_LIMIT", 0),
        },
        tables: tables.length,
      },
      null,
      2
    )
  );
} catch (error) {
  fail(error instanceof Error ? error.message : "Erro desconhecido ao conectar.");
} finally {
  await pool.end();
}
