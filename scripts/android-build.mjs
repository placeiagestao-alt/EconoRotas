import fs from "node:fs";
import { spawn } from "node:child_process";

const mode = process.argv[2] || process.env.ANDROID_MODE || "android";
const capacitorAction = process.argv[3];
const androidGradleFile = "android/app/build.gradle";
const webOutputDir = "dist/public";
const androidWebAssetsDir = "android/app/src/main/assets/public";

function getCorepackCommand(args) {
  if (process.platform !== "win32") {
    return { command: "corepack", args };
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", "corepack", ...args],
  };
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
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

function resolveAndroidVersionName() {
  try {
    const buildGradle = fs.readFileSync(androidGradleFile, "utf8");
    const match = buildGradle.match(/versionName\s+"([^"]+)"/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // Ignore and fallback below.
  }

  return process.env.npm_package_version || "1.0.0";
}

if (!["android", "android-production", "android-store"].includes(mode)) {
  throw new Error(
    `Invalid Android mode "${mode}". Use "android", "android-production", or "android-store".`
  );
}

if (capacitorAction && !["copy", "sync"].includes(capacitorAction)) {
  throw new Error('Invalid Capacitor action. Use "copy" or "sync".');
}

const isProductionLikeAndroid = mode !== "android";
const viteMode = mode === "android-store" ? "android-production" : mode;
const capacitorEnv = isProductionLikeAndroid ? "android-production" : "android";

const env = {
  ...process.env,
  CAPACITOR_ENV: capacitorEnv,
  VITE_ANDROID_APP_VERSION:
    process.env.VITE_ANDROID_APP_VERSION || resolveAndroidVersionName(),
};

if (isProductionLikeAndroid) {
  env.VITE_API_BASE_URL = "https://econo-rotas.vercel.app";
  env.VITE_ENABLE_DEV_LOGIN = "false";
}

if (mode === "android-store") {
  env.VITE_ANDROID_DISTRIBUTION_CHANNEL = "store";
}

fs.rmSync(webOutputDir, { recursive: true, force: true });

const buildCommand = getCorepackCommand(["pnpm", "exec", "vite", "build", "--mode", viteMode]);
await run(buildCommand.command, buildCommand.args, env);

if (mode.startsWith("android")) {
  fs.rmSync("dist/public/downloads", { recursive: true, force: true });
  fs.rmSync(androidWebAssetsDir, { recursive: true, force: true });
}

if (mode === "android-store") {
  const assetsDir = "dist/public/assets";
  if (fs.existsSync(assetsDir)) {
    for (const entry of fs.readdirSync(assetsDir)) {
      if (/^(DownloadApk|AndroidUpdateBannerDirect)-/.test(entry)) {
        fs.rmSync(`${assetsDir}/${entry}`, { force: true });
      }
    }
  }
}

if (capacitorAction) {
  const capacitorCommand = getCorepackCommand(["pnpm", "exec", "cap", capacitorAction, "android"]);
  await run(capacitorCommand.command, capacitorCommand.args, env);
}
