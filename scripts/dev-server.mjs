import { spawn } from "node:child_process";

const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "corepack";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "corepack", "pnpm", "exec", "tsx", "watch", "server/_core/start.ts"]
    : ["pnpm", "exec", "tsx", "watch", "server/_core/start.ts"];

const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
  },
});

child.on("exit", code => {
  process.exitCode = code ?? 1;
});
