import { describe, expect, it } from "vitest";
import { parseImileScreenText, parseRouteRows } from "./routeImportService";

describe("parseRouteRows", () => {
  it("uses only STOP as spreadsheet sequence and inserts empty STOP where it adds the least detour", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua B, 20, Centro, Presidente Prudente",
          STOP: 2,
          Sequence: 99,
          Latitude: 1,
          Longitude: 10,
        },
        {
          "Destination Address": "Rua Sem Stop, 30, Centro, Presidente Prudente",
          STOP: "",
          Sequence: 1,
          Latitude: 1,
          Longitude: 9.9,
        },
        {
          "Destination Address": "Rua A, 10, Centro, Presidente Prudente",
          STOP: 1,
          Sequence: 88,
          Latitude: 1,
          Longitude: 0,
        },
      ],
      "rota-stop.xlsx",
      "shopee"
    );

    expect(route.hasStopSequence).toBe(true);
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([1, 0, 2]);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([1, 0, 2]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, true, false]);
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([undefined, undefined, undefined]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua A, 10, Centro, Presidente Prudente",
      "Rua Sem Stop, 30, Centro, Presidente Prudente",
      "Rua B, 20, Centro, Presidente Prudente",
    ]);
  });

  it("does not send the route away and back when an empty STOP belongs between two nearby stops", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua A",
          STOP: 1,
          Latitude: 1,
          Longitude: 0,
        },
        {
          "Destination Address": "Joao Goets primeira",
          STOP: 2,
          Latitude: 1,
          Longitude: 30,
        },
        {
          "Destination Address": "Rua B sem STOP perto da Rua A",
          STOP: "",
          Latitude: 1,
          Longitude: 0.2,
        },
        {
          "Destination Address": "Joao Goets segunda",
          STOP: 3,
          Latitude: 1,
          Longitude: 30.1,
        },
      ],
      "rota-stop-zero.xlsx",
      "shopee"
    );

    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua A",
      "Rua B sem STOP perto da Rua A",
      "Joao Goets primeira",
      "Joao Goets segunda",
    ]);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([1, 0, 2, 3]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, true, false, false]);
  });

  it("keeps a zero STOP beside an existing same-address Shopee group", () => {
    const sameAddress = "Rua Lefe Buchalla, 142, Parque Alto Bela Vista, Presidente Prudente, SP";
    const route = parseRouteRows(
      [
        ...Array.from({ length: 6 }, (_, index) => ({
          "Destination Address": sameAddress,
          STOP: 20 + index,
          Latitude: -22.094881,
          Longitude: -51.407986,
        })),
        {
          "Destination Address": "Rua Distante, 10, Presidente Prudente, SP",
          STOP: 30,
          Latitude: -22.12,
          Longitude: -51.45,
        },
        {
          "Destination Address": sameAddress,
          STOP: 0,
          Latitude: -22.094961,
          Longitude: -51.408037,
        },
      ],
      "rota-shopee-zero-mesmo-endereco.xlsx",
      "shopee"
    );

    expect(route.stops.map((stop) => stop.address)).toEqual([
      sameAddress,
      sameAddress,
      sameAddress,
      sameAddress,
      sameAddress,
      sameAddress,
      sameAddress,
      "Rua Distante, 10, Presidente Prudente, SP",
    ]);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([
      20,
      21,
      22,
      23,
      24,
      25,
      0,
      30,
    ]);
    expect(route.stops[6].isUnsequencedStop).toBe(true);
  });

  it("treats dash STOP as unsequenced Shopee stop", () => {
    const route = parseRouteRows(
      [
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          STOP: 1,
          "SPX TN": "BR260000000001A",
          Latitude: -22.1,
          Longitude: -51.4,
        },
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          STOP: "-",
          "SPX TN": "BR260000000002A",
          Latitude: -22.1001,
          Longitude: -51.4001,
        },
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua C, 30, Presidente Prudente, SP",
          STOP: 2,
          "SPX TN": "BR260000000003A",
          Latitude: -22.2,
          Longitude: -51.5,
        },
      ],
      "rota-shopee-traco.xlsx",
      "shopee"
    );

    expect(route.hasStopSequence).toBe(true);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([1, 0, 2]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, true, false]);
  });

  it("auto-detects Shopee STOP when source was left generic but the file has AT route and BR tracking", () => {
    const route = parseRouteRows(
      [
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          STOP: 2,
          "SPX TN": "BR260000000002A",
          Latitude: -22.2,
          Longitude: -51.5,
        },
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          STOP: 1,
          "SPX TN": "BR260000000001A",
          Latitude: -22.1,
          Longitude: -51.4,
        },
      ],
      "rota-auto-shopee.xlsx",
      "generic"
    );

    expect(route.sourceProvider).toBe("shopee");
    expect(route.hasStopSequence).toBe(true);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([1, 2]);
    expect(route.stops.map((stop) => stop.sourceProvider)).toEqual(["shopee", "shopee"]);
  });

  it("auto-detects Shopee STOP when source was left manual but the file has AT route and BR tracking", () => {
    const route = parseRouteRows(
      [
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          STOP: 2,
          "SPX TN": "BR260000000002A",
          Latitude: -22.2,
          Longitude: -51.5,
        },
        {
          "Route ID": "AT202606125YWJY",
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          STOP: "-",
          "SPX TN": "BR260000000001A",
          Latitude: -22.1,
          Longitude: -51.4,
        },
      ],
      "rota-auto-shopee-manual.xlsx",
      "manual"
    );

    expect(route.sourceProvider).toBe("shopee");
    expect(route.hasStopSequence).toBe(true);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([0, 2]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([true, false]);
  });

  it("ignores sequence aliases when STOP column does not exist", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua B, 20, Centro, Presidente Prudente",
          Sequence: 2,
          Latitude: -22.13,
          Longitude: -51.39,
        },
        {
          "Destination Address": "Rua A, 10, Centro, Presidente Prudente",
          Sequence: 1,
          Latitude: -22.11,
          Longitude: -51.37,
        },
      ],
      "rota-sem-stop.xlsx"
    );

    expect(route.hasStopSequence).toBe(false);
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([undefined, undefined]);
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([undefined, undefined]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua B, 20, Centro, Presidente Prudente",
      "Rua A, 10, Centro, Presidente Prudente",
    ]);
  });

  it("builds addresses from delivery-specific headers and separate number columns", () => {
    const route = parseRouteRows(
      [
        {
          Parada: "Cliente 1",
          STOP: 1,
          "Endereço de entrega": "Rua Floriano Peixoto",
          Numero: 1520,
          Bairro: "Centro",
          Cidade: "Presidente Prudente",
          UF: "SP",
        },
        {
          Parada: "Cliente 2",
          STOP: 2,
          "Endereço de entrega": "Avenida Brasil",
          Numero: 300,
          Bairro: "Vila Nova",
          Cidade: "Presidente Prudente",
          UF: "SP",
        },
      ],
      "rota-endereco-entrega.xlsx"
    );

    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua Floriano Peixoto, 1520, Centro, Presidente Prudente, SP",
      "Avenida Brasil, 300, Vila Nova, Presidente Prudente, SP",
    ]);
  });

  it("builds addresses from the real semicolon CSV export format", () => {
    const route = parseRouteRows(
      [
        {
          Logradouro: "Rua Olivio Crepaldi",
          Numero: 345,
          Bairro: "Jardim Eldorado",
          Cidade: "Presidente Prudente",
          Estado: "SÃ£o Paulo",
          Complemento: "torre 2 ap 206 [cite: 1]",
        },
        {
          Logradouro: "Rua Vicente Caetano AraÃºjo",
          Numero: 65,
          Bairro: "Jardim Eldorado",
          Cidade: "Presidente Prudente",
          Estado: "SÃ£o Paulo",
          Complemento: " [cite: 10]",
        },
      ],
      "enderecos.csv"
    );

    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua Olivio Crepaldi, 345, Jardim Eldorado, Presidente Prudente, São Paulo, torre 2 ap 206",
      "Rua Vicente Caetano Araújo, 65, Jardim Eldorado, Presidente Prudente, São Paulo",
    ]);
    expect(route.missingCoordinateRows).toBe(2);
  });

  it("recovers the address from an unrecognized column without using customer name as address", () => {
    const route = parseRouteRows(
      [
        {
          Nome: "Maria Cliente",
          STOP: 1,
          Local: "Rua Sete de Setembro, 455, Centro, Presidente Prudente, SP",
        },
        {
          Nome: "Joao Cliente",
          STOP: 2,
          Local: "Av Manoel Goulart, 900, Vila Santa Helena, Presidente Prudente, SP",
        },
      ],
      "rota-coluna-local.xlsx"
    );

    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua Sete de Setembro, 455, Centro, Presidente Prudente, SP",
      "Av Manoel Goulart, 900, Vila Santa Helena, Presidente Prudente, SP",
    ]);
  });

  it("does not activate Shopee STOP rules for a generic CSV even when a stop column exists", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua B, 20, Centro, Presidente Prudente",
          STOP: 2,
          Latitude: -22.13,
          Longitude: -51.39,
        },
        {
          "Destination Address": "Rua A, 10, Centro, Presidente Prudente",
          STOP: 1,
          Latitude: -22.11,
          Longitude: -51.37,
        },
      ],
      "generic-stop.csv",
      "generic"
    );

    expect(route.sourceProvider).toBe("generic");
    expect(route.hasStopSequence).toBe(false);
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([undefined, undefined]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua B, 20, Centro, Presidente Prudente",
      "Rua A, 10, Centro, Presidente Prudente",
    ]);
  });
});

