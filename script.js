const exampleState = {
  budget: 1400,
  rooms: [
    { id: 1, name: "Consultório 1", availableHours: 8 },
    { id: 2, name: "Consultório 2", availableHours: 8 }
  ],
  doctors: [
    {
      id: 1,
      name: "M1",
      patientsPerHour: 4,
      costPerHour: 100,
      maxHours: 6,
      roomId: 1
    },
    {
      id: 2,
      name: "M2",
      patientsPerHour: 5,
      costPerHour: 150,
      maxHours: 5,
      roomId: 1
    },
    {
      id: 3,
      name: "M3",
      patientsPerHour: 3,
      costPerHour: 80,
      maxHours: 8,
      roomId: 2
    }
  ]
};

const elements = {
  budget: document.querySelector("#budget"),
  budgetError: document.querySelector("#budgetError"),
  roomsTable: document.querySelector("#roomsTable"),
  doctorsTable: document.querySelector("#doctorsTable"),
  addRoomButton: document.querySelector("#addRoomButton"),
  addDoctorButton: document.querySelector("#addDoctorButton"),
  loadExampleButton: document.querySelector("#loadExampleButton"),
  clearButton: document.querySelector("#clearButton"),
  objectivePreview: document.querySelector("#objectivePreview"),
  constraintsPreview: document.querySelector("#constraintsPreview"),
  jsonPreview: document.querySelector("#jsonPreview"),
  copyJsonButton: document.querySelector("#copyJsonButton"),
  downloadJsonButton: document.querySelector("#downloadJsonButton"),
  copyStatus: document.querySelector("#copyStatus")
};

const state = clone(exampleState);

let nextRoomNumber = 3;
let nextDoctorNumber = 4;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setState(nextState) {
  state.budget = nextState.budget;
  state.rooms = clone(nextState.rooms);
  state.doctors = clone(nextState.doctors);
  nextRoomNumber = getNextNumber(state.rooms);
  nextDoctorNumber = getNextNumber(state.doctors);
  render();
}

function getNextNumber(items) {
  const max = items.reduce((highest, item) => {
    const number = Number(item.id);
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return max + 1;
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 2
  });
}

function variableName(index) {
  return `x_${index + 1}`;
}

function updateBudget(value) {
  state.budget = value;
  render();
}

function updateRoom(id, field, value) {
  const numericId = Number(id);
  const room = state.rooms.find((item) => Number(item.id) === numericId);
  if (!room) return;

  room[field] = value;
  render();
}

function updateDoctor(id, field, value) {
  const numericId = Number(id);
  const doctor = state.doctors.find((item) => Number(item.id) === numericId);
  if (!doctor) return;

  doctor[field] = field === "roomId" ? (value === "" ? null : Number(value)) : value;
  render();
}

function addRoom() {
  const id = nextRoomNumber;
  nextRoomNumber += 1;
  state.rooms.push({
    id,
    name: `Consultório ${state.rooms.length + 1}`,
    availableHours: 8
  });
  render();
}

function removeRoom(id) {
  const numericId = Number(id);
  state.rooms = state.rooms.filter((room) => Number(room.id) !== numericId);
  const defaultRoomId = state.rooms[0]?.id ?? null;
  state.doctors = state.doctors.map((doctor) => ({
    ...doctor,
    roomId: Number(doctor.roomId) === numericId ? defaultRoomId : doctor.roomId
  }));
  render();
}

function addDoctor() {
  const id = nextDoctorNumber;
  nextDoctorNumber += 1;
  state.doctors.push({
    id,
    name: `M${state.doctors.length + 1}`,
    patientsPerHour: 0,
    costPerHour: 0,
    maxHours: 0,
    roomId: state.rooms[0]?.id ?? null
  });
  render();
}

function removeDoctor(id) {
  const numericId = Number(id);
  state.doctors = state.doctors.filter((doctor) => Number(doctor.id) !== numericId);
  render();
}

function clearState() {
  setState({
    budget: "",
    rooms: [],
    doctors: []
  });
}

