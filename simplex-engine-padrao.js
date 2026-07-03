const simplexEpsilon = 1e-9;
const simplexMaxIterations = 100;

function createSimplexIterations(context) {
  const frames = [context.initialFrame];
  let currentFrame = context.helpers.cloneFrame(context.initialFrame);

  for (let step = 1; step <= simplexMaxIterations; step += 1) {
    const enteringColumnIndex = chooseEnteringColumn(currentFrame);

    if (enteringColumnIndex === null) {
      frames.push({
        ...currentFrame,
        title: "Solução ótima",
        iteration: step,
        substep: "optimal",
        substepLabel: "Conclusão",
        status: "optimal",
        message: "Todos os coeficientes da linha objetivo são não negativos.",
        enteringColumnIndex: null,
        leavingRowIndex: null,
        pivot: null,
        solution: buildSolution(context.model, currentFrame)
      });
      return frames;
    }

    frames.push({
      ...context.helpers.cloneFrame(currentFrame),
      title: `Iteração ${step}`,
      iteration: step,
      substep: "entering",
      substepLabel: "Escolher entrada",
      status: "running",
      message: `${currentFrame.columns[enteringColumnIndex]} é a variável que entra na base.`,
      enteringColumnIndex,
      leavingRowIndex: null,
      pivot: null
    });

    context.helpers.setIntersectionValues(currentFrame.rows, enteringColumnIndex);
    frames.push({
      ...context.helpers.cloneFrame(currentFrame),
      title: `Iteração ${step}`,
      iteration: step,
      substep: "intersection",
      substepLabel: "Intersecção",
      status: "running",
      message: "Cálculo das intersecções para a coluna de entrada.",
      enteringColumnIndex,
      leavingRowIndex: null,
      pivot: null
    });

    const leavingRowIndex = chooseLeavingRow(currentFrame, enteringColumnIndex);

    if (leavingRowIndex === null) {
      frames.push({
        ...currentFrame,
        title: `Iteração ${step}`,
        iteration: step,
        substep: "unbounded",
        substepLabel: "Conclusão",
        status: "unbounded",
        message: "Não há coeficiente positivo na coluna de entrada. O problema é ilimitado.",
        enteringColumnIndex,
        leavingRowIndex: null,
        pivot: null
      });
      return frames;
    }

    const pivot = { rowIndex: leavingRowIndex, columnIndex: enteringColumnIndex };
    const leavingVariable = currentFrame.rows[leavingRowIndex].base;

    frames.push({
      ...context.helpers.cloneFrame(currentFrame),
      title: `Iteração ${step}`,
      iteration: step,
      substep: "leaving",
      substepLabel: "Escolher saída",
      status: "running",
      message: `${leavingVariable} é a variável que sai da base.`,
      enteringColumnIndex,
      leavingRowIndex,
      leavingVariable,
      pivot
    });

    const normalizedFrame = normalizePivotFrame(currentFrame, pivot);
    frames.push({
      ...context.helpers.cloneFrame(normalizedFrame),
      title: `Iteração ${step}`,
      iteration: step,
      substep: "normalize",
      substepLabel: "Normalizar pivô",
      status: "running",
      message: "Linha pivô normalizada para deixar o elemento pivô igual a 1.",
      enteringColumnIndex,
      leavingRowIndex,
      leavingVariable,
      pivot,
      objectiveValue: getObjectiveValue(normalizedFrame)
    });

    const nextFrame = eliminatePivotColumn(normalizedFrame, pivot);
    clearIntersectionValues(nextFrame.rows);

    frames.push({
      ...context.helpers.cloneFrame(nextFrame),
      title: `Iteração ${step}`,
      iteration: step,
      substep: "row-op",
      substepLabel: "Eliminar coluna",
      status: "running",
      message: "Coluna pivô eliminada nas demais linhas do tableau.",
      enteringColumnIndex,
      leavingRowIndex,
      leavingVariable,
      pivot,
      objectiveValue: getObjectiveValue(nextFrame)
    });

    currentFrame = nextFrame;
  }

  frames.push({
    ...currentFrame,
    title: "Limite de iterações",
    iteration: simplexMaxIterations,
    substep: "limit",
    substepLabel: "Conclusão",
    status: "infeasible",
    message: "O limite de iterações foi atingido antes da conclusão."
  });
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

function clearIntersectionValues(rows) {
  rows.forEach((row) => {
    row.intersection = "";
  });
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

function normalizePivotFrame(frame, pivot) {
  const nextFrame = clone(frame);
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

function eliminatePivotColumn(frame, pivot) {
  const nextFrame = clone(frame);
  const pivotRow = nextFrame.rows[pivot.rowIndex];

  nextFrame.rows.forEach((row, rowIndex) => {
    if (rowIndex === pivot.rowIndex) return;

    const factor = row.values[pivot.columnIndex];
    row.values = row.values.map((value, columnIndex) => cleanNumber(value - factor * pivotRow.values[columnIndex]));
    row.rhs = cleanNumber(row.rhs - factor * pivotRow.rhs);
  });

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
  const variableValues = model.doctors.map((doctor, index) => {
    const name = `x_${index + 1}`;
    const row = frame.rows.find((item) => item.base === name);
    return {
      name,
      label: doctor.name,
      value: cleanNumber(row?.rhs ?? 0)
    };
  });

  const costTotal = variableValues.reduce((total, variable, index) => {
    return total + variable.value * model.doctors[index].costPerHour;
  }, 0);

  const resources = model.rooms.map((room) => {
    const used = variableValues.reduce((total, variable, index) => {
      return model.doctors[index].roomId === room.id ? total + variable.value : total;
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
    remaining: cleanNumber(model.budget - costTotal),
    total: model.budget
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
