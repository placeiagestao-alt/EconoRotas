import { defineConfig } from "drizzle-kit";
import fs from "node:fs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

function getDbCredentials() {
  if (process.env.DATABASE_SSL !== "true") {
    return { url: connectionString };
  }

  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ca: getDatabaseSslCa(),
    },
  };
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

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: getDbCredentials(),
});
