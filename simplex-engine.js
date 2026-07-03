const simplexEpsilon = 1e-9;
const simplexMaxIterations = 100;

function createSimplexIterations(context) {
  const { initialFrame, helpers, model } = context;
  const frames = [helpers.cloneFrame(initialFrame)];
  let currentFrame = helpers.cloneFrame(initialFrame);

  for (let iteration = 1; iteration <= simplexMaxIterations; iteration += 1) {
    currentFrame.iteration = iteration;

    const enteringColumnIndex = chooseEnteringColumn(currentFrame);

    if (enteringColumnIndex === null) {
      const optimalFrame = helpers.cloneFrame(currentFrame);
      optimalFrame.iteration = iteration;
      optimalFrame.substep = "optimal";
      optimalFrame.substepLabel = "Solução Ótima";
      optimalFrame.status = "optimal";
      optimalFrame.message = "Sem coeficientes negativos na linha do objetivo. Solução ótima encontrada";
      optimalFrame.enteringColumnIndex = null;
      optimalFrame.leavingRowIndex = null;
      optimalFrame.pivot = null;
      optimalFrame.objectiveValue = getObjectiveValue(optimalFrame);
      optimalFrame.solution = buildSolution(model, optimalFrame);
      frames.push(optimalFrame);
      return frames;
    }

    currentFrame = helpers.cloneFrame(currentFrame);
    currentFrame.enteringColumnIndex = enteringColumnIndex;
    currentFrame.enteringVariable = currentFrame.columns[enteringColumnIndex];
    currentFrame.substep = "entering";
    currentFrame.substepLabel = "Variável que entra";
    currentFrame.message = `A variável ${currentFrame.enteringVariable} entra na base por ter o menor valor negativo.`;
    currentFrame.objectiveValue = getObjectiveValue(currentFrame);
    frames.push(helpers.cloneFrame(currentFrame));

    currentFrame = helpers.cloneFrame(currentFrame);
    helpers.setIntersectionValues(currentFrame.rows, enteringColumnIndex);
    currentFrame.substep = "intersection";
    currentFrame.substepLabel = "Cálculo de intersecção";
    currentFrame.message = "Calculando as intersecções (solução/(coeficiente da coluna pivô))";
    currentFrame.objectiveValue = getObjectiveValue(currentFrame);
    frames.push(helpers.cloneFrame(currentFrame));

    const leavingRowIndex = chooseLeavingRow(currentFrame, enteringColumnIndex);

    if (leavingRowIndex === null) {
      const unboundedFrame = helpers.cloneFrame(currentFrame);
      unboundedFrame.substep = "unbounded";
      unboundedFrame.substepLabel = "Problema Ilimitado";
      unboundedFrame.status = "unbounded";
      unboundedFrame.message = "Nenhuma restrição limita o crescimento desta variável. O problema é ilimitado.";
      unboundedFrame.enteringColumnIndex = enteringColumnIndex;
      unboundedFrame.leavingRowIndex = null;
      unboundedFrame.pivot = null;
      frames.push(unboundedFrame);
      return frames;
    }

    const pivot = { rowIndex: leavingRowIndex, columnIndex: enteringColumnIndex };
    const leavingVariable = currentFrame.rows[leavingRowIndex].base;

    currentFrame = helpers.cloneFrame(currentFrame);
    currentFrame.leavingRowIndex = leavingRowIndex;
    currentFrame.leavingVariable = leavingVariable;
    currentFrame.pivot = pivot;
    currentFrame.substep = "leaving";
    currentFrame.substepLabel = "Variável que sai";
    currentFrame.message = `A variável ${leavingVariable} sai da base. O elemento pivô foi identificado.`;
    currentFrame.objectiveValue = getObjectiveValue(currentFrame);
    frames.push(helpers.cloneFrame(currentFrame));

    const normalizedFrame = normalizePivotFrame(currentFrame, pivot);
    currentFrame = helpers.cloneFrame(normalizedFrame);
    currentFrame.substep = "pivot_row";
    currentFrame.substepLabel = "Normalizar Linha Pivô";
    currentFrame.message = "Dividindo a linha pivô por seu valor de pivô para ele virar 1.";
    currentFrame.objectiveValue = getObjectiveValue(currentFrame);
    frames.push(helpers.cloneFrame(currentFrame));

    const eliminationFrame = helpers.cloneFrame(currentFrame);
    clearIntersectionValues(eliminationFrame.rows);

    for (let rowIndex = 0; rowIndex < eliminationFrame.rows.length; rowIndex += 1) {
      if (rowIndex === pivot.rowIndex) continue;

      const targetRow = eliminationFrame.rows[rowIndex];
      const factor = targetRow.values[pivot.columnIndex];
      const pivotRow = eliminationFrame.rows[pivot.rowIndex];

      if (Math.abs(factor) < simplexEpsilon) {
        targetRow.values[pivot.columnIndex] = 0;
        continue;
      }

      for (let columnIndex = 0; columnIndex < targetRow.values.length; columnIndex += 1) {
        const newValue = targetRow.values[columnIndex] - factor * pivotRow.values[columnIndex];
        targetRow.values[columnIndex] = cleanNumber(newValue);
      }

      targetRow.rhs = cleanNumber(targetRow.rhs - factor * pivotRow.rhs);

      eliminationFrame.substep = "row_op";
      eliminationFrame.substepLabel = `Linha ${targetRow.base}`;
      eliminationFrame.message = `Subtraindo ${helpers.formatNumber(factor)} × linha ${pivotRow.base} da linha ${targetRow.base}.`;
      eliminationFrame.objectiveValue = getObjectiveValue(eliminationFrame);
      frames.push(helpers.cloneFrame(eliminationFrame));
    }

    currentFrame = helpers.cloneFrame(eliminationFrame);
    currentFrame.rows[leavingRowIndex].base = currentFrame.enteringVariable;
    currentFrame.rows[leavingRowIndex].label = currentFrame.enteringVariable;
    currentFrame.enteringColumnIndex = null;
    currentFrame.leavingRowIndex = null;
    currentFrame.pivot = null;
    currentFrame.substep = "end_iteration";
    currentFrame.substepLabel = "Concluir iteração";
    currentFrame.message = `Iteração ${iteration} concluída. Nova base estabelecida.`;
    currentFrame.objectiveValue = getObjectiveValue(currentFrame);
    frames.push(helpers.cloneFrame(currentFrame));
  }

  const limitFrame = helpers.cloneFrame(currentFrame);
  limitFrame.substep = "limit";
  limitFrame.substepLabel = "Limite de iterações";
  limitFrame.status = "infeasible";
  limitFrame.message = "O limite de iterações foi atingido antes da conclusão.";
  frames.push(limitFrame);
  return frames;
}

