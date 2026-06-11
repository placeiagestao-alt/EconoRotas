import fs from "node:fs";
import dotenv from "dotenv";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "mysql", "host.docker.internal"].includes(
      hostname
    );
  } catch {
    return true;
  }
}

dotenv.config({ quiet: true });
if (isLocalDatabaseUrl(process.env.DATABASE_URL) && fs.existsSync(".env.worker.production")) {
  dotenv.config({ path: ".env.worker.production", override: true, quiet: true });
}

const { getMultiVehicleReadinessDashboard } = await import(
  "../server/multiVehicleReadiness"
);
const readiness = await getMultiVehicleReadinessDashboard();

console.log(JSON.stringify(readiness, null, 2));

if (readiness.status !== "READY") {
  process.exit(1);
}

process.exit(0);
