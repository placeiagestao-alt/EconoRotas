import { useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressInputSimple from "@/components/AddressInputSimple";
import RouteMetrics from "@/components/RouteMetrics";
import RouteShare from "@/components/RouteShare";
import RouteMap from "@/components/RouteMap";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Flag, Plus, Trash2, Upload, Zap, MapPin } from "lucide-react";
import {
  parseRouteWorkbook,
  type ImportedRoute,
  type ImportedStop,
} from "@/services/routeImportService";
import { searchAddress } from "@/services/maps/geocodingService";
import { cn } from "@/lib/utils";

type RouteStop = Pick<ImportedStop, "address" | "latitude" | "longitude"> & {
  packageNumber?: string;
  routingStop?: number;
  notes?: string;
  sourceRow?: number;
};
type RoutePoint = Pick<RouteStop, "address" | "latitude" | "longitude">;
type StopIssue = {
  index: number;
  sourceRow?: number;
  address: string;
  hasAddress: boolean;
  hasCoordinates: boolean;
};

const EMPTY_ROUTE_POINT: RoutePoint = { address: "", latitude: 0, longitude: 0 };

function parseStopNotes(notes?: string) {
  const raw = notes?.trim();
  if (!raw) return { packageNumber: "", notes: undefined as string | undefined };

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  let packageNumber = "";
  const remaining: string[] = [];

  for (const part of parts) {
    const match = part.match(/^Pacote:\s*(.+)$/i);
    if (match?.[1] && !packageNumber) {
      packageNumber = match[1].trim();
      continue;
    }
    remaining.push(part);
  }

  return {
    packageNumber,
    notes: remaining.length ? remaining.join(" | ") : undefined,
  };
}

function buildStopNotes(packageNumber?: string, notes?: string) {
  const parts = [
    packageNumber?.trim() ? `Pacote: ${packageNumber.trim()}` : "",
    notes?.trim() ?? "",
  ].filter(Boolean);

  return parts.length ? parts.join(" | ") : undefined;
}

