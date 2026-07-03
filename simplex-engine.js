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
    
    const pivotValueMsg = currentFrame.rows[leavingRowIndex].values[enteringColumnIndex];
    currentFrame.message = `A variável ${currentFrame.leavingVariable} sai da base. O elemento pivô ${pivotValueMsg} foi identificado.`;
    frames.push(helpers.cloneFrame(currentFrame));

    currentFrame = helpers.cloneFrame(currentFrame);
    const activePivotRow = currentFrame.rows[leavingRowIndex];
    const pivotValue = activePivotRow.values[enteringColumnIndex];
    
    for (let j = 0; j < activePivotRow.values.length; j++) {
      activePivotRow.values[j] /= pivotValue;
    }
    activePivotRow.rhs /= pivotValue;
    
    currentFrame.substep = "pivot_row";
    currentFrame.substepLabel = "Normalizar Linha Pivô";
    currentFrame.message = `Dividindo a linha pivô por ${helpers.formatNumber(pivotValue)} para ele virar 1.`;
    frames.push(helpers.cloneFrame(currentFrame));

    for (let i = 0; i < currentFrame.rows.length; i++) {
      if (i === leavingRowIndex) continue;
      
      let factor = currentFrame.rows[i].values[enteringColumnIndex];
      if (factor == 0) continue;

      currentFrame = helpers.cloneFrame(currentFrame);
      const currentActivePivot = currentFrame.rows[leavingRowIndex];
      const activeTargetRow = currentFrame.rows[i];
      
      factor = activeTargetRow.values[enteringColumnIndex];

      for (let j = 0; j < activeTargetRow.values.length; j++) {
        activeTargetRow.values[j] -= factor * currentActivePivot.values[j];
      }
      activeTargetRow.rhs -= factor * currentActivePivot.rhs;
      
      currentFrame.substep = "row_op";
      currentFrame.substepLabel = `Zerar linha ${activeTargetRow.base}`;
      currentFrame.message = `Subtraindo ${helpers.formatNumber(factor)} × linha ${currentActivePivot.base} da linha ${activeTargetRow.base}.`;
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