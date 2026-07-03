const optimizationStorageKey = "simplexOptimizationModel";
const optimizationNavigationKey = "simplexOpenedFromRegistration";

const elements = {
  backButton: document.querySelector("#backButton"),
  showZerosToggle: document.querySelector("#showZerosToggle"),
  status: document.querySelector("#optimizationStatus"),
  tableauContainer: document.querySelector("#tableauContainer"),
  iterationCounter: document.querySelector("#iterationCounter"),
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
let currentModel = null;
let activeTooltipTarget = null;
const tableauDeltaEpsilon = 1e-9;

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

function formatDeltaValue(value) {
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(value))}`;
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

function attr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function formatVariableLabel(value) {
  const match = String(value).match(/^([a-zA-Z])_(\d+)$/);
  if (!match) {
    return escapeHtml(value);
  }

  return `${escapeHtml(match[1])}<sub>${escapeHtml(match[2])}</sub>`;
}

function formatTextWithVariableLabels(value) {
  return String(value ?? "")
    .split(/([a-zA-Z]_\d+)/g)
    .map((part) => (/^[a-zA-Z]_\d+$/.test(part) ? formatVariableLabel(part) : escapeHtml(part)))
    .join("");
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
  const zWidth = columnWidth(1, 4, 6, 2);

  const valueWidths = frame.columns.map((column, index) => {
    const maxChars = Math.max(
      plainVariableLabel(column).length,
      ...frame.rows.map((row) => formatTableValue(row.values[index]).length)
    );
    return columnWidth(maxChars);
  });
  const solutionWidth = columnWidth(
    Math.max(
      "Solução".length,
      ...frame.rows.map((row) => formatTableValue(row.rhs).length)
    ),
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

  return [baseWidth, zWidth, ...valueWidths, solutionWidth, intersectionWidth];
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

function getCellDelta(previousValue, nextValue) {
  const before = Number(previousValue);
  const after = Number(nextValue);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;

  const delta = after - before;
  return Math.abs(delta) < tableauDeltaEpsilon ? 0 : delta;
}

function buildEliminationDeltas(frame, fallbackFrame) {
  if (frame.substep !== "row_op" || !fallbackFrame?.rows) return null;

  return {
    values: frame.rows.map((row, rowIndex) => {
      const previousRow = fallbackFrame.rows[rowIndex];
      return row.values.map((value, columnIndex) => {
        return getCellDelta(previousRow?.values?.[columnIndex], value);
      });
    }),
    rhs: frame.rows.map((row, rowIndex) => {
      return getCellDelta(fallbackFrame.rows[rowIndex]?.rhs, row.rhs);
    })
  };
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
  const normalizedFrame = {
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
    solution: frame.solution ?? null,
    operationDeltas: frame.operationDeltas ?? frame.deltas ?? null
  };

  normalizedFrame.operationDeltas =
    normalizedFrame.operationDeltas ?? buildEliminationDeltas(normalizedFrame, baseFrame);

  return normalizedFrame;
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

  if (frame.enteringColumnIndex === columnIndex) {
    classes.push("entering-column");
  }

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

function getHeaderTooltip(frame, columnIndex) {
  const enteringVariable = getEnteringVariable(frame);
  if (enteringVariable && frame.columns[columnIndex] === enteringVariable) {
    return "Variável de entrada";
  }

  return "";
}

function getBaseTooltip(frame, row) {
  const leavingVariable = getLeavingVariable(frame);
  if (leavingVariable && row.base === leavingVariable) {
    return "Variável de saída";
  }

  return "";
}

function getCellTooltip(frame, rowIndex, columnIndex) {
  const pivot = getPivot(frame);
  if (pivot?.rowIndex === rowIndex && pivot?.columnIndex === columnIndex) {
    return "Pivô";
  }

  return "";
}

function getValueDelta(frame, rowIndex, columnIndex) {
  if (frame.substep !== "row_op") return 0;
  return Number(frame.operationDeltas?.values?.[rowIndex]?.[columnIndex] ?? 0);
}

function getSolutionDelta(frame, rowIndex) {
  if (frame.substep !== "row_op") return 0;
  return Number(frame.operationDeltas?.rhs?.[rowIndex] ?? 0);
}

function renderDeltaBadge(delta) {
  if (!Number.isFinite(delta) || Math.abs(delta) < tableauDeltaEpsilon) return "";

  const className = delta > 0 ? "positive" : "negative";
  return `<span class="cell-delta ${className}">${formatDeltaValue(delta)}</span>`;
}

function renderTableCellValue(value, delta = 0) {
  return `
    <span class="cell-current-value">${formatTableValue(value)}</span>
    ${renderDeltaBadge(delta)}
  `;
}

function getRowLabelKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getColumnLabel(column) {
  const decisionMatch = String(column).match(/^x_(\d+)$/);
  if (decisionMatch) {
    return currentModel?.doctors?.[Number(decisionMatch[1]) - 1]?.name ?? "";
  }

  const slackMatch = String(column).match(/^s_(\d+)$/);
  if (!slackMatch || !currentModel) return "";

  const slackIndex = Number(slackMatch[1]) - 1;
  const doctorCount = currentModel.doctors?.length ?? 0;
  const roomCount = currentModel.rooms?.length ?? 0;

  if (slackIndex < doctorCount) {
    return currentModel.doctors[slackIndex]?.name ?? "";
  }

  if (slackIndex < doctorCount + roomCount) {
    return currentModel.rooms[slackIndex - doctorCount]?.name ?? "";
  }

  if (slackIndex === doctorCount + roomCount) {
    return "Orçamento";
  }

  return "";
}

function getTooltipAttributes(primary, secondary) {
  const attributes = [];
  if (primary) attributes.push(`data-tooltip="${attr(primary)}"`);
  if (secondary) attributes.push(`data-tooltip-label="${attr(secondary)}"`);
  return attributes.join(" ");
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
          <th data-tableau-column-name="Z">Z</th>
          ${frame.columns
            .map((column, index) => {
              const tooltip = getHeaderTooltip(frame, index);
              const label = getColumnLabel(column);
              const isEntering = frame.enteringColumnIndex === index;
              const isFocusColumn = frame.enteringColumnIndex === index || pivot?.columnIndex === index;
              return `<th class="${[isFocusColumn ? "pivot-column" : "", isEntering ? "entering-column" : ""].filter(Boolean).join(" ")} ${tooltip || label ? "has-tooltip" : ""}" data-tableau-column-name="${attr(column)}" ${getTooltipAttributes(tooltip, label)} ${tooltip || label ? `tabindex="0"` : ""}>${formatVariableLabel(column)}</th>`;
            })
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
            const isEnteringBase = getEnteringVariable(frame) === row.base;
            const baseTooltip = getBaseTooltip(frame, row);
            const baseTooltipAttributes = getTooltipAttributes(baseTooltip, row.label);
            const baseTooltipClass = baseTooltip || row.label ? "has-tooltip" : "";
            return `
              <tr class="${[isObjective ? "objective-row" : "", pivot?.rowIndex === rowIndex ? "pivot-row" : ""].filter(Boolean).join(" ")}" data-tableau-row-index="${rowIndex}" data-tableau-row-base="${attr(row.base)}" data-tableau-row-label="${attr(row.label)}">
                <td data-label="Base" class="${[isLeaving ? "leaving-base" : "", isEnteringBase ? "entering-base" : "", baseTooltipClass].filter(Boolean).join(" ")}" data-tableau-base-cell="true" ${baseTooltipAttributes} ${baseTooltip || row.label ? `tabindex="0"` : ""}>
                  <strong>${formatVariableLabel(row.base)}</strong>
                </td>
                <td data-label="Z" data-tableau-column-name="Z">${renderTableCellValue(isObjective ? 1 : 0)}</td>
                ${row.values
                  .map(
                    (value, columnIndex) => {
                      const tooltip = getCellTooltip(frame, rowIndex, columnIndex);
                      const delta = getValueDelta(frame, rowIndex, columnIndex);
                      return `<td class="${getCellClass(frame, rowIndex, columnIndex)} ${delta ? "has-delta" : ""} ${tooltip ? "has-tooltip" : ""}" data-label="${escapeHtml(frame.columns[columnIndex])}" data-tableau-column-name="${attr(frame.columns[columnIndex])}" ${tooltip ? `data-tooltip="${attr(tooltip)}" tabindex="0"` : ""}>${renderTableCellValue(value, delta)}</td>`;
                    }
                  )
                  .join("")}
                <td class="solution-column ${getSolutionDelta(frame, rowIndex) ? "has-delta" : ""}" data-label="Solução">${renderTableCellValue(row.rhs, getSolutionDelta(frame, rowIndex))}</td>
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
  const substepPosition = getSubstepPosition(simplexUI.frames, activeIndex);
  const iterationNumber = frame.iteration ?? 0;

  elements.status.innerHTML = formatTextWithVariableLabels(frame.message || frame.title);
  elements.iterationCounter.textContent = `${iterationNumber}.${substepPosition.current}`;
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