describe("parseImileScreenText", () => {
  it("extracts deliveries from an iMile uiautomator XML dump", () => {
    const route = parseImileScreenText(
      `
      <node content-desc="6052826300704" />
      <node content-desc="murillo Henrique vieira da silva" />
      <node content-desc="345,Rua Olivio Crepaldi torre 2 ap 206,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="LM" />
      <node content-desc="9.494km" />
      <node content-desc="6052126314870" />
      <node content-desc="Gabriel Aparecido Batista" />
      <node content-desc="170,Av salin farah maluf Muffato Max - Balcão Televendas,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      `,
      "imile.xml"
    );

    expect(route.routeName).toBe("imile");
    expect(route.hasStopSequence).toBe(false);
    expect(route.missingCoordinateRows).toBe(2);
    expect(route.sourceProvider).toBe("imile");
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "6052826300704",
      "6052126314870",
    ]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua Olivio Crepaldi torre 2 ap 206, 345, Jardim Eldorado, Presidente Prudente, São Paulo",
      "Av salin farah maluf Muffato Max - Balcão Televendas, 170, Jardim Eldorado, Presidente Prudente, São Paulo",
    ]);
    expect(route.stops[0].notes).toBeUndefined();
    expect(route.stops[0].metadata?.recipientName).toBe("murillo Henrique vieira da silva");
    expect(route.stops[0].metadata?.trackingNumber).toBe("6052826300704");
    expect(route.stops[0].metadata?.externalStatus).toBe("E2E: Restante 24 Hora Tempo esgotado");
  });

  it("preserves grouped delivery counts from iMile recipient labels", () => {
    const route = parseImileScreenText(
      `
      <node content-desc="6052826300704" />
      <node content-desc="Cliente Agrupado (3)" />
      <node content-desc="100,Rua Teste,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052126314870" />
      <node content-desc="Cliente Simples" />
      <node content-desc="200,Rua Exemplo,Vila Nova,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      `,
      "imile-agrupado.xml"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.totalDeliveries).toBe(4);
    expect(route.groupedDeliveries).toBe(2);
    expect(route.stops[0].deliveryCount).toBe(3);
    expect(route.stops[0].metadata?.groupedDeliveryCount).toBe(3);
  });

  it("deduplicates repeated iMile pages without losing tracking data", () => {
    const route = parseImileScreenText(
      `
      <node content-desc="6052826300704" />
      <node content-desc="Cliente Repetido" />
      <node content-desc="100,Rua Repetida,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052826300704" />
      <node content-desc="Cliente Repetido" />
      <node content-desc="100,Rua Repetida,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052126314870" />
      <node content-desc="Cliente Novo" />
      <node content-desc="200,Rua Nova,Vila Nova,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      `,
      "imile-repetido.xml"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "6052826300704",
      "6052126314870",
    ]);
    expect(route.stops[0].metadata?.trackingNumber).toBe("6052826300704");
  });

  it("recovers tracking when the address appears before the next card tracking", () => {
    const route = parseImileScreenText(
      `
      <node content-desc="100,Rua Primeiro,Jardim Eldorado,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="8.200km" />
      <node content-desc="6052826300704" />
      <node content-desc="Cliente Primeiro" />
      <node content-desc="200,Rua Segundo,Vila Nova,Presidente Prudente,São Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052126314870" />
      <node content-desc="Cliente Segundo" />
      `,
      "imile-invertido.xml"
    );

    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "6052826300704",
      "6052126314870",
    ]);
    expect(route.stops[0].metadata?.trackingNumber).toBe("6052826300704");
  });
});
