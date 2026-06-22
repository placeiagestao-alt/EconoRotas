import { Button } from "@/components/ui/button";
import { Download, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getInstallGuidance() {
  if (typeof navigator === "undefined") {
    return "Abra o EconoRota no navegador do celular e adicione o app a tela inicial.";
  }

  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "No iPhone, abra no Safari, toque em Compartilhar e escolha Adicionar a Tela de Inicio.";
  }

  if (/Android/i.test(userAgent)) {
    return "No Android, abra o menu do Chrome e escolha Instalar app ou Adicionar a tela inicial.";
  }

  return "No navegador, use a opcao Instalar app ou Adicionar a tela inicial.";
}

export function PwaInstallButton({
  className,
  size = "lg",
  variant = "default",
  label = "Instalar EconoRota",
}: {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive";
  label?: string;
}) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const guidance = useMemo(() => getInstallGuidance(), []);

  useEffect(() => {
    setIsInstalled(isStandalonePwa());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      toast.success("EconoRota instalado neste aparelho.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isInstalled) {
      toast.success("O EconoRota ja esta instalado neste aparelho.");
      return;
    }

    if (!installPrompt) {
      toast.info(guidance);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      toast.success("Instalacao iniciada.");
    } else {
      toast.info("Instalacao cancelada. Voce pode instalar depois pelo navegador.");
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={handleInstall}
    >
      {installPrompt ? (
        <Download className="h-4 w-4" />
      ) : (
        <Smartphone className="h-4 w-4" />
      )}
      {isInstalled ? "App instalado" : label}
    </Button>
  );
}
