const optimizationStorageKey = "simplexOptimizationModel";
const optimizationNavigationKey = "simplexOpenedFromRegistration";

const elements = {
  backButton: document.querySelector("#backButton"),
  showZerosToggle: document.querySelector("#showZerosToggle"),
  status: document.querySelector("#optimizationStatus"),
  tableauContainer: document.querySelector("#tableauContainer"),
  iterationCounter: document.querySelector("#iterationCounter"),
  baseSummary: document.querySelector("#baseSummary"),
  objectiveValue: document.querySelector("#objectiveValue"),
  enteringVariable: document.querySelector("#enteringVariable"),
  leavingVariable: document.querySelector("#leavingVariable"),
  pivotInfo: document.querySelector("#pivotInfo"),
  firstIterationButton: document.querySelector("#firstIterationButton"),
  previousTableauButton: document.querySelector("#previousTableauButton"),
  previousStepButton: document.querySelector("#previousStepButton"),
  nextStepButton: document.querySelector("#nextStepButton"),
  nextTableauButton: document.querySelector("#nextTableauButton"),
  lastIterationButton: document.querySelector("#lastIterationButton"),
  iterationList: document.querySelector("#iterationList"),
  resultPanel: document.querySelector("#resultPanel")
};

let currentTableau = null;

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 2
  });
}

function formatTableValue(value) {
  if (!elements.showZerosToggle.checked && Number(value) === 0) {
    return "";
  }

  return formatNumber(value);
}

function variableName(index) {
  return `x_${index + 1}`;
}