function validate() {
  const fieldErrors = {
    budget: "",
    rooms: {},
    doctors: {}
  };
  const summary = [];

  const budget = parseNumber(state.budget);
  if (budget === null || budget <= 0) {
    fieldErrors.budget = "Informe um orçamento maior que zero.";
    summary.push("O orçamento diário deve ser maior que zero.");
  }

  if (state.rooms.length === 0) {
    summary.push("Cadastre pelo menos um consultório.");
  }

  state.rooms.forEach((room, index) => {
    const errors = {};
    if (!room.name.trim()) {
      errors.name = "Informe o nome.";
      summary.push(`Consultório ${index + 1}: informe o nome.`);
    }

    const availableHours = parseNumber(room.availableHours);
    if (availableHours === null || availableHours < 0) {
      errors.availableHours = "Use valor maior ou igual a zero.";
      summary.push(`${room.name || `Consultório ${index + 1}`}: horas disponíveis inválidas.`);
    }

    if (Object.keys(errors).length > 0) {
      fieldErrors.rooms[room.id] = errors;
    }
  });

  if (state.doctors.length === 0) {
    summary.push("Cadastre pelo menos um médico.");
  }

  const roomIds = new Set(state.rooms.map((room) => room.id));
  state.doctors.forEach((doctor, index) => {
    const errors = {};
    if (!doctor.name.trim()) {
      errors.name = "Informe o nome.";
      summary.push(`Médico ${index + 1}: informe o nome.`);
    }

    ["patientsPerHour", "costPerHour", "maxHours"].forEach((field) => {
      const value = parseNumber(doctor[field]);
      if (value === null || value < 0) {
        errors[field] = "Use valor maior ou igual a zero.";
      }
    });

    if (errors.patientsPerHour) {
      summary.push(`${doctor.name || `Médico ${index + 1}`}: pacientes por hora inválido.`);
    }
    if (errors.costPerHour) {
      summary.push(`${doctor.name || `Médico ${index + 1}`}: custo por hora inválido.`);
    }
    if (errors.maxHours) {
      summary.push(`${doctor.name || `Médico ${index + 1}`}: máximo de horas inválido.`);
    }

    if (doctor.roomId == null || !roomIds.has(doctor.roomId)) {
      errors.roomId = "Selecione um consultório existente.";
      summary.push(`${doctor.name || `Médico ${index + 1}`}: selecione um consultório existente.`);
    }

    if (Object.keys(errors).length > 0) {
      fieldErrors.doctors[doctor.id] = errors;
    }
  });

  return {
    isValid: summary.length === 0,
    fieldErrors,
    summary
  };
}

function getValidModel() {
  return {
    budget: parseNumber(state.budget),
    rooms: state.rooms.map((room) => ({
      id: room.id,
      name: room.name.trim(),
      availableHours: parseNumber(room.availableHours)
    })),
    doctors: state.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name.trim(),
      patientsPerHour: parseNumber(doctor.patientsPerHour),
      costPerHour: parseNumber(doctor.costPerHour),
      maxHours: parseNumber(doctor.maxHours),
      roomId: doctor.roomId
    }))
  };
}

function render() {
  const focusContext = getFocusContext();
  const validation = validate();
  renderBudget(validation);
  renderRooms(validation);
  renderDoctors(validation);
  renderModelPreview(validation);
  elements.copyStatus.textContent = "";
  restoreFocus(focusContext);
}

function renderBudget(validation) {
  elements.budget.value = state.budget;
  const error = validation.fieldErrors.budget;
  elements.budget.classList.toggle("is-invalid", Boolean(error));
  elements.budgetError.textContent = error;
}

