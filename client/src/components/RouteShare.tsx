import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Share2, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  Mail, 
  Link as LinkIcon,
  FileText,
  QrCode
} from "lucide-react";

interface Stop {
  address: string;
  latitude: number;
  longitude: number;
  sequence?: number;
}

interface RouteShareProps {
  routeId?: number;
  routeName: string;
  description?: string;
  stops: Stop[];
  totalDistance?: number;
  totalDuration?: number;
  mode?: string;
  onExportPDF?: () => Promise<void>;
}

export default function RouteShare({
  routeId,
  routeName,
  description,
  stops,
  totalDistance,
  totalDuration,
  mode,
  onExportPDF,
}: RouteShareProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const escapeCsv = (value: unknown) => String(value ?? "").replace(/"/g, '""');

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  };

  const generateShareLink = async () => {
    if (!routeId) {
      toast.error("Salve a rota primeiro para gerar um link compartilh\u00e1vel");
      return;
    }

    setIsGeneratingLink(true);
    try {
      // Generate a shareable link with route data
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/routes/${routeId}`;
      setShareLink(link);
    } catch (error) {
      toast.error("Erro ao gerar link compartilh\u00e1vel");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      toast.success("Link copiado para a area de transferencia!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar link");
    }
  };

  const handleExportPDF = async () => {
    if (!onExportPDF) {
      toast.error("Função de exportação não disponível");
      return;
    }

    setIsExportingPDF(true);
    try {
      await onExportPDF();
      toast.success("PDF exportado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao exportar PDF");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportJSON = () => {
    try {
      const routeData = {
        name: routeName,
        description,
        mode,
        totalDistance,
        totalDuration: totalDuration ? formatDuration(totalDuration) : undefined,
        stops: stops.map(s => ({
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          sequence: s.sequence,
        })),
        exportedAt: new Date().toISOString(),
      };

      const dataStr = JSON.stringify(routeData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rota-${routeName.replace(/\s+/g, "-").toLowerCase()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("JSON exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar JSON");
    }
  };

  const handleExportCSV = () => {
    try {
      let csv = "Rota,Descrição,Modo,Distância Total,Tempo Total\n";
      csv += `"${escapeCsv(routeName)}","${escapeCsv(description || "")}","${escapeCsv(mode || "")}","${escapeCsv(totalDistance?.toFixed(2) || "N/A")} km","${escapeCsv(totalDuration ? formatDuration(totalDuration) : "N/A")}"\n\n`;
      
      csv += "Sequência,Endereço,Latitude,Longitude\n";
      stops.forEach((stop, idx) => {
        csv += `${(stop.sequence || idx) + 1},"${escapeCsv(stop.address)}",${stop.latitude},${stop.longitude}\n`;
      });

      const dataBlob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rota-${routeName.replace(/\s+/g, "-").toLowerCase()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("CSV exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar CSV");
    }
  };

  const handleShareViaEmail = async () => {
    if (!shareLink) {
      toast.error("Gere o link compartilh\u00e1vel primeiro");
      return;
    }

    if (!shareEmail.trim()) {
      toast.error("Digite um e-mail v\u00e1lido");
      return;
    }

    try {
      // In a real app, this would call a backend endpoint to send email
      const subject = `Compartilhamento de Rota: ${routeName}`;
      const body = `Olá!\n\nGostaria de compartilhar a rota "${routeName}" com você.\n\nDetalhes:\n- Distância: ${totalDistance?.toFixed(2) || "N/A"} km\n- Tempo: ${totalDuration ? formatDuration(totalDuration) : "N/A"}\n- Paradas: ${stops.length}\n\nAcesse o link para visualizar:\n${shareLink}\n\nAtenciosamente`;
      
      const mailtoLink = `mailto:${shareEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
      
      toast.success("E-mail aberto. Envie para compartilhar a rota!");
      setShareEmail("");
    } catch (error) {
      toast.error("Erro ao preparar e-mail");
    }
  };

  return (
    <div className="space-y-4">
      {/* Share Button */}
      <Card className="border-primary/30 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Compartilhar & Exportar</h3>
            <p className="mt-1 text-sm text-muted-foreground">Exporte sua rota ou compartilhe com outras pessoas</p>
          </div>
          <Button
            onClick={() => {
              setShowShareDialog(true);
              if (!shareLink) {
                generateShareLink();
              }
            }}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Compartilhar
          </Button>
        </div>
      </Card>

      {/* Quick Export Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Export PDF */}
        <Button
          variant="outline"
          onClick={handleExportPDF}
          disabled={isExportingPDF}
          className="gap-2 flex flex-col h-auto py-3"
        >
          {isExportingPDF ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span className="text-xs">PDF</span>
        </Button>

        {/* Export JSON */}
        <Button
          variant="outline"
          onClick={handleExportJSON}
          className="gap-2 flex flex-col h-auto py-3"
        >
          <Download className="w-4 h-4" />
          <span className="text-xs">JSON</span>
        </Button>

        {/* Export CSV */}
        <Button
          variant="outline"
          onClick={handleExportCSV}
          className="gap-2 flex flex-col h-auto py-3"
        >
          <Download className="w-4 h-4" />
          <span className="text-xs">CSV</span>
        </Button>

        {/* Share Link */}
        <Button
          variant="outline"
          onClick={() => {
            setShowShareDialog(true);
            if (!shareLink) {
              generateShareLink();
            }
          }}
          className="gap-2 flex flex-col h-auto py-3"
        >
          <LinkIcon className="w-4 h-4" />
          <span className="text-xs">Link</span>
        </Button>
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compartilhar Rota</DialogTitle>
            <DialogDescription>
              Escolha como deseja compartilhar "{routeName}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Share Link Section */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link Compartilh\u00e1vel</Label>
              {shareLink ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={shareLink}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyToClipboard}
                    className="gap-1"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-accent" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={generateShareLink}
                  disabled={isGeneratingLink}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {isGeneratingLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LinkIcon className="w-4 h-4" />
                  )}
                  Gerar Link
                </Button>
              )}
            </div>

            {/* Share via Email */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Compartilhar por E-mail</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleShareViaEmail}
                  disabled={!shareLink}
                  className="gap-1"
                >
                  <Mail className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Export Options */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Exportar Como</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="gap-1"
                >
                  {isExportingPDF ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportJSON}
                  className="gap-1"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCSV}
                  className="gap-1"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </Button>
              </div>
            </div>

            {/* Route Summary */}
            {(totalDistance || totalDuration) && (
              <Alert className="border-primary/35 bg-primary/10">
                <AlertDescription className="text-sm">
                  <strong>Resumo da Rota:</strong>
                  <div className="mt-2 space-y-1 text-xs">
                    <div>Distância: {totalDistance?.toFixed(2) || "N/A"} km</div>
                    <div>Tempo: {totalDuration ? formatDuration(totalDuration) : "N/A"}</div>
                    <div>Paradas: {stops.length}</div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



