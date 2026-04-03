import { applySalesFilters, getFilteredCities, loadDataset } from "./data.js";

const elements = {
  superRotaFilter: document.querySelector("#superRotaFilter"),
  rotaFilter: document.querySelector("#rotaFilter"),
  kpiMediaSuperRota: document.querySelector("#kpiMediaSuperRota"),
  kpiMediaRota: document.querySelector("#kpiMediaRota"),
  kpiPacotes: document.querySelector("#kpiPacotes"),
  faturamentoChartPanel: document.querySelector("#faturamentoChartPanel"),
  faturamentoChart: document.querySelector("#faturamentoChart"),
  cityCount: document.querySelector("#cityCount"),
  cityTableBody: document.querySelector("#cityTableBody"),
  dailySalesTableBody: document.querySelector("#dailySalesTableBody"),
  packageTableBody: document.querySelector("#packageTableBody"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
};

const filters = {
  superRota: "all",
  rota: "all",
};

let dataset = null;
let faturamentoChartInstance = null;

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDays = (value) =>
  `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value || 0
  )} dias`;

function parseBrDateToKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `9999-${text}`;
}

function getSuperRotaOrder(value) {
  const match = String(value || "").trim().match(/^(\d+)/);
  if (match) return Number(match[1]);
  return Number.MAX_SAFE_INTEGER;
}

function sortByDateAndHierarchy(a, b) {
  const dateDiff = parseBrDateToKey(a.dataDescarga).localeCompare(parseBrDateToKey(b.dataDescarga));
  if (dateDiff !== 0) return dateDiff;

  const superOrderDiff = getSuperRotaOrder(a.superRota) - getSuperRotaOrder(b.superRota);
  if (superOrderDiff !== 0) return superOrderDiff;

  const superLabelDiff = String(a.superRota).localeCompare(String(b.superRota), "pt-BR", {
    numeric: true,
  });
  if (superLabelDiff !== 0) return superLabelDiff;

  return String(a.rota).localeCompare(String(b.rota), "pt-BR", { numeric: true });
}

function fillSelect(selectEl, values, includeAllLabel = "Todas") {
  const current = selectEl.value || "all";
  selectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = includeAllLabel;
  selectEl.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });

  if ([...selectEl.options].some((opt) => opt.value === current)) {
    selectEl.value = current;
  } else {
    selectEl.value = "all";
  }
}

