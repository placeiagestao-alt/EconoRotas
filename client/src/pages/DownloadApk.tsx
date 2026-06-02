import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/apiBase";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type AndroidUpdateInfo = {
  enabled?: boolean;
  latestVersion?: string;
  apkUrl?: string;
  required?: boolean;
  minimumSupportedVersion?: string;
  message?: string;
  publishedAt?: string;
};

const FALLBACK_APK_PATH = "/downloads/econorotas-v1.0.0.apk?v=20260531-2";
const FALLBACK_VERSION = "1.0.0";

function formatDate(value?: string) {
  if (!value) return "Atualizado recentemente";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Atualizado recentemente";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  return new URL(pathOrUrl, window.location.origin).toString();
}

export default function DownloadApk() {
  const [updateInfo, setUpdateInfo] = useState<AndroidUpdateInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    fetch(buildApiUrl("/api/app-update/android"), {
      headers: { Accept: "application/json" },
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<AndroidUpdateInfo>;
      })
      .then((data) => {
        if (!ignore) setUpdateInfo(data);
      })
      .catch(() => {
        if (!ignore) setUpdateInfo(null);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const apkUrl =
    updateInfo?.enabled && updateInfo.apkUrl
      ? updateInfo.apkUrl
      : FALLBACK_APK_PATH;
  const absoluteApkUrl = useMemo(() => getAbsoluteUrl(apkUrl), [apkUrl]);
  const version = updateInfo?.latestVersion || FALLBACK_VERSION;
  const publishedAt = formatDate(updateInfo?.publishedAt);

  const copyDownloadLink = async () => {
    try {
      await navigator.clipboard.writeText(absoluteApkUrl);
      toast.success("Link do aplicativo copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center">
            <BrandLogo variant="full" className="h-14 w-48 justify-start" />
          </Link>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <ExternalLink className="h-4 w-4" />
              Abrir sistema
            </Link>
          </Button>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-14">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Aplicativo oficial
              </Badge>
              <Badge variant="outline">Versão {version}</Badge>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Baixar aplicativo EconoRotas
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                Instale o app Android conectado ao ambiente oficial do Vercel para
                acessar rotas, entregas e otimização pelo celular.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <a href={apkUrl} download>
                  <Download className="h-5 w-5" />
                  Baixar aplicativo
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={copyDownloadLink}
              >
                <Copy className="h-5 w-5" />
                Copiar link
              </Button>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Publicado no Vercel
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                API HTTPS oficial
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Atualização {publishedAt}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-[0_14px_32px_rgb(15_23_42_/_8%)]">
            <div className="rounded-xl bg-white p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Aplicativo Android</p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                    EconoRotas v{version}
                  </h2>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Smartphone className="h-6 w-6" />
                </span>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Arquivo</dt>
                  <dd className="font-medium text-slate-900">
                    Aplicativo EconoRotas v{version}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Servidor</dt>
                  <dd className="font-medium text-slate-900">econo-rotas.vercel.app</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-medium text-emerald-700">
                    {isLoading ? "Verificando..." : "Disponível"}
                  </dd>
                </div>
              </dl>

              {updateInfo?.message && (
                <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {updateInfo.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-3">
          {[
            "Abra esta página pelo Android.",
            "Toque em Baixar aplicativo e confirme o download.",
            "Ao instalar, permita apps deste navegador se o Android solicitar.",
          ].map((step, index) => (
            <div
              key={step}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <p className="text-sm leading-6 text-slate-700">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-6xl gap-3 px-4 py-4 text-sm text-amber-900 sm:px-6">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <p>
            Use apenas este link oficial. Se o Android avisar sobre instalação
            manual, confirme somente se o endereço exibido for econo-rotas.vercel.app.
          </p>
        </div>
      </section>
    </main>
  );
}