function chooseEnteringColumn(frame) {
  const objectiveRow = getObjectiveRow(frame);
  let enteringColumnIndex = null;
  let mostNegativeValue = -simplexEpsilon;

  objectiveRow.values.forEach((value, index) => {
    if (value < mostNegativeValue) {
      mostNegativeValue = value;
      enteringColumnIndex = index;
    }
  });

  return enteringColumnIndex;
}

function chooseLeavingRow(frame, enteringColumnIndex) {
  let leavingRowIndex = null;
  let bestRatio = Infinity;

  frame.rows.forEach((row, rowIndex) => {
    if (row.base === "Z") return;

    const coefficient = row.values[enteringColumnIndex];
    if (coefficient <= simplexEpsilon) return;

    const ratio = row.rhs / coefficient;
    if (ratio < bestRatio - simplexEpsilon) {
      bestRatio = ratio;
      leavingRowIndex = rowIndex;
    }
  });

  return leavingRowIndex;
}

function clearIntersectionValues(rows) {
  rows.forEach((row) => {
    row.intersection = "";
  });
}

function normalizePivotFrame(frame, pivot) {
  const nextFrame = helpersClone(frame);
  const enteringVariable = nextFrame.columns[pivot.columnIndex];
  const pivotRow = nextFrame.rows[pivot.rowIndex];
  const pivotValue = pivotRow.values[pivot.columnIndex];

  pivotRow.values = pivotRow.values.map((value) => cleanNumber(value / pivotValue));
  pivotRow.rhs = cleanNumber(pivotRow.rhs / pivotValue);
  pivotRow.base = enteringVariable;
  pivotRow.label = getVariableLabel(enteringVariable);

  nextFrame.objectiveValue = getObjectiveValue(nextFrame);
  return nextFrame;
}

function getObjectiveRow(frame) {
  return frame.rows.find((row) => row.base === "Z") ?? frame.rows[frame.rows.length - 1];
}

function getObjectiveValue(frame) {
  return cleanNumber(getObjectiveRow(frame).rhs);
}

function getVariableLabel(variableName) {
  const match = String(variableName).match(/^x_(\d+)$/);
  if (!match) return variableName;
  return `M${match[1]}`;
}

function buildSolution(model, frame) {
  if (!model) {
    return {
      objectiveValue: getObjectiveValue(frame),
      variables: [],
      resources: []
    };
  }

  const variableValues = (model.doctors || []).map((doctor, index) => {
    const name = `x_${index + 1}`;
    const row = frame.rows.find((item) => item.base === name);
    return {
      name,
      label: doctor.name,
      value: cleanNumber(row?.rhs ?? 0)
    };
  });

  const costTotal = variableValues.reduce((total, variable, index) => {
    return total + variable.value * ((model.doctors || [])[index]?.costPerHour || 0);
  }, 0);

  const resources = (model.rooms || []).map((room) => {
    const used = variableValues.reduce((total, variable, index) => {
      return (model.doctors || [])[index]?.roomId === room.id ? total + variable.value : total;
    }, 0);

    return {
      name: room.name,
      used: cleanNumber(used),
      remaining: cleanNumber(room.availableHours - used),
      total: room.availableHours
    };
  });

  resources.push({
    name: "Orçamento",
    used: cleanNumber(costTotal),
    remaining: cleanNumber((model.budget || 0) - costTotal),
    total: model.budget || 0
  });

  return {
    objectiveValue: getObjectiveValue(frame),
    variables: variableValues,
    resources
  };
}

function cleanNumber(value) {
  if (Math.abs(value) < simplexEpsilon) return 0;
  return Number(value.toFixed(10));
}

function helpersClone(value) {
  return JSON.parse(JSON.stringify(value));
}