import { spawn } from "node:child_process";

const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "corepack";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "corepack", "pnpm", "exec", "tsx", "watch", "server/_core/start.ts"]
    : ["pnpm", "exec", "tsx", "watch", "server/_core/start.ts"];
const nodeOptions = process.env.NODE_OPTIONS || "";
const nodeOptionsWithSystemCa = nodeOptions.includes("--use-system-ca")
  ? nodeOptions
  : [nodeOptions, "--use-system-ca"].filter(Boolean).join(" ");

const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    NODE_OPTIONS: nodeOptionsWithSystemCa,
  },
});

child.on("exit", code => {
  process.exitCode = code ?? 1;
});