function renderRooms(validation) {
  if (state.rooms.length === 0) {
    elements.roomsTable.innerHTML = `<tr><td class="empty-row" colspan="3">Nenhum consultório cadastrado.</td></tr>`;
    return;
  }

  elements.roomsTable.innerHTML = state.rooms
    .map((room) => {
      const errors = validation.fieldErrors.rooms[room.id] ?? {};
      return `
        <tr>
          <td class="field-control string-field" data-label="Nome">
            <input
              aria-label="Nome do consultório"
              class="${errors.name ? "is-invalid" : ""}"
              data-type="room"
              data-id="${room.id}"
              data-field="name"
              value="${escapeHtml(room.name)}"
            >
            <p class="field-error">${errors.name ?? ""}</p>
          </td>
          <td class="field-control" data-label="Horas disponíveis">
            <input
              aria-label="Horas disponíveis"
              class="${errors.availableHours ? "is-invalid" : ""}"
              data-type="room"
              data-id="${room.id}"
              data-field="availableHours"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              value="${escapeHtml(room.availableHours)}"
            >
            <p class="field-error">${errors.availableHours ?? ""}</p>
          </td>
          <td class="action-column" data-label="Ação">
            <button class="danger-button icon-button" type="button" aria-label="Remover consultório" data-action="remove-room" data-id="${room.id}">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDoctors(validation) {
  if (state.doctors.length === 0) {
    elements.doctorsTable.innerHTML = `<tr><td class="empty-row" colspan="6">Nenhum médico cadastrado.</td></tr>`;
    return;
  }

  elements.doctorsTable.innerHTML = state.doctors
    .map((doctor) => {
      const errors = validation.fieldErrors.doctors[doctor.id] ?? {};
      const roomOptions = state.rooms.length
        ? state.rooms
            .map(
              (room) =>
                `<option value="${room.id}" ${room.id === doctor.roomId ? "selected" : ""}>${escapeHtml(room.name || room.id)}</option>`
            )
            .join("")
        : `<option value="" disabled selected>Sem consultórios</option>`;

      return `
        <tr>
          <td class="field-control string-field" data-label="Nome">
            <input
              aria-label="Nome do médico"
              class="${errors.name ? "is-invalid" : ""}"
              data-type="doctor"
              data-id="${doctor.id}"
              data-field="name"
              value="${escapeHtml(doctor.name)}"
            >
            <p class="field-error">${errors.name ?? ""}</p>
          </td>
          <td class="field-control" data-label="Pacientes/h">
            ${renderDoctorNumberInput(doctor, "patientsPerHour", errors, doctor.id)}
          </td>
          <td class="field-control" data-label="Custo/h">
            ${renderDoctorNumberInput(doctor, "costPerHour", errors, doctor.id)}
          </td>
          <td class="field-control" data-label="Máx. horas">
            ${renderDoctorNumberInput(doctor, "maxHours", errors, doctor.id)}
          </td>
          <td class="field-control stacked-field" data-label="Consultório">
            <select
              aria-label="Consultório do médico"
              class="${errors.roomId ? "is-invalid" : ""}"
              data-type="doctor"
              data-id="${doctor.id}"
              data-field="roomId"
              ${state.rooms.length === 0 ? "disabled" : ""}
            >
              ${roomOptions}
            </select>
            <p class="field-error">${errors.roomId ?? ""}</p>
          </td>
          <td class="action-column" data-label="Ação">
            <button class="danger-button icon-button" type="button" aria-label="Remover médico" data-action="remove-doctor" data-id="${doctor.id}">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDoctorNumberInput(doctor, field, errors) {
  const labels = {
    patientsPerHour: "Pacientes por hora",
    costPerHour: "Custo por hora",
    maxHours: "Máximo de horas"
  };

  return `
    <input
      aria-label="${labels[field]}"
      class="${errors[field] ? "is-invalid" : ""}"
      data-type="doctor"
      data-id="${doctor.id}"
      data-field="${field}"
      type="number"
      min="0"
      step="0.01"
      inputmode="decimal"
      value="${escapeHtml(doctor[field])}"
    >
    <p class="field-error">${errors[field] ?? ""}</p>
  `;
}

function renderModelPreview(validation) {
  elements.copyJsonButton.disabled = !validation.isValid;
  elements.downloadJsonButton.disabled = !validation.isValid;

  if (!validation.isValid) {
    elements.objectivePreview.textContent = "Preencha os campos obrigatórios para montar a função objetivo.";
    elements.constraintsPreview.textContent = "Preencha os campos obrigatórios para montar as restrições.";
    elements.jsonPreview.textContent = "JSON indisponível enquanto houver erros de validação.";
    return;
  }

  const model = getValidModel();
  elements.objectivePreview.textContent = buildObjective(model);
  elements.constraintsPreview.textContent = buildConstraints(model);
  elements.jsonPreview.textContent = JSON.stringify(model, null, 2);
}

function buildObjective(model) {
  const terms = model.doctors.map((doctor, index) => `${formatNumber(doctor.patientsPerHour)}*${variableName(index)}`);
  return `max Z = ${terms.join(" + ")}`;
}

function buildConstraints(model) {
  const lines = [];

  model.doctors.forEach((doctor, index) => {
    lines.push(`${variableName(index)} <= ${formatNumber(doctor.maxHours)}    (${doctor.name})`);
  });

  model.rooms.forEach((room) => {
    const roomTerms = model.doctors
      .map((doctor, index) => (doctor.roomId === room.id ? variableName(index) : null))
      .filter(Boolean);
    const leftSide = roomTerms.length > 0 ? roomTerms.join(" + ") : "0";
    lines.push(`${leftSide} <= ${formatNumber(room.availableHours)}    (${room.name})`);
  });

  const budgetTerms = model.doctors.map((doctor, index) => `${formatNumber(doctor.costPerHour)}*${variableName(index)}`);
  lines.push(`${budgetTerms.join(" + ")} <= ${formatNumber(model.budget)}    (orçamento)`);
  lines.push(model.doctors.map((_, index) => `${variableName(index)} >= 0`).join(", "));

  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFocusContext() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLSelectElement)) {
    return null;
  }

  if (activeElement.id === "budget") {
    return {
      selector: "#budget",
      start: activeElement.selectionStart,
      end: activeElement.selectionEnd
    };
  }

  if (!activeElement.dataset.type || !activeElement.dataset.id || !activeElement.dataset.field) {
    return null;
  }

  return {
    selector: `[data-type="${activeElement.dataset.type}"][data-id="${activeElement.dataset.id}"][data-field="${activeElement.dataset.field}"]`,
    start: activeElement.selectionStart,
    end: activeElement.selectionEnd
  };
}

function restoreFocus(context) {
  if (!context) return;

  const element = document.querySelector(context.selector);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
    return;
  }

  element.focus();

  if (element instanceof HTMLInputElement && element.type !== "number" && context.start !== null && context.end !== null) {
    element.setSelectionRange(context.start, context.end);
  }
}

