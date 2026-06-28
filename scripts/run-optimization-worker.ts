import dotenv from "dotenv";
import fs from "node:fs";

const defaultEnvPath = fs.existsSync(".env.worker.production")
  ? ".env.worker.production"
  : ".env";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || defaultEnvPath });

await import("../server/optimizationWorker");
