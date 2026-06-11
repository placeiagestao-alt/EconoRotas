import * as XLSX from "xlsx";
import { parseRouteRows } from "./routeImportService";
import type { StopSourceProvider } from "@shared/stopMetadata";

type ParseWorkbookRequest = {
  type: "parse-workbook";
  fileName: string;
  sourceProvider?: StopSourceProvider | string;
  buffer: ArrayBuffer;
};

self.onmessage = (event: MessageEvent<ParseWorkbookRequest>) => {
  const payload = event.data;

  if (!payload || payload.type !== "parse-workbook") {
    return;
  }

  try {
    const workbook = XLSX.read(payload.buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("A planilha não possui abas.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });

    const parsed = parseRouteRows(rows, payload.fileName, payload.sourceProvider);
    self.postMessage({ ok: true, parsed });
  } catch (error: any) {
    self.postMessage({
      ok: false,
      message: error?.message || "Não foi possível processar a planilha.",
    });
  }
};
