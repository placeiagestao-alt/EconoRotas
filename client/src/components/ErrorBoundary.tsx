import { openWhatsAppReport, reportUnknownError } from "@/lib/errorReporter";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportUnknownError("Falha ao renderizar tela", error, "react.error-boundary", {
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Não foi possível carregar esta tela.</h2>

            <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
              Atualize a página. Se estiver usando como app no iPhone, confirme a
              conexão com a internet e abra novamente pelo ícone EconoRota.
            </p>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Atualizar página
            </button>

            <button
              onClick={() =>
                this.state.error &&
                openWhatsAppReport({
                  title: "Falha ao renderizar tela",
                  message: this.state.error.message,
                  stack: this.state.error.stack,
                  source: "react.error-boundary",
                  severity: "fatal",
                })
              }
              className={cn(
                "mt-3 flex items-center gap-2 px-4 py-2 rounded-lg border",
                "border-border bg-white text-foreground",
                "hover:bg-secondary cursor-pointer"
              )}
            >
              Enviar erro pelo WhatsApp
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
