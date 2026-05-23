import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AddressSuggestion,
  searchAddress,
} from "@/services/maps/geocodingService";

interface AddressInputSimpleProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  latitude: number;
  longitude: number;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (lat: number, lng: number) => void;
}

const MIN_QUERY_LENGTH = 6;

export default function AddressInputSimple({
  id,
  label,
  placeholder,
  value,
  latitude,
  longitude,
  onAddressChange,
  onCoordinatesChange,
}: AddressInputSimpleProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState(latitude ? latitude.toString() : "");
  const [manualLng, setManualLng] = useState(longitude ? longitude.toString() : "");
  const [showManual, setShowManual] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const hasCoordinates = useMemo(
    () => latitude !== 0 && longitude !== 0,
    [latitude, longitude]
  );

  useEffect(() => {
    setManualLat(latitude ? latitude.toString() : "");
    setManualLng(longitude ? longitude.toString() : "");
  }, [latitude, longitude]);

  useEffect(() => {
    const query = value.trim();

    if (query.length < MIN_QUERY_LENGTH || hasCoordinates) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void runAddressSearch(query, controller.signal, false);
    }, 900);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [value, hasCoordinates]);

  const runAddressSearch = async (
    query = value,
    signal?: AbortSignal,
    showEmptyMessage = true
  ) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setHasSearched(false);
      setError(`Digite pelo menos ${MIN_QUERY_LENGTH} caracteres do endereco.`);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await searchAddress(normalizedQuery, { signal });
      setSuggestions(results);
      setHasSearched(true);

      if (results.length === 0 && showEmptyMessage) {
        setError("Nenhum endereco encontrado. Confira rua, numero, cidade e UF.");
      }
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === "AbortError") {
        return;
      }

      setSuggestions([]);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Nao foi possivel buscar o endereco agora."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;

    onAddressChange(nextValue);
    onCoordinatesChange(0, 0);
    setError(null);
    setHasSearched(false);
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    onAddressChange(suggestion.label);
    onCoordinatesChange(suggestion.latitude, suggestion.longitude);
    setSuggestions([]);
    setError(null);
    setHasSearched(true);
    toast.success("Endereco localizado no mapa.");
  };

  const handleManualCoordinates = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Coordenadas invalidas.");
      return;
    }

    if (lat < -90 || lat > 90) {
      setError("Latitude deve estar entre -90 e 90.");
      return;
    }

    if (lng < -180 || lng > 180) {
      setError("Longitude deve estar entre -180 e 180.");
      return;
    }

    onCoordinatesChange(lat, lng);
    setError(null);
    setShowManual(false);
    setSuggestions([]);
    toast.success("Coordenadas confirmadas.");
  };

  const handleSearchClick = () => {
    void runAddressSearch(value, undefined, true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runAddressSearch(value, undefined, true);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{label}</Label>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            id={id}
            placeholder={placeholder}
            value={value}
            onChange={handleAddressChange}
            onKeyDown={handleInputKeyDown}
            autoComplete="street-address"
            className="bg-white"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSearchClick}
            disabled={isLoading || value.trim().length < MIN_QUERY_LENGTH}
            aria-label="Buscar endereco"
            title="Buscar endereco"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="overflow-hidden rounded-md border bg-white shadow-sm">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted focus:bg-muted focus:outline-none"
              >
                <span className="block font-medium text-foreground">
                  {suggestion.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {suggestion.shortLabel}
                </span>
              </button>
            ))}
          </div>
        )}

        {hasSearched && suggestions.length === 0 && !hasCoordinates && !error && (
          <p className="text-xs text-muted-foreground">
            Nenhum resultado encontrado para esse endereco.
          </p>
        )}

        {!showManual && hasCoordinates && (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <MapPin className="h-4 w-4" />
              <span>
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManual(true)}
              className="text-xs"
            >
              Editar
            </Button>
          </div>
        )}

        {showManual && (
          <div className="space-y-2 rounded-lg border bg-blue-50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${id}-lat`} className="text-xs">
                  Latitude
                </Label>
                <Input
                  id={`${id}-lat`}
                  type="number"
                  step="0.000001"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="-23.55052"
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-lng`} className="text-xs">
                  Longitude
                </Label>
                <Input
                  id={`${id}-lng`}
                  type="number"
                  step="0.000001"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="-46.63331"
                  className="text-sm"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleManualCoordinates}
              disabled={isLoading}
              className="w-full"
            >
              Confirmar coordenadas
            </Button>
          </div>
        )}

        {!showManual && !hasCoordinates && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowManual(true)}
            className="w-full"
          >
            Digitar coordenadas manualmente
          </Button>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Informe rua, numero, bairro, cidade e UF. Ex: Rua 15 de Novembro, 100,
        Centro, Presidente Prudente - SP.
      </p>
    </div>
  );
}
