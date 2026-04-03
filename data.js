import { SHEET_GIDS, getSheetCsvUrl } from "./config.js";

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function parseBrazilianNumber(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const sanitized = raw
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.length > 1 || row[0]?.trim()) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.length > 1 || row[0]?.trim()) rows.push(row);
  }

  const [headers = [], ...body] = rows;
  const normalizedHeaders = headers.map((h) => normalizeText(h));

  return body.map((line) => {
    const obj = {};
    normalizedHeaders.forEach((header, idx) => {
      obj[header] = line[idx]?.trim() ?? "";
    });
    return obj;
  });
}

function pickField(row, candidates) {
  for (const name of candidates) {
    const found = row[normalizeText(name)];
    if (found !== undefined) return found;
  }
  return "";
}

const SALES_META_COLUMNS = new Set([
  "DATA",
  "DESCARGA",
  "DATA DESCARGA",
  "ID_PACOTE",
  "ID PACOTE",
  "CLIENTE",
  "PEDIDO",
]);

function extractNumberPrefix(text) {
  const match = String(text || "").trim().match(/^(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

function sortNaturally(values) {
  return [...values].sort((a, b) => {
    const aNum = extractNumberPrefix(a);
    const bNum = extractNumberPrefix(b);
    const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);
    if (bothNumeric && aNum !== bNum) return aNum - bNum;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  });
}

async function fetchSheetCsv(gid) {
  const response = await fetch(getSheetCsvUrl(gid));
  if (!response.ok) {
    throw new Error(`Falha ao buscar CSV (gid=${gid}): ${response.status}`);
  }
  return response.text();
}

export async function loadDataset() {
  const [listaRotasCsv, cidadesCsv, vendasCsv, prazosCsv] = await Promise.all([
    fetchSheetCsv(SHEET_GIDS.listaRotas),
    fetchSheetCsv(SHEET_GIDS.cidades),
    fetchSheetCsv(SHEET_GIDS.vendas),
    fetchSheetCsv(SHEET_GIDS.prazos),
  ]);

  const listaRotasRows = parseCsv(listaRotasCsv);
  const cidadesRows = parseCsv(cidadesCsv);
  const vendasRows = parseCsv(vendasCsv);
  const prazosRows = parseCsv(prazosCsv);

  const rotaMap = new Map();
  const cityToRotaMap = new Map();

  listaRotasRows.forEach((row) => {
    const superRota = pickField(row, ["SUPER ROTA", "SUPERROTA"]);
    const rota = pickField(row, ["ROTA"]);
    const cidadesRaw = pickField(row, ["CIDADES", "CIDADE"]);

    if (!rota) return;
    const rotaKey = normalizeText(rota);

    rotaMap.set(rotaKey, {
      rota: rota.trim(),
      rotaKey,
      superRota: superRota.trim() || "SEM SUPER ROTA",
      superRotaKey: normalizeText(superRota || "SEM SUPER ROTA"),
    });

    if (cidadesRaw) {
      cidadesRaw
        .split(",")
        .map((city) => city.trim())
        .filter(Boolean)
        .forEach((city) => {
          cityToRotaMap.set(normalizeText(city), rotaKey);
        });
    }
  });

  cidadesRows.forEach((row) => {
    const cidade = pickField(row, ["CIDADE"]);
    const rota = pickField(row, ["ROTA"]);
    if (!cidade || !rota) return;
    cityToRotaMap.set(normalizeText(cidade), normalizeText(rota));
  });

  const vendasPorRota = new Map();
  const salesRecords = [];
  const vendasTemRotaExplita = vendasRows.some(
    (row) => pickField(row, ["ROTA"]).trim() !== ""
  );

  if (vendasTemRotaExplita) {
    vendasRows.forEach((row) => {
      const rota = pickField(row, ["ROTA"]);
      if (!rota) return;
      const rotaKey = normalizeText(rota);
      const rotaInfo = rotaMap.get(rotaKey) || {
        rota: rota.trim(),
        rotaKey,
        superRota: "SEM SUPER ROTA",
        superRotaKey: normalizeText("SEM SUPER ROTA"),
      };
      const valor = parseBrazilianNumber(
        pickField(row, ["VALOR", "VALOR VENDA", "VENDAS", "TOTAL"])
      );
      const dataDescarga = pickField(row, ["DATA", "DESCARGA", "DATA DESCARGA"]);
      const idPacote = pickField(row, ["ID_PACOTE", "ID PACOTE", "PACOTE"]);

      vendasPorRota.set(rotaKey, (vendasPorRota.get(rotaKey) || 0) + valor);
      salesRecords.push({
        dataDescarga: dataDescarga || "-",
        idPacote: idPacote || "-",
        rota: rotaInfo.rota,
        rotaKey,
        superRota: rotaInfo.superRota,
        superRotaKey: rotaInfo.superRotaKey,
        valor,
      });
    });
  } else {
    vendasRows.forEach((row) => {
      const dataDescarga = pickField(row, ["DATA", "DESCARGA", "DATA DESCARGA"]);
      const idPacote = pickField(row, ["ID_PACOTE", "ID PACOTE", "PACOTE"]);

      Object.entries(row).forEach(([column, rawValue]) => {
        if (SALES_META_COLUMNS.has(column)) return;
        const valor = parseBrazilianNumber(rawValue);
        if (valor === 0) return;
        const rotaKey = normalizeText(column);
        const rotaInfo = rotaMap.get(rotaKey) || {
          rota: column,
          rotaKey,
          superRota: "SEM SUPER ROTA",
          superRotaKey: normalizeText("SEM SUPER ROTA"),
        };

        vendasPorRota.set(rotaKey, (vendasPorRota.get(rotaKey) || 0) + valor);
        salesRecords.push({
          dataDescarga: dataDescarga || "-",
          idPacote: idPacote || "-",
          rota: rotaInfo.rota,
          rotaKey,
          superRota: rotaInfo.superRota,
          superRotaKey: rotaInfo.superRotaKey,
          valor,
        });
      });
    });
  }

  const prazosPorCidade = [];

  prazosRows.forEach((row) => {
    const cidade = pickField(row, ["CIDADE"]);
    const rotaRaw = pickField(row, ["ROTA"]);
    const prazoAtual = parseBrazilianNumber(
      pickField(row, ["PRAZO DE ENTREGA", "PRAZO", "PRAZO ATUAL", "ATUAL"])
    );
    const ajusteRota = parseBrazilianNumber(
      pickField(row, ["AJUSTE DE ROTA", "PRAZO AJUSTADO", "AJUSTE"])
    );
    const alteracao = parseBrazilianNumber(
      pickField(row, ["ALTERACAO", "ALTERAÇÃO", "DIFERENCA", "DIFERENÇA"])
    );

    const rotaKey = normalizeText(
      rotaRaw || cityToRotaMap.get(normalizeText(cidade || "")) || ""
    );
    if (!rotaKey) return;

    const rotaInfo = rotaMap.get(rotaKey) || {
      rota: rotaRaw || "-",
      rotaKey,
      superRota: "SEM SUPER ROTA",
      superRotaKey: normalizeText("SEM SUPER ROTA"),
    };

    const prazoAjustado = ajusteRota || prazoAtual + alteracao;
    const diferenca = prazoAjustado - prazoAtual;

    const cityItem = {
      cidade: cidade.trim(),
      cidadeKey: normalizeText(cidade),
      rota: rotaInfo.rota,
      rotaKey,
      superRota: rotaInfo.superRota,
      superRotaKey: rotaInfo.superRotaKey,
      prazoAtual,
      prazoAjustado,
      diferenca,
    };

    if (cidade) prazosPorCidade.push(cityItem);
  });

  const superRotas = sortNaturally(
    [...new Set(salesRecords.map((item) => item.superRota))].filter(Boolean)
  );
  const rotas = sortNaturally(
    [...new Set(salesRecords.map((item) => item.rota))].filter(Boolean)
  );

  return {
    salesRecords,
    prazosPorCidade,
    rotaMap,
    filtros: {
      superRotas,
      rotas,
    },
  };
}

export function applySalesFilters(dataset, filters) {
  return dataset.salesRecords.filter((item) => {
    const superRotaMatch =
      filters.superRota === "all" || item.superRota === filters.superRota;
    const rotaMatch = filters.rota === "all" || item.rota === filters.rota;
    return superRotaMatch && rotaMatch;
  });
}

export function getFilteredCities(dataset, filters) {
  const filtered = dataset.prazosPorCidade.filter((item) => {
    const superRotaMatch =
      filters.superRota === "all" || item.superRota === filters.superRota;
    const rotaMatch = filters.rota === "all" || item.rota === filters.rota;
    return superRotaMatch && rotaMatch;
  });

  const uniqueMap = new Map();
  filtered.forEach((item) => {
    if (!item.cidade) return;
    const key = item.cidadeKey;
    if (!uniqueMap.has(key)) uniqueMap.set(key, item);
  });

  return sortNaturally(
    [...uniqueMap.values()].map((item) => item.cidade)
  ).map((cidade) => uniqueMap.get(normalizeText(cidade)));
}
