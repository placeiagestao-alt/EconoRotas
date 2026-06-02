import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const getArg = (name, fallback) => {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  return value || fallback;
};
const outputDirArg = getArg("out", path.join(".tmp", "imile-capture"));
const outputDir = path.isAbsolute(outputDirArg) ? outputDirArg : path.join(repoRoot, outputDirArg);
const mergedFile = path.join(outputDir, "imile-capture-merged.xml");
const textFile = path.join(outputDir, "imile-capture-lines.txt");
const summaryFile = path.join(outputDir, "imile-capture-summary.json");
const packageName = "com.imile.redelivery";
const maxPages = Number(getArg("pages", "")) || 80;
const scrollDelayMs = Number(getArg("delay", "")) || 900;
const uploadUrl = getArg("upload-url", process.env.IMILE_CAPTURE_UPLOAD_URL || "");
const uploadToken = getArg("upload-token", process.env.IMILE_CAPTURE_UPLOAD_TOKEN || "");
const uploadOwner = getArg("owner", process.env.IMILE_CAPTURE_OWNER || "");

function runAdb(args, options = {}) {
  return execFileSync("adb", args, {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function ensureDevice() {
  const devices = runAdb(["devices"])
    .split(/\r?\n/)
    .filter((line) => /\tdevice$/.test(line));

  if (!devices.length) {
    throw new Error("Nenhum Android conectado via ADB.");
  }
}

function ensureImileIsOpen() {
  const focus = runAdb(["shell", "dumpsys", "window"]);
  if (!focus.includes(packageName)) {
    runAdb(["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"]);
    sleep(2500);
  }

  const nextFocus = runAdb(["shell", "dumpsys", "window"]);
  if (!nextFocus.includes(packageName)) {
    throw new Error("Rider Delivery/iMile nao esta em foco. Abra o app e a lista de entregas antes de capturar.");
  }
}

function dumpPage(page) {
  const remotePath = `/sdcard/imile-capture-${page}.xml`;
  const localPath = path.join(outputDir, `page-${String(page).padStart(3, "0")}.xml`);

  runAdb(["shell", "uiautomator", "dump", remotePath]);
  runAdb(["pull", remotePath, localPath]);
  return fs.readFileSync(localPath, "utf8");
}

function decodeXmlEntities(value) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function extractLines(xml) {
  return Array.from(xml.matchAll(/content-desc="([^"]*)"/g))
    .map((match) => decodeXmlEntities(match[1] || ""))
    .join("\n")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikeAddress(value) {
  const normalized = normalize(value);
  return (
    value.includes(",") &&
    /\b(rua|av|avenida|travessa|rodovia|estrada|alameda|jardim|vila|presidente prudente|sao paulo)\b/.test(
      normalized
    )
  );
}

function extractAddressKeys(xml) {
  return extractLines(xml).filter(looksLikeAddress).map(normalize);
}

function extractUniqueLines(pages) {
  const seen = new Set();
  const lines = [];

  pages.flatMap(extractLines).forEach((line) => {
    const key = normalize(line);
    if (!key || seen.has(key)) return;

    seen.add(key);
    lines.push(line);
  });

  return lines;
}

function prepareDeliveryList() {
  let xml = dumpPage("prepare");
  let lines = extractLines(xml);

  if (lines.some((line) => /^Leitura de entrega$/i.test(line))) {
    runAdb(["shell", "input", "keyevent", "4"]);
    sleep(1200);
    xml = dumpPage("prepare-back");
    lines = extractLines(xml);
  }

  if (!lines.some((line) => /^Ordenar$/i.test(line)) && lines.some((line) => /^Entrega$/i.test(line))) {
    runAdb(["shell", "input", "tap", "270", "1430"]);
    sleep(2000);
  }

  xml = dumpPage("prepare-list");
  lines = extractLines(xml);
  if (!lines.some((line) => /^Ordenar$/i.test(line))) {
    runAdb(["shell", "input", "tap", "270", "1430"]);
    sleep(2000);
  }

  for (let index = 0; index < 8; index += 1) {
    runAdb(["shell", "input", "swipe", "360", "610", "360", "1280", "550"]);
    sleep(450);
  }
}

function scrollDown() {
  runAdb(["shell", "input", "swipe", "360", "1320", "360", "720", "850"]);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function uploadCaptureIfConfigured(xml) {
  if (!uploadUrl) return;

  if (!uploadToken) {
    throw new Error("Informe --upload-token ou IMILE_CAPTURE_UPLOAD_TOKEN para enviar a captura.");
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "x-imile-capture-token": uploadToken,
      ...(uploadOwner ? { "x-imile-capture-owner": uploadOwner } : {}),
    },
    body: xml,
  });
  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`Falha ao enviar captura: HTTP ${response.status} ${payload}`);
  }

  console.log(`Captura enviada para API: ${payload}`);
}

function buildMergedXml(pages) {
  const content = pages
    .map((xml, index) =>
      xml
        .replace(/^<\?xml[^>]*\?>\s*/i, "")
        .replace(/^<hierarchy[^>]*>/i, `<page index="${index + 1}">`)
        .replace(/<\/hierarchy>\s*$/i, "</page>")
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<imileCapture pages="${pages.length}">\n${content}\n</imileCapture>\n`;
}

fs.mkdirSync(outputDir, { recursive: true });
ensureDevice();
ensureImileIsOpen();
prepareDeliveryList();

const pages = [];
const seenPageSignatures = new Set();
const seenAddresses = new Set();
let stablePages = 0;
let emptyPages = 0;

for (let page = 1; page <= maxPages; page += 1) {
  const xml = dumpPage(page);
  const addressKeys = extractAddressKeys(xml);
  const signature = addressKeys.join("|") || normalize(extractLines(xml).slice(0, 20).join("|"));

  if (seenPageSignatures.has(signature)) {
    stablePages += 1;
  } else {
    stablePages = 0;
    if (addressKeys.length > 0) {
      seenPageSignatures.add(signature);
      pages.push(xml);
      addressKeys.forEach((key) => seenAddresses.add(key));
    }
  }

  emptyPages = addressKeys.length === 0 ? emptyPages + 1 : 0;

  console.log(
    `Pagina ${page}: ${addressKeys.length} endereco(s) visiveis, ${seenAddresses.size} endereco(s) unico(s).`
  );

  if (stablePages >= 3 || emptyPages >= 8) {
    break;
  }

  scrollDown();
  sleep(scrollDelayMs);
}

const mergedXml = buildMergedXml(pages);

fs.writeFileSync(mergedFile, mergedXml, "utf8");
fs.writeFileSync(textFile, `${extractUniqueLines(pages).join("\n")}\n`, "utf8");
fs.writeFileSync(
  summaryFile,
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      packageName,
      pages: pages.length,
      uniqueAddresses: seenAddresses.size,
      maxPages,
      scrollDelayMs,
      files: {
        mergedXml: mergedFile,
        text: textFile,
      },
    },
    null,
    2
  )}\n`,
  "utf8"
);
console.log(`Captura consolidada: ${mergedFile}`);
console.log(`Texto extraido: ${textFile}`);
console.log(`Resumo da captura: ${summaryFile}`);
console.log(`Enderecos unicos detectados: ${seenAddresses.size}`);
await uploadCaptureIfConfigured(mergedXml);