function scrollIterationPanelToActiveSubstep() {
  const activeSubstep = elements.iterationList.querySelector(".substep-item.is-active");
  if (!activeSubstep) return;

  activeSubstep.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
}

function getFocusColumnIndex(frame) {
  if (frame.substep === "intersection") return frame.columns.length + 3;

  const pivot = getPivot(frame);
  if (pivot && Number.isInteger(pivot.columnIndex)) return pivot.columnIndex + 2;
  if (Number.isInteger(frame.enteringColumnIndex)) return frame.enteringColumnIndex + 2;
  return null;
}

function scrollTableToFrameFocus(frame) {
  const headerIndex = getFocusColumnIndex(frame);
  if (headerIndex === null) return;

  const table = elements.tableauContainer.querySelector(".simplex-table");
  if (!table) return;

  const headerCells = table.querySelectorAll("thead th");
  const targetHeader = headerCells[headerIndex];
  const baseHeader = headerCells[0];
  const solutionHeader = table.querySelector("th.solution-column");
  if (!targetHeader || !baseHeader || !solutionHeader) return;

  const containerWidth = elements.tableauContainer.clientWidth;
  const stickyLeftWidth = baseHeader.offsetWidth;
  const stickyRightWidth = solutionHeader.offsetWidth;
  const targetLeft = targetHeader.offsetLeft;
  const targetRight = targetLeft + targetHeader.offsetWidth;
  const availableWidth = containerWidth - stickyLeftWidth - stickyRightWidth;
  const targetCenter = targetLeft + (targetRight - targetLeft) / 2;
  const nextScrollLeft = targetCenter - stickyLeftWidth - availableWidth / 2;

  elements.tableauContainer.scrollTo({
    left: Math.max(0, nextScrollLeft),
    behavior: "smooth"
  });
}