function slackName(index) {
  return `s_${index + 1}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatVariableLabel(value) {
  const match = String(value).match(/^([a-zA-Z])_(\d+)$/);
  if (!match) {
    return escapeHtml(value);
  }

  return `${escapeHtml(match[1])}<sub>${escapeHtml(match[2])}</sub>`;
}

function plainVariableLabel(value) {
  const match = String(value).match(/^([a-zA-Z])_(\d+)$/);
  if (!match) {
    return String(value ?? "");
  }

  return `${match[1]}${match[2]}`;
}

function columnWidth(chars, min = 6, max = 24, extra = 3) {
  return Math.min(Math.max(chars + extra, min), max);
}

function getTableauColumnWidths(frame) {
  const baseWidth = columnWidth(
    Math.max("Base".length, ...frame.rows.map((row) => plainVariableLabel(row.base).length)),
    6,
    8,
    2
  );

  const valueWidths = frame.columns.map((column, index) => {
    const maxChars = Math.max(
      plainVariableLabel(column).length,
      ...frame.rows.map((row) => formatTableValue(row.values[index]).length)
    );
    return columnWidth(maxChars);
  });

  const solutionWidth = columnWidth(
    Math.max("Solução".length, ...frame.rows.map((row) => formatTableValue(row.rhs).length)),
    10,
    18
  );

  const intersectionWidth = columnWidth(
    Math.max(
      8,
      ...frame.rows.map((row) => renderIntersectionValue(frame, row).length)
    ),
    9,
    12,
    1
  );

  return [baseWidth, ...valueWidths, solutionWidth, intersectionWidth];
}

function readStoredModel() {
  const rawModel = sessionStorage.getItem(optimizationStorageKey);
  if (!rawModel) return null;

  try {
    return JSON.parse(rawModel);
  } catch (error) {
    return null;
  }
}

function isValidModel(model) {
  return (
    model &&
    Number.isFinite(model.budget) &&
    model.budget > 0 &&
    Array.isArray(model.rooms) &&
    model.rooms.length > 0 &&
    Array.isArray(model.doctors) &&
    model.doctors.length > 0
  );
}

function buildInitialTableau(model) {
  const decisionColumns = model.doctors.map((_, index) => variableName(index));
  const constraintCount = model.doctors.length + model.rooms.length + 1;
  const slackColumns = Array.from({ length: constraintCount }, (_, index) => slackName(index));
  const columns = [...decisionColumns, ...slackColumns];
  const rows = [];
  let slackIndex = 0;

  model.doctors.forEach((doctor, doctorIndex) => {
    const values = Array(columns.length).fill(0);
    values[doctorIndex] = 1;
    values[decisionColumns.length + slackIndex] = 1;
    rows.push({
      base: slackName(slackIndex),
      label: doctor.name,
      values,
      rhs: doctor.maxHours
    });
    slackIndex += 1;
  });

  model.rooms.forEach((room) => {
    const values = Array(columns.length).fill(0);
    model.doctors.forEach((doctor, doctorIndex) => {
      if (doctor.roomId === room.id) {
        values[doctorIndex] = 1;
      }
    });
    values[decisionColumns.length + slackIndex] = 1;
    rows.push({
      base: slackName(slackIndex),
      label: room.name,
      values,
      rhs: room.availableHours
    });
    slackIndex += 1;
  });

  const budgetValues = Array(columns.length).fill(0);
  model.doctors.forEach((doctor, doctorIndex) => {
    budgetValues[doctorIndex] = doctor.costPerHour;
  });
  budgetValues[decisionColumns.length + slackIndex] = 1;
  rows.push({
    base: slackName(slackIndex),
    label: "Orçamento",
    values: budgetValues,
    rhs: model.budget
  });

  const objectiveValues = Array(columns.length).fill(0);
  model.doctors.forEach((doctor, doctorIndex) => {
    objectiveValues[doctorIndex] = -doctor.patientsPerHour;
  });
  rows.push({
    base: "Z",
    label: "Função objetivo",
    values: objectiveValues,
    rhs: 0
  });

  addIntersectionValues(rows);

  return { columns, rows };
}

function addIntersectionValues(rows) {
  const objectiveRow = rows.find((row) => row.base === "Z");
  if (!objectiveRow) return;

  const pivotColumnIndex = objectiveRow.values.reduce((selectedIndex, value, index, values) => {
    return value < values[selectedIndex] ? index : selectedIndex;
  }, 0);

  setIntersectionValues(rows, pivotColumnIndex);
}

function setIntersectionValues(rows, pivotColumnIndex) {
  rows.forEach((row) => {
    if (row.base === "Z") {
      row.intersection = "";
      return;
    }

    const pivotCoefficient = row.values[pivotColumnIndex];
    row.intersection = pivotCoefficient > 0 ? row.rhs / pivotCoefficient : "";
  });
}

function cloneFrame(frame) {
  return JSON.parse(JSON.stringify(frame));
}

function createInitialFrame(tableau) {
  return {
    iteration: 0,
    title: "Tableau inicial",
    substep: "initial",
    substepLabel: "Tableau inicial",
    status: "initial",
    message: "Tableau inicial gerado a partir dos dados cadastrados.",
    columns: tableau.columns,
    rows: tableau.rows,
    objectiveValue: 0,
    enteringColumnIndex: null,
    leavingRowIndex: null,
    pivot: null,
    solution: null
  };
}

function normalizeFrame(frame, index, fallbackFrame) {
  const baseFrame = fallbackFrame ?? {};
  return {
    iteration: Number.isFinite(frame.iteration) ? frame.iteration : index,
    title: frame.title || `Iteração ${index}`,
    substep: frame.substep ?? null,
    substepLabel: frame.substepLabel ?? "",
    status: frame.status || "running",
    message: frame.message || "",
    columns: frame.columns ?? baseFrame.columns ?? [],
    rows: frame.rows ?? baseFrame.rows ?? [],
    objectiveValue: frame.objectiveValue ?? baseFrame.objectiveValue ?? 0,
    enteringColumnIndex: frame.enteringColumnIndex ?? null,
    enteringVariable: frame.enteringVariable ?? null,
    leavingRowIndex: frame.leavingRowIndex ?? null,
    leavingVariable: frame.leavingVariable ?? null,
    pivot: frame.pivot ?? null,
    solution: frame.solution ?? null
  };
}

function getEnteringVariable(frame) {
  if (frame.enteringVariable) return frame.enteringVariable;
  if (Number.isInteger(frame.enteringColumnIndex)) return frame.columns[frame.enteringColumnIndex] ?? null;
  if (frame.pivot && Number.isInteger(frame.pivot.columnIndex)) return frame.columns[frame.pivot.columnIndex] ?? null;
  return null;
}

function getLeavingVariable(frame) {
  if (frame.leavingVariable) return frame.leavingVariable;
  if (Number.isInteger(frame.leavingRowIndex)) return frame.rows[frame.leavingRowIndex]?.base ?? null;
  if (frame.pivot && Number.isInteger(frame.pivot.rowIndex)) return frame.rows[frame.pivot.rowIndex]?.base ?? null;
  return null;
}

function getPivot(frame) {
  if (frame.pivot) return frame.pivot;
  if (Number.isInteger(frame.leavingRowIndex) && Number.isInteger(frame.enteringColumnIndex)) {
    return {
      rowIndex: frame.leavingRowIndex,
      columnIndex: frame.enteringColumnIndex
    };
  }
  return null;
}

function shouldShowIntersection(frame) {
  return ["intersection", "leaving"].includes(frame.substep);
}

function renderIntersectionValue(frame, row) {
  if (!shouldShowIntersection(frame)) return "-";
  if (row.intersection === "" || row.intersection === null || row.intersection === undefined) return "-";
  return formatNumber(row.intersection);
}

function getIterationIndexes(frames, iteration) {
  return frames
    .map((frame, index) => (frame.iteration === iteration ? index : -1))
    .filter((index) => index >= 0);
}

function getSubstepPosition(frames, activeIndex) {
  const frame = frames[activeIndex];
  if (!frame) return { current: 0, total: 0 };

  const indexes = getIterationIndexes(frames, frame.iteration);
  return {
    current: indexes.indexOf(activeIndex) + 1,
    total: indexes.length
  };
}

function getDistinctIterations(frames) {
  return [...new Set(frames.map((frame) => frame.iteration))];
}

function renderEmptyState() {
  elements.status.textContent = "Nenhum dado válido foi encontrado. Volte ao cadastro para iniciar a otimização.";
  elements.tableauContainer.innerHTML = `
    <div class="empty-state">
      <p>Abra a otimização pelo botão Iniciar otimização na tela de cadastro.</p>
    </div>
  `;
  elements.resultPanel.textContent = "Sem dados para otimizar.";
}

function getCellClass(frame, rowIndex, columnIndex) {
  const pivot = getPivot(frame);
  const classes = [];

  if (frame.enteringColumnIndex === columnIndex || pivot?.columnIndex === columnIndex) {
    classes.push("pivot-column");
  }

  if (pivot?.rowIndex === rowIndex) {
    classes.push("pivot-row");
  }

  if (pivot?.rowIndex === rowIndex && pivot?.columnIndex === columnIndex) {
    classes.push("pivot-cell");
  }

  return classes.join(" ");
}

function renderTableau(frame) {
  const columnWidths = getTableauColumnWidths(frame);
  const pivot = getPivot(frame);

  elements.tableauContainer.innerHTML = `
    <table class="simplex-table">
      <colgroup>
        ${columnWidths.map((width) => `<col style="width: ${width}ch;">`).join("")}
      </colgroup>
      <thead>
        <tr>
          <th>Base</th>
          ${frame.columns
            .map((column, index) => `<th class="${pivot?.columnIndex === index ? "pivot-column" : ""}">${formatVariableLabel(column)}</th>`)
            .join("")}
          <th class="solution-column">Solução</th>
          <th class="intersection-column">Intersecção</th>
        </tr>
      </thead>
      <tbody>
        ${frame.rows
          .map((row, rowIndex) => {
            const isObjective = row.base === "Z";
            const isLeaving = getLeavingVariable(frame) === row.base;
            return `
              <tr class="${[isObjective ? "objective-row" : "", pivot?.rowIndex === rowIndex ? "pivot-row" : ""].filter(Boolean).join(" ")}">
                <td data-label="Base" class="${isLeaving ? "leaving-base" : ""}">
                  <strong>${formatVariableLabel(row.base)}</strong>
                  <span>${escapeHtml(row.label)}</span>
                </td>
                ${row.values
                  .map(
                    (value, columnIndex) =>
                      `<td class="${getCellClass(frame, rowIndex, columnIndex)}" data-label="${escapeHtml(frame.columns[columnIndex])}">${formatTableValue(value)}</td>`
                  )
                  .join("")}
                <td class="solution-column" data-label="Solução">${formatTableValue(row.rhs)}</td>
                <td class="intersection-column" data-label="Intersecção">${renderIntersectionValue(frame, row)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSummary(frame, activeIndex, total) {
  const enteringVariable = getEnteringVariable(frame);
  const leavingVariable = getLeavingVariable(frame);
  const pivot = getPivot(frame);
  const baseValues = frame.rows.filter((row) => row.base !== "Z").map((row) => row.base);
  const substepPosition = getSubstepPosition(simplexUI.frames, activeIndex);
  const iterationLabel = frame.iteration === 0 ? "Inicial" : `Iteração ${frame.iteration}`;

  elements.status.textContent = frame.message || frame.title;
  elements.iterationCounter.textContent = `${iterationLabel} · ${substepPosition.current}/${substepPosition.total}`;
  elements.baseSummary.innerHTML = baseValues.length ? baseValues.map(formatVariableLabel).join(", ") : "-";
  elements.objectiveValue.textContent = formatNumber(frame.objectiveValue);
  elements.enteringVariable.innerHTML = enteringVariable ? formatVariableLabel(enteringVariable) : "-";
  elements.leavingVariable.innerHTML = leavingVariable ? formatVariableLabel(leavingVariable) : "-";
  elements.pivotInfo.innerHTML = pivot
    ? `${formatVariableLabel(frame.rows[pivot.rowIndex]?.base ?? "-")} × ${formatVariableLabel(frame.columns[pivot.columnIndex] ?? "-")}`
    : "-";
}

function renderIterationList(frames, activeIndex) {
  const groups = getDistinctIterations(frames).map((iteration) => {
    const indexes = getIterationIndexes(frames, iteration);
    const firstFrame = frames[indexes[0]];
    const isActiveIteration = indexes.includes(activeIndex);
    const title = iteration === 0 ? "Tableau inicial" : `Iteração ${iteration}`;

    return `
      <article class="iteration-card ${isActiveIteration ? "is-active" : ""}">
        <button class="iteration-card-title" type="button" data-iteration-index="${indexes[0]}">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(firstFrame.status)}</span>
        </button>
        <div class="substep-list">
          ${indexes
            .map((index) => {
              const frame = frames[index];
              return `
                <button class="substep-item ${index === activeIndex ? "is-active" : ""}" type="button" data-iteration-index="${index}">
                  ${escapeHtml(frame.substepLabel || frame.status)}
                </button>
              `;
            })
            .join("")}
        </div>
      </article>
    `;
  });

  elements.iterationList.innerHTML = groups.join("");
}

function renderResult(frame) {
  if (frame.status === "unbounded") {
    elements.resultPanel.innerHTML = `<p class="result-badge error">Problema ilimitado.</p>`;
    return;
  }

  if (frame.status === "infeasible") {
    elements.resultPanel.innerHTML = `<p class="result-badge error">Problema sem solução viável.</p>`;
    return;
  }

  if (frame.status !== "optimal" || !frame.solution) {
    elements.resultPanel.innerHTML = `<p>A solução ótima ainda não foi informada pela lógica do algoritmo.</p>`;
    return;
  }

  const variables = frame.solution.variables ?? [];
  const resources = frame.solution.resources ?? [];
  elements.resultPanel.innerHTML = `
    <p class="result-badge success">Solução ótima encontrada.</p>
    <dl class="result-list">
      <div>
        <dt>Valor ótimo</dt>
        <dd>${formatNumber(frame.solution.objectiveValue ?? frame.objectiveValue)}</dd>
      </div>
      ${variables
        .map(
          (variable) => `
            <div>
              <dt>${formatVariableLabel(variable.name)}${variable.label ? ` · ${escapeHtml(variable.label)}` : ""}</dt>
              <dd>${formatNumber(variable.value)}</dd>
            </div>
          `
        )
        .join("")}
      ${resources
        .map(
          (resource) => `
            <div>
              <dt>${escapeHtml(resource.name)}</dt>
              <dd>${formatNumber(resource.used)} usados · ${formatNumber(resource.remaining)} restantes</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

function renderControls(activeIndex, total) {
  elements.firstIterationButton.disabled = activeIndex === 0;
  elements.previousTableauButton.disabled = simplexUI.getPreviousIterationIndex() === null;
  elements.previousStepButton.disabled = activeIndex === 0;
  elements.nextStepButton.disabled = activeIndex >= total - 1;
  elements.nextTableauButton.disabled = simplexUI.getNextIterationIndex() === null;
  elements.lastIterationButton.disabled = activeIndex >= total - 1;
}

const simplexUI = {
  frames: [],
  activeIndex: 0,

  setIterations(nextFrames) {
    const sourceFrames = Array.isArray(nextFrames) && nextFrames.length > 0 ? nextFrames : [];
    this.frames = sourceFrames.map((frame, index) => normalizeFrame(frame, index, sourceFrames[index - 1]));
    this.activeIndex = 0;
    this.render();
  },

  addIteration(frame) {
    const fallbackFrame = this.frames[this.frames.length - 1];
    this.frames.push(normalizeFrame(frame, this.frames.length, fallbackFrame));
    this.activeIndex = this.frames.length - 1;
    this.render();
  },

  updateIteration(index, frame) {
    if (!this.frames[index]) return;
    this.frames[index] = normalizeFrame({ ...this.frames[index], ...frame }, index, this.frames[index - 1]);
    this.render();
  },

  goTo(index) {
    if (index < 0 || index >= this.frames.length) return;
    this.activeIndex = index;
    this.render();
  },

  previous() {
    this.goTo(this.activeIndex - 1);
  },

  next() {
    this.goTo(this.activeIndex + 1);
  },

  getPreviousIterationIndex() {
    const currentIteration = this.getCurrentFrame()?.iteration;
    const previousIteration = getDistinctIterations(this.frames)
      .filter((iteration) => iteration < currentIteration)
      .at(-1);

    if (previousIteration === undefined) return null;
    return getIterationIndexes(this.frames, previousIteration)[0] ?? null;
  },

  getNextIterationIndex() {
    const currentIteration = this.getCurrentFrame()?.iteration;
    const nextIteration = getDistinctIterations(this.frames).find((iteration) => iteration > currentIteration);

    if (nextIteration === undefined) return null;
    return getIterationIndexes(this.frames, nextIteration)[0] ?? null;
  },

  previousIteration() {
    const index = this.getPreviousIterationIndex();
    if (index !== null) this.goTo(index);
  },

  nextIteration() {
    const index = this.getNextIterationIndex();
    if (index !== null) this.goTo(index);
  },

  first() {
    this.goTo(0);
  },

  last() {
    this.goTo(this.frames.length - 1);
  },

  getCurrentFrame() {
    return this.frames[this.activeIndex] ?? null;
  },

  render() {
    const frame = this.getCurrentFrame();
    if (!frame) return;

    currentTableau = frame;
    renderSummary(frame, this.activeIndex, this.frames.length);
    renderControls(this.activeIndex, this.frames.length);
    renderTableau(frame);
    renderIterationList(this.frames, this.activeIndex);
    renderResult(frame);
  }
};

function goBackToRegistration() {
  const openedFromRegistration = sessionStorage.getItem(optimizationNavigationKey) === "true";
  if (openedFromRegistration && window.history.length > 1) {
    sessionStorage.removeItem(optimizationNavigationKey);
    window.history.back();
    return;
  }

  window.location.href = "index.html";
}

function createSimplexIterations(context) {
  const { initialFrame, helpers } = context;
  const frames = [helpers.cloneFrame(initialFrame)];
  let currentFrame = helpers.cloneFrame(initialFrame);
  let iteration = 1;

  while (true) {
    currentFrame.iteration = iteration;
    
    const zRow = currentFrame.rows.find(r => r.base === "Z");
    let minZ = 0;
    let enteringColumnIndex = -1;
    for (let i = 0; i < zRow.values.length; i++) {
      if (zRow.values[i] < minZ) {
        minZ = zRow.values[i];
        enteringColumnIndex = i;
      }
    }

    if (enteringColumnIndex === -1) {
      currentFrame = helpers.cloneFrame(currentFrame);
      currentFrame.substep = "optimal";
      currentFrame.substepLabel = "Solução Ótima";
      currentFrame.status = "optimal";
      currentFrame.message = "Sem coeficientes negativos na linha do objetivo. Solução ótima encontrada";
      currentFrame.objectiveValue = zRow.rhs;
      
      currentFrame.solution = {
        objectiveValue: zRow.rhs,
        variables: currentFrame.columns.map(col => {
          const row = currentFrame.rows.find(r => r.base === col);
          return { name: col, value: row ? row.rhs : 0 };
        })
      };
      
      frames.push(currentFrame);
      break;
    }

    currentFrame = helpers.cloneFrame(currentFrame);
    currentFrame.enteringColumnIndex = enteringColumnIndex;
    currentFrame.enteringVariable = currentFrame.columns[enteringColumnIndex];
    currentFrame.substep = "entering";
    currentFrame.substepLabel = "Variável que entra";
    currentFrame.message = `A variável ${currentFrame.enteringVariable} entra na base por ter o menor valor negativo ${minZ}`;
    frames.push(helpers.cloneFrame(currentFrame));

    currentFrame = helpers.cloneFrame(currentFrame);
    helpers.setIntersectionValues(currentFrame.rows, enteringColumnIndex);
    currentFrame.substep = "intersection";
    currentFrame.substepLabel = "Cálculo de intersecção";
    currentFrame.message = "Calculando as intersecções (solução/(coeficiente da coluna pivô))";
    frames.push(helpers.cloneFrame(currentFrame));

    let minIntersection = Infinity;
    let leavingRowIndex = -1;

    for (let i = 0; i < currentFrame.rows.length; i++) {
      const row = currentFrame.rows[i];
      if (row.base === "Z") continue;
      
      const intersection = row.intersection;
      if (intersection !== "" && intersection !== null && intersection > 0 && intersection < minIntersection) {
        minIntersection = intersection;
        leavingRowIndex = i;
      }
    }

    if (leavingRowIndex === -1) {
      currentFrame = helpers.cloneFrame(currentFrame);
      currentFrame.substep = "unbounded";
      currentFrame.substepLabel = "Problema Ilimitado";
      currentFrame.status = "unbounded";
      currentFrame.message = "Nenhuma restrição limita o crescimento desta variável. O problema é ilimitado.";
      frames.push(currentFrame);
      break;
    }

    currentFrame = helpers.cloneFrame(currentFrame);
    currentFrame.leavingRowIndex = leavingRowIndex;
    currentFrame.leavingVariable = currentFrame.rows[leavingRowIndex].base;
    currentFrame.pivot = { rowIndex: leavingRowIndex, columnIndex: enteringColumnIndex };
    currentFrame.substep = "leaving";
    currentFrame.substepLabel = "Variável que sai";
    const pivotRow = currentFrame.rows[leavingRowIndex];
    const pivotValue = pivotRow.values[enteringColumnIndex];
    currentFrame.message = `A variável ${currentFrame.leavingVariable} sai da base. O elemento pivô ${pivotValue} foi identificado.`;
    frames.push(helpers.cloneFrame(currentFrame));

    currentFrame = helpers.cloneFrame(currentFrame);
    
    for (let j = 0; j < pivotRow.values.length; j++) {
      pivotRow.values[j] /= pivotValue;
    }
    pivotRow.rhs /= pivotValue;
    
    currentFrame.substep = "pivot_row";
    currentFrame.substepLabel = "Normalizar Linha Pivô";
    currentFrame.message = `Dividindo a linha pivô por ${helpers.formatNumber(pivotValue)} para ele virar 1.`;
    frames.push(helpers.cloneFrame(currentFrame));

    for (let i = 0; i < currentFrame.rows.length; i++) {
      if (i === leavingRowIndex) continue;
      
      const targetRow = currentFrame.rows[i];
      const factor = targetRow.values[enteringColumnIndex];
      
      if (Math.abs(factor) == 0) continue;

      currentFrame = helpers.cloneFrame(currentFrame);
      const activePivotRow = currentFrame.rows[leavingRowIndex];
      const activeTargetRow = currentFrame.rows[i];

      for (let j = 0; j < activeTargetRow.values.length; j++) {
        activeTargetRow.values[j] -= factor * activePivotRow.values[j];
      }
      activeTargetRow.rhs -= factor * activePivotRow.rhs;
      
      currentFrame.substep = "row_op";
      currentFrame.substepLabel = `Zerar linha ${activeTargetRow.base}`;
      currentFrame.message = `Subtraindo ${helpers.formatNumber(factor)} × linha ${activePivotRow.base} da linha ${activeTargetRow.base}.`;
      frames.push(helpers.cloneFrame(currentFrame));
    }

    currentFrame = helpers.cloneFrame(currentFrame);
    currentFrame.rows[leavingRowIndex].base = currentFrame.enteringVariable;
    currentFrame.enteringColumnIndex = null;
    currentFrame.leavingRowIndex = null;
    currentFrame.pivot = null;
    
    currentFrame.substep = "end_iteration";
    currentFrame.substepLabel = "Concluir iteração";
    currentFrame.message = `Iteração ${iteration} concluída. Nova base estabelecida.`;
    currentFrame.objectiveValue = currentFrame.rows.find(r => r.base === "Z").rhs;
    frames.push(helpers.cloneFrame(currentFrame));

    iteration++;
  }

  return frames;
}

function runAlgorithm(model, initialTableau) {
  const initialFrame = createInitialFrame(initialTableau);
  simplexUI.setIterations([initialFrame]);
  const context = {
    model,
    initialTableau: cloneFrame(initialTableau),
    initialFrame: cloneFrame(initialFrame),
    ui: simplexUI,
    helpers: {
      addIntersectionValues,
      cloneFrame,
      formatNumber,
      setIntersectionValues,
      slackName,
      variableName
    }
  };

  if (typeof createSimplexIterations !== "function") {
    return;
  }

  const result = createSimplexIterations(context);
  if (Array.isArray(result)) {
    simplexUI.setIterations(result);
  }
}

function init() {
  const model = readStoredModel();
  if (!isValidModel(model)) {
    renderEmptyState();
    return;
  }

  const initialTableau = buildInitialTableau(model);
  runAlgorithm(model, initialTableau);
}

elements.backButton.addEventListener("click", goBackToRegistration);
elements.showZerosToggle.addEventListener("change", () => simplexUI.render());
elements.firstIterationButton.addEventListener("click", () => simplexUI.first());
elements.previousTableauButton.addEventListener("click", () => simplexUI.previousIteration());
elements.previousStepButton.addEventListener("click", () => simplexUI.previous());
elements.nextStepButton.addEventListener("click", () => simplexUI.next());
elements.nextTableauButton.addEventListener("click", () => simplexUI.nextIteration());
elements.lastIterationButton.addEventListener("click", () => simplexUI.last());
elements.iterationList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const item = target.closest("[data-iteration-index]");
  if (!(item instanceof HTMLElement)) return;

  simplexUI.goTo(Number(item.dataset.iterationIndex));
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;

  if (event.key === "ArrowLeft") simplexUI.previous();
  if (event.key === "ArrowRight") simplexUI.next();
  if (event.key === "PageUp") simplexUI.previousIteration();
  if (event.key === "PageDown") simplexUI.nextIteration();
  if (event.key === "Home") simplexUI.first();
  if (event.key === "End") simplexUI.last();
});

window.simplexUI = simplexUI;

init();
