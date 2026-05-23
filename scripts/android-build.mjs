import { spawn } from "node:child_process";

const mode = process.argv[2] || process.env.ANDROID_MODE || "android";
const capacitorAction = process.argv[3];
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code}`)
      );
    });
  });
}

if (!["android", "android-production"].includes(mode)) {
  throw new Error(
    `Invalid Android mode "${mode}". Use "android" or "android-production".`
  );
}

if (capacitorAction && !["copy", "sync"].includes(capacitorAction)) {
  throw new Error('Invalid Capacitor action. Use "copy" or "sync".');
}

const env = {
  ...process.env,
  CAPACITOR_ENV: mode,
};

await run(packageManager, ["exec", "vite", "build", "--mode", mode], env);

if (capacitorAction) {
  await run(packageManager, ["exec", "cap", capacitorAction, "android"], env);
}