function scrollResultTargetIntoView(targetCell) {
  if (!targetCell) return;

  targetCell.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "smooth"
  });

  const table = elements.tableauContainer.querySelector(".simplex-table");
  const baseHeader = table?.querySelector("thead th:first-child");
  const solutionHeader = table?.querySelector("th.solution-column");
  const columnName = targetCell.dataset.tableauColumnName;
  if (!table || !baseHeader || !solutionHeader || !columnName) return;

  const targetHeader = table.querySelector(`thead th[data-tableau-column-name="${getTableSelectorValue(columnName)}"]`);
  if (!targetHeader) return;

  const containerWidth = elements.tableauContainer.clientWidth;
  const stickyLeftWidth = baseHeader.offsetWidth;
  const stickyRightWidth = solutionHeader.offsetWidth;
  const targetLeft = targetHeader.offsetLeft;
  const targetRight = targetLeft + targetHeader.offsetWidth;
  const availableWidth = containerWidth - stickyLeftWidth - stickyRightWidth;
  const targetCenter = targetLeft + (targetRight - targetLeft) / 2;
  const nextScrollLeft = targetCenter - stickyLeftWidth - availableWidth / 2;

  elements.tableauContainer.scrollTo({
    left: Math.max(0, nextScrollLeft),
    behavior: "smooth"
  });
}

function syncScrollPositions(frame) {
  requestAnimationFrame(() => {
    scrollTableToFrameFocus(frame);
    scrollIterationPanelToActiveSubstep();
  });
}

