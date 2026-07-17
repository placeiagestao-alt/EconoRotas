import { describe, expect, it } from "vitest";
import { parseImileScreenText, parseRouteRows } from "./routeImportService";

describe("parseRouteRows", () => {
  it("reads Shopee STOP metadata without sorting the imported spreadsheet rows", () => {
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
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([2, 0, 1]);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([2, 0, 1]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, true, false]);
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([undefined, undefined, undefined]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua B, 20, Centro, Presidente Prudente",
      "Rua Sem Stop, 30, Centro, Presidente Prudente",
      "Rua A, 10, Centro, Presidente Prudente",
    ]);
  });

  it("keeps STOP zero marked as unsequenced without moving it during import", () => {
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
      "Joao Goets primeira",
      "Rua B sem STOP perto da Rua A",
      "Joao Goets segunda",
    ]);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([1, 2, 0, 3]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, false, true, false]);
  });

  it("groups repeated Shopee addresses and keeps the first positive STOP as the stop anchor", () => {
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
      "Rua Distante, 10, Presidente Prudente, SP",
    ]);
    expect(route.totalDeliveries).toBe(8);
    expect(route.groupedDeliveries).toBe(6);
    expect(route.stops[0].deliveryCount).toBe(7);
    expect(route.stops[0].metadata?.groupedDeliveryCount).toBe(7);
    expect(route.stops[0].originalStop).toBe(20);
    expect(route.stops[0].routingStop).toBe(20);
    expect(route.stops[0].isUnsequencedStop).toBe(false);
    expect(route.stops[0].notes).toContain("7x entregas neste endereco");
    expect(route.stops[0].notes).toContain("STOPs: 20, 21, 22, 23, 24, 25, sem STOP");
    expect(route.stops[1].originalStop).toBe(30);
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
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([2, 1]);
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
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([2, 0]);
    expect(route.stops.map((stop) => stop.isUnsequencedStop)).toEqual([false, true]);
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

  it("activates STOP rules for an explicit STOP column even when the source was left generic", () => {
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

    expect(route.sourceProvider).toBe("shopee");
    expect(route.hasStopSequence).toBe(true);
    expect(route.stopColumnDetected).toBe(true);
    expect(route.stopColumnIgnored).toBe(false);
    expect(route.stopSummary).toEqual({ numberedCount: 2, unsequencedCount: 0 });
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([2, 1]);
    expect(route.stops.map((stop) => stop.address)).toEqual([
      "Rua B, 20, Centro, Presidente Prudente",
      "Rua A, 10, Centro, Presidente Prudente",
    ]);
  });

  it("recognizes common Shopee STOP and package number headers", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          "Numero do STOP": 2,
          "SPX TN": "",
          "Numero do pacote": "BR-PACOTE-002",
        },
        {
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          "Numero do STOP": 1,
          "SPX TN": "",
          "Numero do pacote": "BR-PACOTE-001",
        },
      ],
      "shopee-cabecalhos.xlsx",
      "generic"
    );

    expect(route.sourceProvider).toBe("shopee");
    expect(route.stopSummary).toEqual({
      numberedCount: 2,
      unsequencedCount: 0,
    });
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([2, 1]);
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "BR-PACOTE-002",
      "BR-PACOTE-001",
    ]);
  });

  it("uses the populated STOP column when another recognized STOP column is blank", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          STOP: "",
          "STOP No.": 2,
          "SPX TN": "BR-PACOTE-002",
        },
        {
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          STOP: "",
          "STOP No.": 1,
          "SPX TN": "BR-PACOTE-001",
        },
      ],
      "shopee-duas-colunas-stop.xlsx",
      "generic"
    );

    expect(route.hasStopSequence).toBe(true);
    expect(route.stopSummary).toEqual({
      numberedCount: 2,
      unsequencedCount: 0,
    });
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([2, 1]);
  });

  it("recognizes extended Shopee STOP and package identity headers", () => {
    const route = parseRouteRows(
      [
        {
          "Route STOP No.": 1,
          "Destination Address": "Rua Um, 10, Presidente Prudente, SP",
          "SPX Tracking ID (Barcode)": "BR-TRACK-001",
          "Package Count": 4,
        },
        {
          "Route STOP No.": 2,
          "Destination Address": "Rua Dois, 20, Presidente Prudente, SP",
          "SPX Tracking ID (Barcode)": "BR-TRACK-002",
          "Package Count": 2,
        },
      ],
      "shopee-cabecalhos-estendidos.xlsx",
      "generic"
    );

    expect(route.sourceProvider).toBe("shopee");
    expect(route.stopSummary).toEqual({ numberedCount: 2, unsequencedCount: 0 });
    expect(route.packageColumnDetected).toBe(true);
    expect(route.packageSummary).toEqual({ identifiedCount: 2, missingCount: 0 });
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "BR-TRACK-001",
      "BR-TRACK-002",
    ]);
  });

  it("uses a populated shipment identity when an earlier package column is blank", () => {
    const route = parseRouteRows(
      [
        {
          STOP: 1,
          "Destination Address": "Rua Um, 10, Presidente Prudente, SP",
          Waybill: "",
          "Shipment ID": "SHIP-001",
        },
        {
          STOP: 2,
          "Destination Address": "Rua Dois, 20, Presidente Prudente, SP",
          Waybill: "",
          "Shipment ID": "SHIP-002",
        },
      ],
      "shopee-shipment.xlsx",
      "generic"
    );

    expect(route.packageSummary).toEqual({ identifiedCount: 2, missingCount: 0 });
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "SHIP-001",
      "SHIP-002",
    ]);
  });

  it("does not mistake package quantity for package identity", () => {
    const route = parseRouteRows(
      [
        {
          STOP: 1,
          "Destination Address": "Rua Um, 10, Presidente Prudente, SP",
          "Package Count": 4,
        },
        {
          STOP: 2,
          "Destination Address": "Rua Dois, 20, Presidente Prudente, SP",
          "Package Count": 2,
        },
      ],
      "shopee-apenas-quantidade.xlsx",
      "generic"
    );

    expect(route.packageColumnDetected).toBe(false);
    expect(route.packageSummary).toEqual({ identifiedCount: 0, missingCount: 2 });
    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("uses a Codigo column as package identity only when STOP identifies Shopee", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua A, 10, Presidente Prudente, SP",
          STOP: 1,
          Codigo: "BR-CODIGO-001",
        },
        {
          "Destination Address": "Rua B, 20, Presidente Prudente, SP",
          STOP: 2,
          Codigo: "BR-CODIGO-002",
        },
      ],
      "shopee-codigo.xlsx",
      "generic"
    );

    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      "BR-CODIGO-001",
      "BR-CODIGO-002",
    ]);
  });

  it("reports an ignored STOP column when another provider was selected explicitly", () => {
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
      "mercado-livre-stop.csv",
      "mercado_livre"
    );

    expect(route.sourceProvider).toBe("mercado_livre");
    expect(route.hasStopSequence).toBe(false);
    expect(route.stopColumnDetected).toBe(true);
    expect(route.stopColumnIgnored).toBe(true);
    expect(route.stops.map((stop) => stop.routingStop)).toEqual([undefined, undefined]);
  });

  it("rejects invalid STOP values instead of silently treating them as unsequenced", () => {
    expect(() =>
      parseRouteRows(
        [
          {
            "Destination Address": "Rua A, 10, Presidente Prudente",
            STOP: 1,
          },
          {
            "Destination Address": "Rua B, 20, Presidente Prudente",
            STOP: "proximo",
          },
        ],
        "stop-invalido.xlsx",
        "shopee"
      )
    ).toThrow("Coluna STOP com valor invalido nas linhas 3");
  });

  it("groups a repeated STOP even when its address text varies", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua A, 10, Presidente Prudente",
          "Tracking ID": "BR-PKG-053-A",
          STOP: 53,
        },
        {
          "Destination Address": "Rua A, 10, fundos, Presidente Prudente",
          "Tracking ID": "BR-PKG-053-B",
          STOP: 53,
        },
        {
          "Destination Address": "Rua B, 20, Presidente Prudente",
          "Tracking ID": "BR-PKG-054-A",
          STOP: 54,
        },
      ],
      "stop-repetido.xlsx",
      "shopee"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.stops[0].originalStop).toBe(53);
    expect(route.stops[0].deliveryCount).toBe(2);
    expect(route.stops[0].metadata?.packageNumbers).toEqual([
      "BR-PKG-053-A",
      "BR-PKG-053-B",
    ]);
    expect(route.stops[0].notes).toContain("2x entregas neste endereco");
  });

  it("consolidates units at the same numbered STOP into one route stop", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua A, 10, apartamento 1, Presidente Prudente",
          STOP: 7,
        },
        {
          "Destination Address": "Rua A, 10, apartamento 2, Presidente Prudente",
          STOP: 7,
        },
        {
          "Destination Address": "Rua B, 20, Presidente Prudente",
          STOP: 8,
        },
      ],
      "stop-mesmo-predio.xlsx",
      "shopee"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.stops.map((stop) => stop.originalStop)).toEqual([7, 8]);
    expect(route.stops[0].deliveryCount).toBe(2);
  });

  it("accepts the repeated STOP pattern reported by the field spreadsheet", () => {
    const route = parseRouteRows(
      [
        { "Destination Address": "Rua 53, 100", "Tracking ID": "P53-A", STOP: 53 },
        { "Destination Address": "Rua 53, 100, casa 2", "Tracking ID": "P53-B", STOP: 53 },
        { "Destination Address": "Rua 60, 200", "Tracking ID": "P60-A", STOP: 60 },
        { "Destination Address": "Rua 60, 200, fundos", "Tracking ID": "P60-B", STOP: 60 },
        { "Destination Address": "Rua 62, 300", "Tracking ID": "P62-A", STOP: 62 },
        { "Destination Address": "Rua 62, 300, apto 1", "Tracking ID": "P62-B", STOP: 62 },
        { "Destination Address": "Rua 62, 300, apto 2", "Tracking ID": "P62-C", STOP: 62 },
        { "Destination Address": "Rua 65, 400", "Tracking ID": "P65-A", STOP: 65 },
        { "Destination Address": "Rua 65, 400, bloco B", "Tracking ID": "P65-B", STOP: 65 },
      ],
      "rota-campo.xlsx",
      "shopee"
    );

    expect(route.stops.map((stop) => stop.originalStop)).toEqual([53, 60, 62, 65]);
    expect(route.stops.map((stop) => stop.deliveryCount)).toEqual([2, 2, 3, 2]);
    expect(route.totalDeliveries).toBe(9);
    expect(route.groupedDeliveries).toBe(5);
    expect(route.stops[2].metadata?.packageNumbers).toEqual([
      "P62-A",
      "P62-B",
      "P62-C",
    ]);
  });

  it("does not treat a generic Codigo column as a package number", () => {
    const route = parseRouteRows(
      [
        {
          "Destination Address": "Rua A, 10, Presidente Prudente",
          Codigo: "CLIENTE-001",
        },
        {
          "Destination Address": "Rua B, 20, Presidente Prudente",
          Codigo: "CLIENTE-002",
        },
      ],
      "codigo-generico.csv",
      "generic"
    );

    expect(route.stops.map((stop) => stop.packageNumber)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("groups repeated spreadsheet addresses as one stop with delivery count and package notes", () => {
    const sameAddress = "Rua Duplicada, 100, Centro, Presidente Prudente, SP";
    const route = parseRouteRows(
      [
        {
          "Destination Address": sameAddress,
          "SPX TN": "BR260000000001A",
          Latitude: -22.1,
          Longitude: -51.4,
        },
        {
          "Destination Address": "Rua Unica, 200, Centro, Presidente Prudente, SP",
          "SPX TN": "BR260000000003A",
          Latitude: -22.2,
          Longitude: -51.5,
        },
        {
          "Destination Address": sameAddress,
          "SPX TN": "BR260000000002A",
          Latitude: -22.1001,
          Longitude: -51.4001,
        },
      ],
      "rota-endereco-repetido.xlsx",
      "generic"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.totalDeliveries).toBe(3);
    expect(route.groupedDeliveries).toBe(1);
    expect(route.skippedRows).toBe(0);
    expect(route.stops[0].address).toBe(sameAddress);
    expect(route.stops[0].deliveryCount).toBe(2);
    expect(route.stops[0].metadata?.groupedDeliveryCount).toBe(2);
    expect(route.stops[0].metadata?.packageNumbers).toEqual([
      "BR260000000001A",
      "BR260000000002A",
    ]);
    expect(route.stops[0].notes).toContain("2x entregas neste endereco");
    expect(route.stops[0].notes).toContain(
      "Pacotes: BR260000000001A, BR260000000002A"
    );
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

  it("groups different iMile packages delivered to the same address", () => {
    const route = parseImileScreenText(
      `
      <node content-desc="6052826300704" />
      <node content-desc="Cliente Um" />
      <node content-desc="100,Rua Mesmo Endereco,Jardim Eldorado,Presidente Prudente,SÃ£o Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052126314870" />
      <node content-desc="Cliente Dois" />
      <node content-desc="100,Rua Mesmo Endereco,Jardim Eldorado,Presidente Prudente,SÃ£o Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      <node content-desc="6052126314888" />
      <node content-desc="Cliente Tres" />
      <node content-desc="200,Rua Nova,Vila Nova,Presidente Prudente,SÃ£o Paulo&#10;E2E: Restante 24 Hora Tempo esgotado" />
      `,
      "imile-mesmo-endereco.xml"
    );

    expect(route.stops).toHaveLength(2);
    expect(route.totalDeliveries).toBe(3);
    expect(route.groupedDeliveries).toBe(1);
    expect(route.stops[0].deliveryCount).toBe(2);
    expect(route.stops[0].metadata?.groupedDeliveryCount).toBe(2);
    expect(route.stops[0].notes).toContain("2x entregas neste endereco");
    expect(route.stops[0].notes).toContain("6052826300704");
    expect(route.stops[0].notes).toContain("6052126314870");
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