function updateRotaOptions() {
  const filteredBySuperRota = dataset.salesRecords.filter(
    (item) => filters.superRota === "all" || item.superRota === filters.superRota
  );
  const rotas = [...new Set(filteredBySuperRota.map((item) => item.rota))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  fillSelect(elements.rotaFilter, rotas, "Todas");

  if (!rotas.includes(filters.rota)) {
    filters.rota = "all";
    elements.rotaFilter.value = "all";
  }
}

function renderKpis(items) {
  const superItems = dataset.salesRecords.filter(
    (item) => filters.superRota === "all" || item.superRota === filters.superRota
  );

  const somaSuperRota = superItems.reduce((acc, cur) => acc + cur.valor, 0);
  const diasSuperRota = new Set(
    superItems.map((item) => item.dataDescarga).filter((day) => day && day !== "-")
  ).size;
  const mediaSuperRota = diasSuperRota ? somaSuperRota / diasSuperRota : 0;

  const somaRota = items.reduce((acc, cur) => acc + cur.valor, 0);
  const diasRota = new Set(
    items.map((item) => item.dataDescarga).filter((day) => day && day !== "-")
  ).size;
  const mediaRota = diasRota ? somaRota / diasRota : 0;

  const pacotes = new Set(items.map((item) => item.idPacote)).size;

  elements.kpiMediaSuperRota.textContent = formatCurrency(mediaSuperRota);
  elements.kpiMediaRota.textContent = formatCurrency(mediaRota);
  elements.kpiPacotes.textContent = new Intl.NumberFormat("pt-BR").format(pacotes);
}

function renderChart(items) {
  const hasActiveFilter = filters.superRota !== "all" || filters.rota !== "all";
  if (!hasActiveFilter) {
    elements.faturamentoChartPanel.classList.add("hidden");
    if (faturamentoChartInstance) {
      faturamentoChartInstance.destroy();
      faturamentoChartInstance = null;
    }
    return;
  }

  elements.faturamentoChartPanel.classList.remove("hidden");

  const groupedByDate = new Map();
  items.forEach((item) => {
    const current = groupedByDate.get(item.dataDescarga) || 0;
    groupedByDate.set(item.dataDescarga, current + item.valor);
  });

  const sortedDateRows = [...groupedByDate.entries()]
    .map(([dataDescarga, valor]) => ({ dataDescarga, valor }))
    .sort((a, b) => parseBrDateToKey(a.dataDescarga).localeCompare(parseBrDateToKey(b.dataDescarga)));

  const labels = sortedDateRows.map((row) => row.dataDescarga);
  const data = sortedDateRows.map((row) => row.valor);

  if (faturamentoChartInstance) faturamentoChartInstance.destroy();
  faturamentoChartInstance = new Chart(elements.faturamentoChart, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Faturamento",
          data,
          backgroundColor: "rgba(34, 211, 238, 0.72)",
          borderColor: "rgba(34, 211, 238, 1)",
          borderWidth: 1.2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: {
          callbacks: {
            label(context) {
              return `Faturamento: ${formatCurrency(context.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#cbd5e1", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          title: { display: true, text: "Faturamento", color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.12)" },
        },
        y: {
          ticks: { color: "#cbd5e1" },
          title: { display: true, text: "Valor", color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.2)" },
        },
      },
    },
  });
}

function renderDailySalesTable(items) {
  const grouped = new Map();

  items.forEach((item) => {
    const key = `${item.dataDescarga}|${item.superRota}|${item.rota}`;
    const current = grouped.get(key) || {
      dataDescarga: item.dataDescarga,
      superRota: item.superRota,
      rota: item.rota,
      valor: 0,
      pacotes: new Set(),
    };

    current.valor += item.valor;
    current.pacotes.add(item.idPacote);
    grouped.set(key, current);
  });

  const rows = [...grouped.values()].sort(sortByDateAndHierarchy);

  if (!rows.length) {
    elements.dailySalesTableBody.innerHTML = `
      <tr>
        <td colspan="5">Sem dados para o recorte selecionado.</td>
      </tr>
    `;
    return;
  }

  elements.dailySalesTableBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.dataDescarga}</td>
        <td>${row.superRota}</td>
        <td>${row.rota}</td>
        <td>${row.pacotes.size}</td>
        <td>${formatCurrency(row.valor)}</td>
      </tr>
    `
    )
    .join("");
}

function renderPackageTable(items) {
  const ordered = [...items].sort(sortByDateAndHierarchy);

  if (!ordered.length) {
    elements.packageTableBody.innerHTML = `
      <tr>
        <td colspan="5">Sem pacotes para o recorte selecionado.</td>
      </tr>
    `;
    return;
  }

  elements.packageTableBody.innerHTML = ordered
    .slice(0, 400)
    .map(
      (item) => `
      <tr>
        <td>${item.dataDescarga}</td>
        <td>${item.idPacote}</td>
        <td>${item.superRota}</td>
        <td>${item.rota}</td>
        <td>${formatCurrency(item.valor)}</td>
      </tr>
    `
    )
    .join("");
}

function renderCityTable() {
  const rows = getFilteredCities(dataset, filters);
  elements.cityCount.textContent = new Intl.NumberFormat("pt-BR").format(rows.length);
  if (!rows.length) {
    elements.cityTableBody.innerHTML = `
      <tr>
        <td colspan="5">Sem cidades para o recorte selecionado.</td>
      </tr>
    `;
    return;
  }

  elements.cityTableBody.innerHTML = rows
    .map(
      (item) => `
      <tr>
        <td>${item.cidade}</td>
        <td>${item.rota}</td>
        <td>${formatDays(item.prazoAtual)}</td>
        <td>${formatDays(item.prazoAjustado)}</td>
        <td>${formatDays(item.diferenca)}</td>
      </tr>
    `
    )
    .join("");
}

function render() {
  const items = applySalesFilters(dataset, filters);
  renderKpis(items);
  renderChart(items);
  renderDailySalesTable(items);
  renderPackageTable(items);
  renderCityTable();
}

function bindEvents() {
  elements.superRotaFilter.addEventListener("change", (event) => {
    filters.superRota = event.target.value;
    updateRotaOptions();
    render();
  });

  elements.rotaFilter.addEventListener("change", (event) => {
    filters.rota = event.target.value;
    render();
  });
}

async function bootstrap() {
  try {
    dataset = await loadDataset();
    fillSelect(elements.superRotaFilter, dataset.filtros.superRotas, "Todas");
    updateRotaOptions();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    alert(
      "Nao foi possivel carregar os dados da planilha. Verifique o SPREADSHEET_ID, os GIDs e as permissoes de compartilhamento."
    );
  } finally {
    elements.loadingOverlay.style.display = "none";
  }
}

bootstrap();