export default function CreateRoute() {
  const [, navigate] = useLocation();
  const [isCalculating, setIsCalculating] = useState(false);
  const [createdRouteId, setCreatedRouteId] = useState<number | undefined>();
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"shortest_distance" | "shortest_time" | "balanced">("balanced");
  const [importSummary, setImportSummary] = useState<ImportedRoute | null>(null);
  const [respectImportedStopSequence, setRespectImportedStopSequence] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isResolvingCoordinates, setIsResolvingCoordinates] = useState(false);
  const [startPoint, setStartPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [endPoint, setEndPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [invalidStopIndexes, setInvalidStopIndexes] = useState<number[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([
    { address: "", latitude: 0, longitude: 0 },
    { address: "", latitude: 0, longitude: 0 },
  ]);

  const createAndOptimizeMutation = trpc.routes.createAndOptimize.useMutation();
  const isSavingRoute =
    createAndOptimizeMutation.isPending ||
    isResolvingCoordinates;
  const submitLabel = isResolvingCoordinates
    ? "Localizando endere\u00e7os..."
    : isSavingRoute
      ? "Criando e otimizando..."
      : "Criar e Otimizar Rota";

  const hasValidCoordinates = (stop: RoutePoint) =>
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude) &&
    !(stop.latitude === 0 && stop.longitude === 0) &&
    stop.latitude >= -90 &&
    stop.latitude <= 90 &&
    stop.longitude >= -180 &&
    stop.longitude <= 180;

  const getStopIssues = (routeStops: RouteStop[]): StopIssue[] =>
    routeStops
      .map((stop, index) => ({
        index,
        sourceRow: stop.sourceRow,
        address: stop.address,
        hasAddress: Boolean(stop.address.trim()),
        hasCoordinates: hasValidCoordinates(stop),
      }))
      .filter((item) => !item.hasAddress || !item.hasCoordinates);

  const formatStopIssue = (issue: StopIssue) =>
    `Parada ${issue.index + 1}${issue.sourceRow ? ` (linha ${issue.sourceRow})` : ""}`;

  const formatStopList = (issues: StopIssue[]) =>
    issues
      .slice(0, 5)
      .map(formatStopIssue)
      .join(", ") + (issues.length > 5 ? ` e mais ${issues.length - 5}` : "");

  const getAddressParts = (address: string) =>
    address
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const hasPostalCode = (value: string) => /\b\d{5}-?\d{3}\b/.test(value);

  const inferState = (city?: string) => {
    if (!city) return "";

    return city.toLowerCase().includes("presidente prudente") ? "SP" : "";
  };

  const buildCandidate = (parts: string[]) =>
    parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

  const getCleanedAddressCandidates = (address: string) => {
    const parts = getAddressParts(address);

    if (parts.length < 4) {
      return [];
    }

    const [street, number, ...rest] = parts;
    const postalCode = rest.find(hasPostalCode);
    const restWithoutPostalCode = rest.filter((part) => !hasPostalCode(part));
    const city = restWithoutPostalCode[restWithoutPostalCode.length - 1];
    const allDistrictParts = restWithoutPostalCode.slice(0, -1);
    const likelyDistrictParts =
      allDistrictParts.length >= 2 ? allDistrictParts.slice(1) : allDistrictParts;
    const state = inferState(city);
    const district = likelyDistrictParts.join(", ");
    const districtWithComplement = allDistrictParts.join(", ");
    const baseWithDistrict = buildCandidate([
      street,
      number,
      district,
      city,
      state,
      "Brasil",
    ]);
    const baseWithoutDistrict = buildCandidate([
      street,
      number,
      city,
      state,
      "Brasil",
    ]);
    const streetWithDistrict = buildCandidate([street, district, city, state, "Brasil"]);
    const streetWithCity = buildCandidate([street, city, state, "Brasil"]);
    const postalWithCity = postalCode
      ? buildCandidate([postalCode, city, state, "Brasil"])
      : "";

    return [
      baseWithDistrict,
      buildCandidate([street, number, districtWithComplement, city, state, "Brasil"]),
      baseWithoutDistrict,
      streetWithDistrict,
      streetWithCity,
      postalWithCity,
    ].filter(Boolean);
  };

  const getSearchCandidates = (address: string) => {
    const normalized = address.replace(/\s+/g, " ").trim();
    const candidates = [
      normalized,
      ...getCleanedAddressCandidates(normalized),
      normalized.includes("Brasil") ? "" : `${normalized}, Brasil`,
    ].filter(Boolean);

    return Array.from(new Set(candidates));
  };

  const searchFirstAddressMatch = async (address: string) => {
    for (const candidate of getSearchCandidates(address)) {
      const suggestions = await searchAddress(candidate, { limit: 1 });
      const suggestion = suggestions[0];

      if (suggestion) {
        return suggestion;
      }
    }

    return undefined;
  };

  const resolveMissingCoordinates = async (routeStops: RouteStop[]) => {
    const resolvedStops: RouteStop[] = [];
    let resolvedCount = 0;

    for (const stop of routeStops) {
      if (hasValidCoordinates(stop)) {
        resolvedStops.push(stop);
        continue;
      }

      const suggestion = await searchFirstAddressMatch(stop.address);

      if (suggestion) {
        resolvedStops.push({
          ...stop,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
        });
        resolvedCount += 1;
      } else {
        resolvedStops.push(stop);
      }
    }

    return { resolvedStops, resolvedCount };
  };

  const resolveOptionalPoint = async (point: RoutePoint) => {
    if (!point.address.trim() || hasValidCoordinates(point)) {
      return { point, resolved: false };
    }

    const suggestion = await searchFirstAddressMatch(point.address);

    if (!suggestion) {
      return { point, resolved: false };
    }

    return {
      point: {
        address: point.address,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      },
      resolved: true,
    };
  };

  const handleAddStop = () => {
    setInvalidStopIndexes([]);
    setRespectImportedStopSequence(false);
    setStops((currentStops) => [...currentStops, { address: "", latitude: 0, longitude: 0 }]);
  };

  const handleRemoveStop = (index: number) => {
    setInvalidStopIndexes([]);
    setRespectImportedStopSequence(false);
    setStops((currentStops) => currentStops.filter((_, i) => i !== index));
  };

  const handleAddressChange = (index: number, address: string) => {
    setInvalidStopIndexes((current) => current.filter((item) => item !== index));
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, address, latitude: 0, longitude: 0 } : stop
      )
    );
  };

  const handleCoordinatesChange = (index: number, latitude: number, longitude: number) => {
    setInvalidStopIndexes((current) => current.filter((item) => item !== index));
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, latitude, longitude } : stop
      )
    );
  };

  const handlePackageNumberChange = (index: number, packageNumber: string) => {
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, packageNumber } : stop
      )
    );
  };

  const getRoutePointPayload = (point: RoutePoint) =>
    point.address.trim() && hasValidCoordinates(point)
      ? {
          location: point.address.trim(),
          latitude: point.latitude,
          longitude: point.longitude,
        }
      : undefined;

  const handleRouteFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    setIsImportingFile(true);

    try {
      const importedRoute = await parseRouteWorkbook(file);

      setInvalidStopIndexes([]);
      setStops(
        importedRoute.stops.map((stop) => ({
          ...parseStopNotes(stop.notes),
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          packageNumber: stop.packageNumber,
          routingStop: stop.routingStop,
          notes: stop.notes,
          sourceRow: stop.sourceRow,
        }))
      );
      setImportSummary(importedRoute);
      setRespectImportedStopSequence(importedRoute.hasStopSequence);

      if (!name.trim()) {
        setName(importedRoute.routeName);
      }

      if (!description.trim()) {
        setDescription(
          `Importada de ${file.name} com ${importedRoute.stops.length} paradas.`
        );
      }

      toast.success(`${importedRoute.stops.length} paradas importadas.`);
      if (importedRoute.hasStopSequence) {
        toast.message(
          "Coluna STOP detectada: a sequencia inicial seguira a ordem da planilha."
        );
      }

      if (importedRoute.missingCoordinateRows > 0) {
        toast.warning(
          `${importedRoute.missingCoordinateRows} paradas foram importadas sem coordenadas.`
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Não foi possível importar a planilha.");
    } finally {
      setIsImportingFile(false);
      input.value = "";
    }
  };

  const handleFocusFirstInvalidStop = () => {
    const firstInvalidIndex = invalidStopIndexes[0];
    if (firstInvalidIndex === undefined) return;

    document
      .getElementById(`route-stop-${firstInvalidIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleRemoveInvalidStops = () => {
    const invalidIndexes = new Set(invalidStopIndexes);
    const nextStops = stops.filter((_, index) => !invalidIndexes.has(index));

    if (nextStops.length < 2) {
      toast.error("A rota precisa manter pelo menos 2 paradas.");
      return;
    }

    setStops(nextStops);
    setInvalidStopIndexes([]);
    toast.success(`${invalidIndexes.size} parada(s) com problema removida(s).`);
  };

  const invalidStopIssues = invalidStopIndexes
    .map((index) => {
      const stop = stops[index];

      if (!stop) return undefined;

      return {
        index,
        sourceRow: stop.sourceRow,
        address: stop.address,
        hasAddress: Boolean(stop.address.trim()),
        hasCoordinates: hasValidCoordinates(stop),
      };
    })
    .filter(Boolean) as StopIssue[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Nome da rota é obrigatório");
      return;
    }

    const filledStops = stops.filter((stop) => stop.address.trim());

    if (filledStops.length < 2) {
      toast.error("Adicione pelo menos 2 paradas");
      return;
    }

    let validStops = filledStops;
    let validStartPoint = startPoint;
    let validEndPoint = endPoint;

    const endpointMissingCoordinates = [validStartPoint, validEndPoint].filter(
      (point) => point.address.trim() && !hasValidCoordinates(point)
    );
    if (endpointMissingCoordinates.length > 0) {
      setIsResolvingCoordinates(true);
      toast.message(
        `Buscando coordenadas de ${endpointMissingCoordinates.length} ponto(s) de in\u00edcio/fim...`
      );

      try {
        const [resolvedStart, resolvedEnd] = await Promise.all([
          resolveOptionalPoint(validStartPoint),
          resolveOptionalPoint(validEndPoint),
        ]);

        validStartPoint = resolvedStart.point;
        validEndPoint = resolvedEnd.point;
        setStartPoint(validStartPoint);
        setEndPoint(validEndPoint);

        const resolvedCount =
          Number(resolvedStart.resolved) + Number(resolvedEnd.resolved);
        if (resolvedCount > 0) {
          toast.success(`${resolvedCount} ponto(s) de in\u00edcio/fim localizado(s).`);
        }
      } catch (error: any) {
        toast.error(error.message || "Não foi possível buscar início/fim.");
        setIsResolvingCoordinates(false);
        return;
      } finally {
        setIsResolvingCoordinates(false);
      }
    }

    if (validStartPoint.address.trim() && !hasValidCoordinates(validStartPoint)) {
      toast.error("Confira endereço e coordenadas do início da rota.");
      return;
    }

    if (validEndPoint.address.trim() && !hasValidCoordinates(validEndPoint)) {
      toast.error("Confira endereço e coordenadas do fim da rota.");
      return;
    }

    const stopsMissingCoordinates = validStops.filter(
      (stop) => !hasValidCoordinates(stop)
    );

    if (stopsMissingCoordinates.length > 0) {
      setIsResolvingCoordinates(true);
      toast.message(
        `Buscando coordenadas de ${stopsMissingCoordinates.length} parada(s)...`
      );

      try {
        const result = await resolveMissingCoordinates(validStops);
        validStops = result.resolvedStops;
        setStops(result.resolvedStops);

        if (result.resolvedCount > 0) {
          toast.success(`${result.resolvedCount} parada(s) localizada(s).`);
        }
      } catch (error: any) {
        toast.error(error.message || "Não foi possível buscar as coordenadas.");
        setIsResolvingCoordinates(false);
        return;
      } finally {
        setIsResolvingCoordinates(false);
      }
    }

    const unresolvedStopIssues = getStopIssues(validStops);
    if (unresolvedStopIssues.length > 0) {
      setInvalidStopIndexes(unresolvedStopIssues.map((item) => item.index));
      toast.error(
        `Confira endereço e coordenadas: ${formatStopList(unresolvedStopIssues)}.`
      );
      return;
    }

    try {
      const startPayload = getRoutePointPayload(validStartPoint);
      const endPayload = getRoutePointPayload(validEndPoint);

      setInvalidStopIndexes([]);
      const stopsWithSequence = validStops.map((stop, index) => ({
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        notes: buildStopNotes(stop.packageNumber, stop.notes),
        sequence: index,
      }));
      const result = await createAndOptimizeMutation.mutateAsync({
        name,
        description,
        mode,
        startLocation: startPayload?.location,
        startLatitude: startPayload?.latitude,
        startLongitude: startPayload?.longitude,
        endLocation: endPayload?.location,
        endLatitude: endPayload?.latitude,
        endLongitude: endPayload?.longitude,
        stops: stopsWithSequence,
        respectInputSequence: respectImportedStopSequence,
      });

      const { route, optimization } = result;

      setCreatedRouteId(route.id);
      setTotalDistance(optimization.totalDistance);
      setTotalDuration(optimization.totalTime);
      
      toast.success("Rota criada e otimizada com sucesso!");
      navigate(`/routes/${route.id}`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar rota");
    }
  };

  // Use state totalDistance instead of recalculating

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Criar Nova Rota</h1>
            <p className="mt-2 text-muted-foreground">Configure sua rota com endereços reais e deixe a IA otimizar</p>
          </div>
          <Button
            type="submit"
            form="create-route-form"
            disabled={isSavingRoute}
            className="gap-2 md:mt-1"
          >
            <Zap className="w-4 h-4" />
            {submitLabel}
          </Button>
        </div>

        <form id="create-route-form" onSubmit={handleSubmit} className="space-y-6 pb-24">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Rota *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Entrega Centro-Sul"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva a rota..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="mode">Modo de Otimização *</Label>
                <Select value={mode} onValueChange={(value: any) => setMode(value)}>
                  <SelectTrigger id="mode" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shortest_distance">Menor Distância</SelectItem>
                    <SelectItem value="shortest_time">Menor Tempo</SelectItem>
                    <SelectItem value="balanced">Balanceado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Início e Fim da Rota
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <AddressInputSimple
                  id="route-start-address"
                  label="Início da rota"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={startPoint.address}
                  latitude={startPoint.latitude}
                  longitude={startPoint.longitude}
                  onAddressChange={(address) =>
                    setStartPoint((current) => ({ ...current, address }))
                  }
                  onCoordinatesChange={(latitude, longitude) =>
                    setStartPoint((current) => ({ ...current, latitude, longitude }))
                  }
                />
              </div>

              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <AddressInputSimple
                  id="route-end-address"
                  label="Fim da rota"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={endPoint.address}
                  latitude={endPoint.latitude}
                  longitude={endPoint.longitude}
                  onAddressChange={(address) =>
                    setEndPoint((current) => ({ ...current, address }))
                  }
                  onCoordinatesChange={(latitude, longitude) =>
                    setEndPoint((current) => ({ ...current, latitude, longitude }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Stops */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Paradas da Rota
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddStop}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Parada
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed bg-muted/30 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-3">
                    <FileSpreadsheet className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Importar tabela de rotas</p>
                      <p className="text-sm text-muted-foreground">
                        Aceita .xlsx, .xls ou .csv com colunas como Destination Address,
                        Bairro, City, Zipcode/Postal code, Latitude e Longitude.
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 md:w-72">
                    <Label htmlFor="route-file-import" className="sr-only">
                      Importar planilha de rotas
                    </Label>
                    <Input
                      id="route-file-import"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={isImportingFile}
                      onChange={handleRouteFileImport}
                    />
                  </div>
                </div>

                {importSummary && (
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Upload className="h-4 w-4" />
                      {importSummary.stops.length} paradas importadas
                    </span>
                    {importSummary.skippedRows > 0 && (
                      <span>{importSummary.skippedRows} linhas ignoradas</span>
                    )}
                    {importSummary.missingCoordinateRows > 0 && (
                      <span>
                        {importSummary.missingCoordinateRows} sem coordenadas
                      </span>
                    )}
                  </div>
                )}
              </div>

              {invalidStopIssues.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription className="space-y-3">
                    <div>
                      <p className="font-medium">
                        {invalidStopIssues.length} parada(s) sem coordenadas válidas.
                      </p>
                      <p className="mt-1">
                        Corrija o endereço, digite as coordenadas manualmente ou remova as
                        paradas com problema.
                      </p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {invalidStopIssues.slice(0, 6).map((issue) => (
                        <p key={issue.index}>
                          {formatStopIssue(issue)}: {issue.address || "sem endereço"}
                        </p>
                      ))}
                      {invalidStopIssues.length > 6 && (
                        <p>Mais {invalidStopIssues.length - 6} parada(s) com problema.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleFocusFirstInvalidStop}
                      >
                        Ir para primeira
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleRemoveInvalidStops}
                      >
                        Remover paradas com problema
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {stops.map((stop, index) => (
                <div
                  key={index}
                  id={`route-stop-${index}`}
                  className={cn(
                    "space-y-3 rounded-2xl border border-border/70 bg-white p-4",
                    invalidStopIndexes.includes(index) &&
                      "border-destructive bg-destructive/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-medium">Parada {index + 1}</span>
                      {stop.sourceRow && (
                        <p className="text-xs text-muted-foreground">
                          Linha {stop.sourceRow} da planilha
                        </p>
                      )}
                    </div>
                    {stops.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStop(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <AddressInputSimple
                    id={`address-${index}`}
                    label="Endereço completo"
                    placeholder="Rua, número, bairro, cidade - UF"
                    value={stop.address}
                    latitude={stop.latitude}
                    longitude={stop.longitude}
                    onAddressChange={(address) => handleAddressChange(index, address)}
                    onCoordinatesChange={(lat, lng) => handleCoordinatesChange(index, lat, lng)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`package-number-${index}`}>Número do pacote</Label>
                    <Input
                      id={`package-number-${index}`}
                      value={stop.packageNumber ?? ""}
                      onChange={(event) =>
                        handlePackageNumberChange(index, event.target.value)
                      }
                      placeholder="Ex: 1, 2, 3 (pode repetir)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Identificador editável: pode repetir em paradas diferentes.
                    </p>
                  </div>
                  {stop.notes && (
                    <p className="text-sm text-muted-foreground">{stop.notes}</p>
                  )}
                  {invalidStopIndexes.includes(index) && (
                    <p className="rounded-md border border-destructive/30 bg-background p-2 text-sm text-destructive">
                      Essa parada não tem coordenadas válidas. Se o endereço estiver
                      correto, use "Digitar coordenadas manualmente".
                    </p>
                  )}
                </div>
              ))}

            </CardContent>
          </Card>

          {/* Route Metrics */}
          <RouteMetrics
            stops={stops}
            mode={mode}
            startPoint={startPoint}
            endPoint={endPoint}
          />

          {/* Route Map Visualization */}
          {stops.length >= 2 && (
            <RouteMap
              stops={stops}
              routeName={name || "Rota"}
              height="h-96"
              startPoint={startPoint}
              endPoint={endPoint}
            />
          )}

          {/* Route Share - Show after creation */}
          {createdRouteId && (
            <RouteShare
              routeId={createdRouteId}
              routeName={name}
              description={description}
              stops={stops}
              totalDistance={totalDistance}
              totalDuration={totalDuration}
              mode={mode}
            />
          )}

          {/* Actions */}
          <div className="z-20 flex flex-col gap-3 border border-border/70 bg-white/95 p-4 shadow-[0_-6px_16px_rgb(15_23_42_/_8%)] sm:flex-row md:sticky md:bottom-0 md:rounded-2xl">
            <Button
              type="submit"
              disabled={isSavingRoute}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              {submitLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/routes")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}


