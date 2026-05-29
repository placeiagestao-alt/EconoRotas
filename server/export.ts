import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import * as db from "./db";
import { storagePut } from "./storage";

function escapeCsvCell(value: unknown): string {
  return String(value ?? "").replace(/"/g, '""');
}

/**
 * Generate CSV content from route history
 */
export function generateRouteCSV(history: any[]): string {
  const headers = [
    "ID",
    "Rota",
    "Data",
    "Status",
    "Distância (km)",
    "Tempo (min)",
    "Notas",
  ];

  const rows = history.map((item) => [
    item.id,
    item.routeName || "N/A",
    new Date(item.executedDate).toLocaleDateString("pt-BR"),
    item.status,
    item.actualDistance ? parseFloat(String(item.actualDistance)).toFixed(2) : "N/A",
    item.actualTime || "N/A",
    item.notes || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${escapeCsvCell(cell)}"`).join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Generate PDF report from route history
 */
export async function generateRoutePDF(
  history: any[],
  userName: string,
  stats: any
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  const margin = 40;
  let yPosition = height - margin;

  // Helper function to draw text
  const drawText = (text: string, size: number = 12, isBold: boolean = false) => {
    const fontSize = size;
    page.drawText(text, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color: rgb(0, 0, 0),
      maxWidth: width - 2 * margin,
    });
    yPosition -= fontSize + 4;
  };

  // Title
  drawText("Relatório de Rotas", 20, true);
  yPosition -= 10;

  // User info
  drawText(`Usuário: ${userName}`, 11);
  drawText(`Data do Relatório: ${new Date().toLocaleDateString("pt-BR")}`, 11);
  yPosition -= 10;

  // Statistics section
  if (stats) {
    drawText("Estatísticas Gerais", 14, true);
    drawText(`Total de Rotas: ${stats.totalRoutes}`, 11);
    drawText(
      `Distância Total: ${stats.totalDistance ? parseFloat(String(stats.totalDistance)).toFixed(2) : "0"} km`,
      11
    );
    drawText(
      `Tempo Médio: ${stats.avgTime ? parseFloat(String(stats.avgTime)).toFixed(0) : "0"} minutos`,
      11
    );
    drawText(`Rotas Concluídas: ${stats.completedRoutes}`, 11);
    yPosition -= 10;
  }

  // History section
  if (history.length > 0) {
    drawText("Histórico de Execuções", 14, true);
    yPosition -= 5;

    // Table headers
    const colWidths = [80, 100, 80, 80, 80, 95];
    const headers = ["ID", "Rota", "Data", "Status", "Distância", "Tempo"];
    let xPos = margin;

    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: xPos,
        y: yPosition,
        size: 10,
        color: rgb(0, 0, 0),
      });
      xPos += colWidths[i];
    }

    yPosition -= 15;

    // Table rows
    for (const item of history.slice(0, 20)) {
      // Limit to 20 rows per page
      if (yPosition < margin + 20) {
        // Add new page if needed
      page.drawLine({
        start: { x: margin, y: yPosition + 5 },
        end: { x: width - margin, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.78, 0.78, 0.78),
      });
        break;
      }

      const rowData = [
        String(item.id),
        item.routeName || "N/A",
        new Date(item.executedDate).toLocaleDateString("pt-BR"),
        item.status,
        item.actualDistance ? parseFloat(String(item.actualDistance)).toFixed(2) : "N/A",
        item.actualTime ? `${item.actualTime}m` : "N/A",
      ];

      xPos = margin;
      for (let i = 0; i < rowData.length; i++) {
        page.drawText(rowData[i], {
          x: xPos,
          y: yPosition,
          size: 9,
          color: rgb(0, 0, 0),
        });
        xPos += colWidths[i];
      }

      yPosition -= 12;
    }
  }

  // Footer
  page.drawText("Gerado automaticamente pelo Sistema de Roteirização Inteligente", {
    x: margin,
    y: margin - 10,
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Export route history to S3
 */
export async function exportHistoryToS3(
  userId: number,
  format: "pdf" | "csv",
  fileName: string,
  userName: string = "Usuário"
): Promise<{ key: string; url: string }> {
  try {
    // Fetch history
    const history = await db.getUserRouteHistory(userId, 1000, 0);
    const stats = await db.getUserStats(userId);

    let fileContent: Buffer | string;
    let contentType: string;

    if (format === "csv") {
      fileContent = generateRouteCSV(history);
      contentType = "text/csv";
    } else {
      // PDF
      fileContent = await generateRoutePDF(history, userName, stats);
      contentType = "application/pdf";
    }

    // Upload to S3
    const storageKey = `exports/${userId}/${format}/${fileName}`;
    const result = await storagePut(storageKey, fileContent, contentType);

    return result;
  } catch (error) {
    console.error("[Export] Error:", error);
    throw new Error(`Erro ao exportar para ${format.toUpperCase()}`);
  }
}