async function copyJson() {
  const validation = validate();
  if (!validation.isValid) {
    showValidationErrors(validation);
    return;
  }

  const json = JSON.stringify(getValidModel(), null, 2);

  try {
    await navigator.clipboard.writeText(json);
    showToast("JSON copiado.", "success");
  } catch (error) {
    showToast("Não foi possível copiar automaticamente.", "error");
  }
}

function downloadJson() {
  const validation = validate();
  if (!validation.isValid) {
    showValidationErrors(validation);
    return;
  }

  const json = JSON.stringify(getValidModel(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "simplex-dados.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("JSON exportado.", "success");
}

function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 6000);
}

function showValidationErrors(validation) {
  if (validation.isValid) return;

  const firstInvalid = document.querySelector(".is-invalid");
  if (firstInvalid instanceof HTMLElement) {
    const fieldControl = firstInvalid.closest(".field-control");
    firstInvalid.focus();

    if (fieldControl) {
      fieldControl.classList.add("show-error");
      setTimeout(() => fieldControl.classList.remove("show-error"), 4500);
    }
    return;
  }

  if (validation.summary.length > 0) {
    showToast(validation.summary[0], "error");
  }
}

elements.budget.addEventListener("input", (event) => {
  updateBudget(event.target.value);
});

elements.roomsTable.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.type !== "room") return;
  updateRoom(target.dataset.id, target.dataset.field, target.value);
});

elements.doctorsTable.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.type !== "doctor") return;
  updateDoctor(target.dataset.id, target.dataset.field, target.value);
});

elements.doctorsTable.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.dataset.type !== "doctor") return;
  updateDoctor(target.dataset.id, target.dataset.field, target.value);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const actionButton = target.closest("button[data-action]");
  if (!(actionButton instanceof HTMLButtonElement)) return;

  const action = actionButton.dataset.action;
  if (action === "remove-room") {
    removeRoom(actionButton.dataset.id);
  }
  if (action === "remove-doctor") {
    removeDoctor(actionButton.dataset.id);
  }
});

elements.addRoomButton.addEventListener("click", addRoom);
elements.addDoctorButton.addEventListener("click", addDoctor);
elements.loadExampleButton.addEventListener("click", () => setState(exampleState));
elements.clearButton.addEventListener("click", clearState);
elements.copyJsonButton.addEventListener("click", copyJson);
elements.downloadJsonButton.addEventListener("click", downloadJson);

render();
