import * as XLSX from "xlsx";
import { parseRouteRows } from "./routeImportService";

type ParseWorkbookRequest = {
  type: "parse-workbook";
  fileName: string;
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
      throw new Error("A planilha nao possui abas.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });

    const parsed = parseRouteRows(rows, payload.fileName);
    self.postMessage({ ok: true, parsed });
  } catch (error: any) {
    self.postMessage({
      ok: false,
      message: error?.message || "Nao foi possivel processar a planilha.",
    });
  }
};
