const STORAGE_KEY = "tambasa_ciclo_pacote_v1";

const elements = {
  stepForm: document.querySelector("#stepForm"),
  sequencialBadge: document.querySelector("#sequencialBadge"),
  formFeedback: document.querySelector("#formFeedback"),
  openConfirmButton: document.querySelector("#openConfirmButton"),
  clearDraftButton: document.querySelector("#clearDraftButton"),
  organogramaColumns: document.querySelector("#organogramaColumns"),
  kpiTotalEtapas: document.querySelector("#kpiTotalEtapas"),
  kpiTotalHoras: document.querySelector("#kpiTotalHoras"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmContent: document.querySelector("#confirmContent"),
  backToEditButton: document.querySelector("#backToEditButton"),
  confirmSaveButton: document.querySelector("#confirmSaveButton"),
};

const LEVELS = ["Inicial", "Intermediario", "Final"];

const state = {
  steps: [],
  draftStep: null,
  uiState: {
    editingId: null,
    pendingConfirmStep: null,
  },
};

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function sanitizeText(value, maxLen = 500) {
  const text = String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLen);
}

function parsePositiveNumber(raw, minAllowed = 0) {
  const normalized = String(raw || "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= minAllowed) return null;
  return parsed;
}

function formToDraft() {
  const form = new FormData(elements.stepForm);
  return {
    setor: sanitizeText(form.get("setor"), 100),
    nivel: sanitizeText(form.get("nivel"), 20),
    responsavelNome: sanitizeText(form.get("responsavelNome"), 80),
    responsavelContato: sanitizeText(form.get("responsavelContato"), 80),
    descricaoTitulo: sanitizeText(form.get("descricaoTitulo"), 120),
    descricaoExplicacao: sanitizeText(form.get("descricaoExplicacao"), 400),
    pesoCd: parsePositiveNumber(form.get("pesoCd"), -1),
    pesoTambasa: parsePositiveNumber(form.get("pesoTambasa"), -1),
    tempoHoras: parsePositiveNumber(form.get("tempoHoras"), 0),
    notas: sanitizeText(form.get("notas"), 500),
  };
}

function isDraftComplete(draft) {
  const textFields = [
    draft.setor,
    draft.nivel,
    draft.responsavelNome,
    draft.responsavelContato,
    draft.descricaoTitulo,
    draft.descricaoExplicacao,
    draft.notas,
  ];
  if (!textFields.every((value) => value.length > 0)) return false;
  if (!LEVELS.includes(draft.nivel)) return false;
  if (draft.pesoCd === null || draft.pesoTambasa === null || draft.tempoHoras === null) return false;
  return true;
}

function getNextSequencial() {
  return state.steps.length + 1;
}

function setFeedback(message = "") {
  if (!message) {
    elements.formFeedback.classList.add("hidden");
    elements.formFeedback.textContent = "";
    return;
  }
  elements.formFeedback.classList.remove("hidden");
  elements.formFeedback.textContent = message;
}

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

function saveStorage() {
  const payload = {
    steps: state.steps,
    draftStep: state.draftStep,
    editingId: state.uiState.editingId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.steps)) {
      state.steps = parsed.steps
        .filter((item) => item && LEVELS.includes(item.nivel))
        .map((item, index) => ({
          ...item,
          sequencial: index + 1,
        }));
    }
    if (parsed.draftStep && typeof parsed.draftStep === "object") {
      state.draftStep = parsed.draftStep;
    }
    if (parsed.editingId) state.uiState.editingId = parsed.editingId;
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function hydrateFormFromStep(step) {
  const map = {
    setor: step?.setor || "",
    nivel: step?.nivel || "",
    responsavelNome: step?.responsavel?.nome || "",
    responsavelContato: step?.responsavel?.contato || "",
    descricaoTitulo: step?.descricao?.titulo || "",
    descricaoExplicacao: step?.descricao?.explicacao || "",
    pesoCd: step?.peso?.cd ?? "",
    pesoTambasa: step?.peso?.tambasa ?? "",
    tempoHoras: step?.tempoHoras ?? "",
    notas: step?.notas || "",
  };
  Object.entries(map).forEach(([name, value]) => {
    const field = elements.stepForm.elements.namedItem(name);
    if (field) field.value = String(value);
  });
}

function clearForm() {
  elements.stepForm.reset();
  state.draftStep = null;
  state.uiState.editingId = null;
  state.uiState.pendingConfirmStep = null;
  setFeedback("");
  render();
  saveStorage();
}

function resequenceSteps() {
  state.steps.forEach((item, index) => {
    item.sequencial = index + 1;
  });
}

function buildPendingStep() {
  const draft = formToDraft();
  state.draftStep = draft;

  if (!isDraftComplete(draft)) {
    setFeedback("Preencha 100% dos campos obrigatorios para confirmar a etapa.");
    return null;
  }

  const currentEditing = state.uiState.editingId
    ? state.steps.find((item) => item.id === state.uiState.editingId)
    : null;

  const pendingStep = {
    id: currentEditing?.id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}`),
    sequencial: currentEditing?.sequencial || getNextSequencial(),
    nivel: draft.nivel,
    setor: draft.setor,
    responsavel: {
      nome: draft.responsavelNome,
      contato: draft.responsavelContato,
    },
    descricao: {
      titulo: draft.descricaoTitulo,
      explicacao: draft.descricaoExplicacao,
    },
    peso: {
      cd: draft.pesoCd,
      tambasa: draft.pesoTambasa,
    },
    tempoHoras: draft.tempoHoras,
    notas: draft.notas,
  };

  return pendingStep;
}

function openConfirmModal(pendingStep) {
  state.uiState.pendingConfirmStep = pendingStep;
  elements.confirmContent.innerHTML = "";

  const fields = [
    ["Etapa", String(pendingStep.sequencial)],
    ["Nivel", pendingStep.nivel],
    ["Setor", pendingStep.setor],
    ["Responsavel", `${pendingStep.responsavel.nome} - ${pendingStep.responsavel.contato}`],
    ["Descricao", `${pendingStep.descricao.titulo}: ${pendingStep.descricao.explicacao}`],
    ["Peso CD", String(pendingStep.peso.cd)],
    ["Peso Tambasa", String(pendingStep.peso.tambasa)],
    ["Tempo previsto", `${pendingStep.tempoHoras} h`],
    ["Notas", pendingStep.notas],
  ];

  fields.forEach(([label, value]) => {
    const row = createElement("p", "confirm-row");
    const strong = createElement("strong", "", `${label}: `);
    row.appendChild(strong);
    row.appendChild(document.createTextNode(value));
    elements.confirmContent.appendChild(row);
  });

  elements.confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  elements.confirmModal.classList.add("hidden");
  state.uiState.pendingConfirmStep = null;
}

function updateKpis() {
  const totalEtapas = state.steps.length;
  const totalHoras = state.steps.reduce((acc, item) => acc + (item.tempoHoras || 0), 0);
  elements.kpiTotalEtapas.textContent = String(totalEtapas);
  elements.kpiTotalHoras.textContent = `${numberFormatter.format(totalHoras)} h`;
}

function buildStepCard(step) {
  const card = createElement("article", "step-card");
  const title = createElement("h4", "step-title", `${step.sequencial}. ${step.descricao.titulo}`);
  const meta1 = createElement(
    "p",
    "step-meta",
    `${step.setor} | Resp.: ${step.responsavel.nome} (${step.responsavel.contato})`
  );
  const meta2 = createElement(
    "p",
    "step-meta",
    `Tempo: ${numberFormatter.format(step.tempoHoras)}h | Peso CD: ${step.peso.cd} | Peso Tambasa: ${step.peso.tambasa}`
  );
  const meta3 = createElement("p", "step-meta", `Notas: ${step.notas}`);

  const actions = createElement("div", "step-actions");
  const editButton = createElement("button", "btn btn-ghost", "Editar");
  editButton.type = "button";
  editButton.addEventListener("click", () => {
    state.uiState.editingId = step.id;
    hydrateFormFromStep(step);
    setFeedback(`Modo edicao da etapa ${step.sequencial}. Confirme novamente para salvar.`);
    render();
    saveStorage();
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
  });

  const deleteButton = createElement("button", "btn btn-secondary", "Excluir");
  deleteButton.type = "button";
  deleteButton.addEventListener("click", () => {
    const shouldDelete = globalThis.confirm(`Deseja excluir a etapa ${step.sequencial}?`);
    if (!shouldDelete) return;
    state.steps = state.steps.filter((item) => item.id !== step.id);
    if (state.uiState.editingId === step.id) {
      state.uiState.editingId = null;
      elements.stepForm.reset();
    }
    resequenceSteps();
    setFeedback("");
    render();
    saveStorage();
  });

  actions.append(editButton, deleteButton);
  card.append(title, meta1, meta2, meta3, actions);
  return card;
}

function renderOrganograma() {
  elements.organogramaColumns.innerHTML = "";

  LEVELS.forEach((level) => {
    const column = createElement("section", "organograma-column");
    const heading = createElement("h3", "", level);
    column.appendChild(heading);

    const items = state.steps
      .filter((item) => item.nivel === level)
      .sort((a, b) => a.sequencial - b.sequencial);

    if (!items.length) {
      column.appendChild(createElement("p", "empty-state", "Sem etapas nesse nivel."));
    } else {
      items.forEach((item) => {
        column.appendChild(buildStepCard(item));
      });
    }

    elements.organogramaColumns.appendChild(column);
  });
}

function renderBadge() {
  const sequence = state.uiState.editingId
    ? state.steps.find((item) => item.id === state.uiState.editingId)?.sequencial || getNextSequencial()
    : getNextSequencial();
  elements.sequencialBadge.textContent = `Etapa ${sequence}`;
}

function render() {
  renderBadge();
  renderOrganograma();
  updateKpis();
}

function bindFormSync() {
  elements.stepForm.addEventListener("input", () => {
    state.draftStep = formToDraft();
    saveStorage();
  });
}

function bindEvents() {
  bindFormSync();

  elements.openConfirmButton.addEventListener("click", () => {
    const pendingStep = buildPendingStep();
    if (!pendingStep) return;
    setFeedback("");
    openConfirmModal(pendingStep);
    saveStorage();
  });

  elements.backToEditButton.addEventListener("click", () => {
    closeConfirmModal();
  });

  elements.confirmSaveButton.addEventListener("click", () => {
    const pending = state.uiState.pendingConfirmStep;
    if (!pending) return;

    const existingIndex = state.steps.findIndex((item) => item.id === pending.id);
    if (existingIndex >= 0) {
      state.steps[existingIndex] = pending;
    } else {
      state.steps.push(pending);
    }

    resequenceSteps();
    closeConfirmModal();
    state.uiState.editingId = null;
    state.draftStep = null;
    elements.stepForm.reset();
    setFeedback("Etapa confirmada e incluida no organograma.");
    render();
    saveStorage();
  });

  elements.clearDraftButton.addEventListener("click", () => {
    clearForm();
  });

  elements.confirmModal.addEventListener("click", (event) => {
    if (event.target === elements.confirmModal) {
      closeConfirmModal();
    }
  });
}

function bootstrap() {
  loadStorage();
  if (state.draftStep) {
    hydrateFormFromStep({
      nivel: state.draftStep.nivel,
      setor: state.draftStep.setor,
      responsavel: {
        nome: state.draftStep.responsavelNome,
        contato: state.draftStep.responsavelContato,
      },
      descricao: {
        titulo: state.draftStep.descricaoTitulo,
        explicacao: state.draftStep.descricaoExplicacao,
      },
      peso: {
        cd: state.draftStep.pesoCd,
        tambasa: state.draftStep.pesoTambasa,
      },
      tempoHoras: state.draftStep.tempoHoras,
      notas: state.draftStep.notas,
    });
  }

  bindEvents();
  render();
}

bootstrap();
