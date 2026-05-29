import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -left-20 top-14 h-64 w-64 rounded-full bg-emerald-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-sky-300/30 blur-3xl" />

      <Card className="mx-4 w-full max-w-lg border-border/80 bg-white">
        <CardContent className="pb-8 pt-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-destructive/20 blur-md" />
              <AlertCircle className="relative h-16 w-16 text-destructive" />
            </div>
          </div>

          <h1 className="mb-2 text-5xl font-bold tracking-tight text-foreground">404</h1>
          <h2 className="mb-4 text-xl font-semibold text-foreground/90">Página não encontrada</h2>

          <p className="mb-8 leading-relaxed text-muted-foreground">
            A página que você tentou abrir não existe ou foi movida.
          </p>

          <div id="not-found-button-group" className="flex justify-center">
            <Button onClick={handleGoHome}>
              <Home className="mr-2 h-4 w-4" />
              Voltar ao início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