function getTooltipElement() {
  let tooltip = document.querySelector(".app-tooltip");
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.className = "app-tooltip";
  tooltip.setAttribute("role", "tooltip");
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(target, tooltip) {
  const rect = target.getBoundingClientRect();
  tooltip.style.left = "0";
  tooltip.style.top = "0";
  tooltip.classList.add("is-visible");

  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportPadding = 10;
  const top = Math.max(viewportPadding, rect.top - tooltipRect.height - 10);
  const preferredLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(
    Math.max(viewportPadding, preferredLeft),
    window.innerWidth - tooltipRect.width - viewportPadding
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(target) {
  const text = target.dataset.tooltip;
  const label = target.dataset.tooltipLabel;
  if (!text && !label) return;

  activeTooltipTarget = target;
  const tooltip = getTooltipElement();
  tooltip.innerHTML = `
    ${text ? `<div>${escapeHtml(text)}</div>` : ""}
    ${label ? `<div class="app-tooltip-label">${escapeHtml(label)}</div>` : ""}
  `;
  positionTooltip(target, tooltip);
}

function hideTooltip(target) {
  if (target && activeTooltipTarget !== target) return;

  activeTooltipTarget = null;
  const tooltip = document.querySelector(".app-tooltip");
  if (tooltip) {
    tooltip.classList.remove("is-visible");
  }
}

function refreshTooltipPosition() {
  if (!activeTooltipTarget) return;
  positionTooltip(activeTooltipTarget, getTooltipElement());
}

function getTableSelectorValue(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function clearResultHighlight() {
  const table = elements.tableauContainer.querySelector(".simplex-table");
  if (!table) return;

  table.classList.remove("has-result-highlight");
  table
    .querySelectorAll(".is-result-muted, .is-result-highlight, .is-result-context")
    .forEach((item) => item.classList.remove("is-result-muted", "is-result-highlight", "is-result-context"));
}

function getResourceSlackName(resourceName) {
  if (!currentModel) return "";

  const roomIndex = currentModel.rooms?.findIndex((room) => room.name === resourceName) ?? -1;
  if (roomIndex >= 0) {
    return slackName((currentModel.doctors?.length ?? 0) + roomIndex);
  }

  if (getRowLabelKey(resourceName) === getRowLabelKey("Orçamento")) {
    return slackName((currentModel.doctors?.length ?? 0) + (currentModel.rooms?.length ?? 0));
  }

  return "";
}

function getResultHighlightTarget(frame, trigger) {
  const kind = trigger.dataset.resultKind;
  if (kind === "objective") {
    const rowIndex = frame.rows.findIndex((row) => row.base === "Z");
    return { kind, rowIndex };
  }

  if (kind === "variable") {
    const name = trigger.dataset.resultVariable;
    const rowIndex = frame.rows.findIndex((row) => row.base === name);
    const columnIndex = frame.columns.findIndex((column) => column === name);
    return { kind, variableName: name, rowIndex, columnIndex };
  }

  if (kind === "resource") {
    const slackVariable = trigger.dataset.resultSlack;
    const isNonBasicRestriction = slackVariable && !frame.rows.some((row) => row.base === slackVariable);
    if (isNonBasicRestriction) {
      return { kind, columnName: slackVariable, isActiveRestriction: true };
    }

    const labelKey = getRowLabelKey(trigger.dataset.resultResource);
    const rowIndexByBase = frame.rows.findIndex((row) => row.base === slackVariable);
    const rowIndex = rowIndexByBase >= 0
      ? rowIndexByBase
      : frame.rows.findIndex((row) => getRowLabelKey(row.label) === labelKey);
    return { kind, rowIndex, columnName: slackVariable };
  }

  return null;
}

function applyResultHighlight(trigger) {
  const frame = simplexUI.getCurrentFrame();
  const table = elements.tableauContainer.querySelector(".simplex-table");
  if (!frame || !table) return;

  clearResultHighlight();

  const highlight = getResultHighlightTarget(frame, trigger);
  if (!highlight) return;

  const rows = [...table.querySelectorAll("tbody tr")];
  const basicVariables = new Set(frame.rows.map((row) => row.base).filter((base) => base !== "Z"));
  const targetRow = Number.isInteger(highlight.rowIndex) && highlight.rowIndex >= 0 ? rows[highlight.rowIndex] : null;
  const targetColumnName = highlight.variableName || highlight.columnName || "";
  let targetCell = null;

  table.classList.add("has-result-highlight");

  if (targetRow) {
    rows.forEach((row) => row.classList.add("is-result-muted"));
    targetRow.classList.remove("is-result-muted");
    targetRow.classList.add("is-result-context");

    targetRow.querySelectorAll("td[data-tableau-column-name], td.solution-column").forEach((cell) => {
      const columnName = cell.dataset.tableauColumnName;
      const isSolutionCell = cell.classList.contains("solution-column");
      const isObjectiveColumn = columnName === "Z";
      const isTargetColumn = targetColumnName && columnName === targetColumnName;
      const isBasicColumn = columnName && basicVariables.has(columnName);

      cell.classList.remove("is-result-muted");
      cell.classList.add("is-result-context");

      if (!isSolutionCell && !isObjectiveColumn && !isTargetColumn && !isBasicColumn) {
        cell.classList.add("is-result-muted");
        cell.classList.remove("is-result-context");
      }

      if (isSolutionCell) {
        cell.classList.add("is-result-highlight");
      }
    });

    targetCell = targetRow.querySelector(".solution-column");
  } else if (targetColumnName) {
    table.querySelectorAll("tbody td[data-tableau-column-name]").forEach((cell) => {
      const columnName = cell.dataset.tableauColumnName;
      if (columnName === targetColumnName) {
        cell.classList.remove("is-result-muted");
        cell.classList.add("is-result-context");
      } else {
        cell.classList.add("is-result-muted");
      }
    });

    table.querySelectorAll("thead th[data-tableau-column-name]").forEach((cell) => {
      if (cell.dataset.tableauColumnName === targetColumnName) {
        cell.classList.add("is-result-context");
      }
    });

    targetCell = table.querySelector(`tbody td[data-tableau-column-name="${getTableSelectorValue(targetColumnName)}"]`);
    if (typeof showToast === "function") {
      showToast(`A coluna ${targetColumnName} não está na base.`, "info");
    }
  }

  if (targetCell) {
    scrollResultTargetIntoView(targetCell);
  }
}

function bindResultHighlightEvents() {
  elements.resultPanel.querySelectorAll("[data-result-kind]").forEach((item) => {
    item.addEventListener("mouseenter", () => applyResultHighlight(item));
    item.addEventListener("focus", () => applyResultHighlight(item));
    item.addEventListener("mouseleave", clearResultHighlight);
    item.addEventListener("blur", clearResultHighlight);
  });
}

function renderResult(frame) {
  clearResultHighlight();

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
  const basicVariables = new Set(frame.rows.map((row) => row.base).filter((base) => base !== "Z"));
  elements.resultPanel.innerHTML = `
    <p class="result-badge success">Solução ótima encontrada.</p>
    <dl class="result-list">
      <div class="result-item" data-result-kind="objective" tabindex="0">
        <dt>Valor ótimo</dt>
        <dd>${formatNumber(frame.solution.objectiveValue ?? frame.objectiveValue)}</dd>
      </div>
      ${variables
        .map(
          (variable) => `
            <div class="result-item" data-result-kind="variable" data-result-variable="${attr(variable.name)}" ${!basicVariables.has(variable.name) ? `data-tooltip="Variável não básica"` : ""} tabindex="0">
              <dt>${formatVariableLabel(variable.name)}${variable.label ? ` · ${escapeHtml(variable.label)}` : ""}</dt>
              <dd>${formatNumber(variable.value)}</dd>
            </div>
          `
        )
        .join("")}
      ${resources
        .map(
          (resource) => {
            const resourceSlackName = getResourceSlackName(resource.name);
            const isNonBasicRestriction = resourceSlackName && !basicVariables.has(resourceSlackName);
            return `
            <div class="result-item" data-result-kind="resource" data-result-resource="${attr(resource.name)}" data-result-slack="${attr(resourceSlackName)}" ${isNonBasicRestriction ? `data-tooltip="Restrição ativa" data-tooltip-label="${attr(`${plainVariableLabel(resourceSlackName)} não básica; não aparece na Base`)}"` : ""} tabindex="0">
              <dt>${escapeHtml(resource.name)}</dt>
              <dd>${formatNumber(resource.used)} usados · ${formatNumber(resource.remaining)} restantes</dd>
            </div>
          `;
          }
        )
        .join("")}
    </dl>
  `;
  bindResultHighlightEvents();
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
    syncScrollPositions(frame);
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
    currentModel = null;
    renderEmptyState();
    return;
  }

  currentModel = model;
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

document.addEventListener("pointerover", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const tooltipTarget = target.closest("[data-tooltip], [data-tooltip-label]");
  if (tooltipTarget instanceof HTMLElement) {
    showTooltip(tooltipTarget);
  }
});

document.addEventListener("pointerout", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const tooltipTarget = target.closest("[data-tooltip], [data-tooltip-label]");
  if (tooltipTarget instanceof HTMLElement) {
    hideTooltip(tooltipTarget);
  }
});

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.dataset.tooltip || target.dataset.tooltipLabel)) {
    showTooltip(target);
  }
});

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.dataset.tooltip || target.dataset.tooltipLabel)) {
    hideTooltip(target);
  }
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

window.addEventListener("scroll", refreshTooltipPosition, true);
window.addEventListener("resize", refreshTooltipPosition);

window.simplexUI = simplexUI;

init();
