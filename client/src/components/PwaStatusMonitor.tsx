import { useEffect } from "react";
import { toast } from "sonner";

export default function PwaStatusMonitor() {
  useEffect(() => {
    const handleOnline = () => {
      toast.success("Conexão restaurada.");
    };

    const handleOffline = () => {
      toast.warning(
        "Sem conexão. As telas já abertas podem continuar visíveis, mas login, mapas e rotas precisam de internet."
      );
    };

    const handlePwaUpdate = () => {
      toast.info("Nova versão do EconoRotas disponível.", {
        action: {
          label: "Atualizar",
          onClick: () => window.location.reload(),
        },
        duration: 12000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("econorotas:pwa-update", handlePwaUpdate);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("econorotas:pwa-update", handlePwaUpdate);
    };
  }, []);

  return null;
}
