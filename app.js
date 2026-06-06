import { decideEntry, meltIt } from "./decisionEngine.js";

const STORAGE_KEY = "mindmelt.dashboard.v1";

const CATEGORY_META = {
  CALENDAR: { label: "Calendar", icon: "📅", tone: "blue" },
  TASK: { label: "Tasks", icon: "✅", tone: "orange" },
  IDEA: { label: "Ideas", icon: "💡", tone: "orange" },
  RECOMMENDATION: { label: "Recommendations", icon: "⭐", tone: "violet" },
  NOTE: { label: "Notes", icon: "📝", tone: "blue" },
  BRAIN_DUMP: { label: "Brain Dump", icon: "🧠", tone: "red" },
};

const els = {
  form: document.querySelector("#entryForm"),
  input: document.querySelector("#entryInput"),
  focus: document.querySelector("#focusArea"),
  dock: document.querySelector("#dock"),
  meltButton: document.querySelector("#meltButton"),
  micButton: document.querySelector("#micButton"),
  menuButton: document.querySelector("#menuButton"),
  noticeButton: document.querySelector("#noticeButton"),
  status: document.querySelector("#appStatus"),
};

let state = loadState();
let undoSnapshot = null;

init();

function init() {
  renderDock();
  renderIdle();

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleEntry(els.input.value);
  });

  els.meltButton.addEventListener("click", () => {
    const text = els.input.value.trim();
    if (text) {
      handleEntry(text.startsWith("Melt it:") ? text : `Melt it: ${text}`);
    } else {
      renderDemoWidget("Melt It", "Paste or type a messy brain dump, then hit the + button.", [
        "call Dan",
        "buy cat food",
        "schedule dentist",
        "watch documentary",
      ]);
    }
  });

  els.micButton.addEventListener("click", () => {
    renderDemoWidget("Voice capture placeholder", "Voice input is ready for the future build. For now, type anything into the entry bar.", [
      "Capture first",
      "Sort second",
      "No retyping",
    ]);
  });

  els.menuButton.addEventListener("click", () => {
    renderDemoWidget("MindMelt v0 Dashboard", "A flat, dependency-free GitHub prototype wired to the Decision Engine.", [
      "Low clutter",
      "One focus area",
      "ADHD-safe capture",
    ]);
  });

  els.noticeButton.addEventListener("click", () => {
    const brainDumpCount = state.brainDump.length;
    renderDemoWidget("Attention needed", brainDumpCount ? `${brainDumpCount} captured thought${brainDumpCount === 1 ? "" : "s"} need sorting.` : "You're clear. Nothing needs review right now.", [
      "Sort now",
      "Later",
    ]);
  });
}

function handleEntry(rawText) {
  const input = rawText.trim();
  if (!input) {
    renderIdle();
    return;
  }

  undoSnapshot = structuredClone(state);
  const ctx = getContext();
  const shouldMelt = /^melt it\s*:/i.test(input) || input.includes("\n") || input.split(";").length > 2;

  if (shouldMelt) {
    const results = meltIt(input, ctx);
    results.forEach((result) => applyActions(result));
    saveState();
    renderDock();
    renderMeltSummary(results);
  } else {
    const result = decideEntry(input, ctx);
    applyActions(result);
    saveState();
    renderDock();
    renderDecision(result);
  }

  els.input.value = "";
  els.input.focus();
}

function renderDecision(result) {
  const searchAction = result.actions.find((action) => action.type === "SEARCH_MEMORY");
  if (searchAction) {
    const matches = searchMemory(searchAction.query);
    renderSearchResults(result, matches);
    return;
  }

  renderFocusWidget(result.widget, result);
}

function applyActions(result) {
  const inboxAction = result.actions.find((action) => action.type === "SAVE_INBOX");
  if (inboxAction) {
    state.inbox.unshift({ ...inboxAction.inbox, classification: result.classification });
  }

  for (const action of result.actions) {
    switch (action.type) {
      case "CREATE_TASK":
        state.tasks.unshift({ id: makeId("task"), ...action.task });
        break;
      case "CREATE_EVENT":
        state.calendars.unshift({ id: makeId("event"), ...action.event });
        break;
      case "CREATE_RECOMMENDATION":
        state.recommendations.unshift({ id: makeId("rec"), ...action.recommendation });
        break;
      case "CREATE_NOTE":
        state.notes.unshift({ id: makeId("note"), ...action.note });
        break;
      case "CREATE_IDEA":
        state.ideas.unshift({ id: makeId("idea"), ...action.idea });
        break;
      case "MARK_REVIEW":
        state.brainDump.unshift({
          id: makeId("brain"),
          title: result.classification.title || result.inbox.rawText,
          rawText: result.inbox.rawText,
          reason: action.reason,
          createdAt: new Date().toISOString(),
        });
        break;
      default:
        break;
    }
  }
}

function renderFocusWidget(widget, result = null) {
  const toneClass = `tone-${widget.tone.toLowerCase()}`;
  const confidence = result ? `${Math.round(result.classification.confidence * 100)}%` : null;
  const category = result?.classification?.primaryCategory;
  const meta = category ? CATEGORY_META[category] : null;

  els.focus.innerHTML = `
    <div class="focus-card ${toneClass}">
      <div class="focus-icon" aria-hidden="true">${escapeHtml(widget.icon)}</div>
      <div class="eyebrow">${meta ? escapeHtml(meta.label) : escapeHtml(widget.kind.replaceAll("_", " "))}${confidence ? ` · ${confidence} confidence` : ""}</div>
      <h2>${escapeHtml(widget.title)}</h2>
      ${widget.subtitle ? `<p>${escapeHtml(widget.subtitle)}</p>` : ""}
      ${widget.primaryText ? `<div class="primary-text">${escapeHtml(widget.primaryText)}</div>` : ""}
      ${renderItems(widget.items)}
      ${renderChips(widget.chips, result)}
    </div>
  `;
  wireFocusButtons();
  setStatus(widget.title);
}

function renderIdle() {
  els.focus.innerHTML = `
    <div class="focus-card idle-card">
      <div class="spark" aria-hidden="true"></div>
      <h2>Your Mind. Organized.</h2>
      <p>Enter something above and MindMelt will capture it, sort it, or answer from your saved brain.</p>
      <div class="try-row" aria-label="Example entries">
        <button type="button" data-example="Need to buy cat food tomorrow">Need cat food</button>
        <button type="button" data-example="Do I have plans tonight at 5?">Plans tonight?</button>
        <button type="button" data-example="I'm bored">I'm bored</button>
      </div>
    </div>
  `;
  els.focus.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      els.input.value = button.dataset.example;
      handleEntry(button.dataset.example);
    });
  });
  setStatus("Ready");
}

function renderMeltSummary(results) {
  const groups = groupBy(results, (result) => result.classification.primaryCategory);
  const groupHtml = Object.entries(groups)
    .map(([category, items]) => {
      const meta = CATEGORY_META[category] || CATEGORY_META.BRAIN_DUMP;
      return `
        <div class="summary-group">
          <div class="summary-head"><span>${meta.icon}</span><strong>${escapeHtml(meta.label)}</strong><em>${items.length}</em></div>
          <ul>
            ${items.slice(0, 4).map((item) => `<li>${escapeHtml(item.classification.title)}</li>`).join("")}
          </ul>
        </div>
      `;
    })
    .join("");

  els.focus.innerHTML = `
    <div class="focus-card tone-playful">
      <div class="focus-icon" aria-hidden="true">🔥</div>
      <div class="eyebrow">MELT SUMMARY</div>
      <h2>Brain dump sorted.</h2>
      <p>I split the messy entry and routed each piece into the calmest place.</p>
      <div class="summary-grid">${groupHtml}</div>
      <div class="chip-row">
        <button class="chip" type="button" data-undo>Undo</button>
        <button class="chip primary" type="button" data-show="BRAIN_DUMP">Review brain dump</button>
      </div>
    </div>
  `;
  wireFocusButtons();
  setStatus("Brain dump sorted");
}

function renderSearchResults(result, matches) {
  const hasMatches = matches.length > 0;
  const itemsHtml = hasMatches
    ? matches.slice(0, 6).map((item) => `
        <li class="result-item">
          <span>${escapeHtml(item.icon)}</span>
          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></div>
        </li>
      `).join("")
    : `<li class="result-item empty"><span>✨</span><div><strong>No conflicts found.</strong><small>I checked the matching calendar/task window.</small></div></li>`;

  els.focus.innerHTML = `
    <div class="focus-card tone-calm">
      <div class="focus-icon" aria-hidden="true">🔎</div>
      <div class="eyebrow">ASK YOUR BRAIN</div>
      <h2>${hasMatches ? "Here’s what I found." : "Looks clear."}</h2>
      <p>${escapeHtml(result.widget.subtitle || "Searching everything.")}</p>
      <ul class="result-list">${itemsHtml}</ul>
      <div class="chip-row">
        <button class="chip" type="button" data-example="What do I have today?">Today</button>
        <button class="chip" type="button" data-example="Do I have plans tomorrow?">Tomorrow</button>
      </div>
    </div>
  `;
  wireFocusButtons();
  setStatus(hasMatches ? "Search returned results" : "Search found no conflicts");
}

function renderCategoryWidget(category) {
  const meta = CATEGORY_META[category];
  const items = getCategoryItems(category).slice(0, 5);
  const list = items.length
    ? items.map((item) => `<li class="result-item"><span>${meta.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle || "Saved in MindMelt")}</small></div></li>`).join("")
    : `<li class="result-item empty"><span>${meta.icon}</span><div><strong>Nothing here yet.</strong><small>Type anything above and I’ll route it here when it fits.</small></div></li>`;

  els.focus.innerHTML = `
    <div class="focus-card tone-calm">
      <div class="focus-icon" aria-hidden="true">${meta.icon}</div>
      <div class="eyebrow">${escapeHtml(meta.label)}</div>
      <h2>${escapeHtml(meta.label)}</h2>
      <p>Quick view. Tap the entry bar when you want to add or ask anything.</p>
      <ul class="result-list compact">${list}</ul>
    </div>
  `;
  setStatus(`${meta.label} open`);
}

function renderDemoWidget(title, subtitle, chips = []) {
  els.focus.innerHTML = `
    <div class="focus-card tone-calm">
      <div class="focus-icon" aria-hidden="true">✨</div>
      <div class="eyebrow">Prototype</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
      ${renderChips(chips)}
    </div>
  `;
  wireFocusButtons();
  setStatus(title);
}

function renderDock() {
  const counts = getCounts();
  els.dock.innerHTML = Object.entries(CATEGORY_META)
    .map(([category, meta]) => `
      <button class="dock-button ${meta.tone}" type="button" aria-label="Open ${escapeHtml(meta.label)}" title="${escapeHtml(meta.label)}" data-category="${category}">
        <span class="dock-icon">${meta.icon}</span>
        <span class="dock-count">${counts[category]}</span>
        <span class="sr-only">${escapeHtml(meta.label)}</span>
      </button>
    `)
    .join("");

  els.dock.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => renderCategoryWidget(button.dataset.category));
  });
}

function renderItems(items = []) {
  if (!items?.length) return "";
  return `<ul class="result-list">${items.map((item) => `
    <li class="result-item">
      <span>${escapeHtml(item.icon || "•")}</span>
      <div><strong>${escapeHtml(item.title)}</strong>${item.subtitle ? `<small>${escapeHtml(item.subtitle)}</small>` : ""}</div>
      ${item.actionLabel ? `<button type="button">${escapeHtml(item.actionLabel)}</button>` : ""}
    </li>
  `).join("")}</ul>`;
}

function renderChips(chips = [], result = null) {
  if (!chips?.length) return "";
  return `<div class="chip-row">${chips.map((chip, index) => {
    const category = categoryFromChip(chip);
    const undo = chip.toLowerCase() === "undo";
    const attrs = [
      `class="chip ${index === 0 ? "primary" : ""}"`,
      `type="button"`,
      undo ? "data-undo" : "",
      category ? `data-classify="${category}"` : "",
      result ? `data-inbox="${escapeHtml(result.inbox.id)}"` : "",
    ].filter(Boolean).join(" ");
    return `<button ${attrs}>${escapeHtml(chip)}</button>`;
  }).join("")}</div>`;
}

function wireFocusButtons() {
  els.focus.querySelectorAll("[data-undo]").forEach((button) => button.addEventListener("click", undoLast));
  els.focus.querySelectorAll("[data-show]").forEach((button) => button.addEventListener("click", () => renderCategoryWidget(button.dataset.show)));
  els.focus.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => handleEntry(button.dataset.example)));
  els.focus.querySelectorAll("[data-classify]").forEach((button) => {
    button.addEventListener("click", () => manuallyClassifyLast(button.dataset.classify));
  });
}

function categoryFromChip(label) {
  const normalized = label.toLowerCase();
  const match = Object.entries(CATEGORY_META).find(([, meta]) => meta.label.toLowerCase() === normalized || meta.label.toLowerCase().replace(/s$/, "") === normalized);
  return match?.[0] || null;
}

function manuallyClassifyLast(category) {
  const last = state.brainDump[0] || state.inbox[0];
  if (!last) return;
  undoSnapshot = structuredClone(state);

  const title = last.title || last.rawText;
  state.brainDump = state.brainDump.filter((item) => item.id !== last.id);

  switch (category) {
    case "TASK":
      state.tasks.unshift({ id: makeId("task"), title, status: "OPEN", sourceInboxId: last.id, nextStep: "Do the smallest visible first step for two minutes." });
      break;
    case "CALENDAR":
      state.calendars.unshift({ id: makeId("event"), title, start: new Date().toISOString(), calendarType: "PERSONAL", sourceInboxId: last.id });
      break;
    case "RECOMMENDATION":
      state.recommendations.unshift({ id: makeId("rec"), title, kind: "OTHER", sourceInboxId: last.id, status: "SAVED" });
      break;
    case "NOTE":
      state.notes.unshift({ id: makeId("note"), title, body: last.rawText || title, sourceInboxId: last.id });
      break;
    case "IDEA":
      state.ideas.unshift({ id: makeId("idea"), title, body: last.rawText || title, sourceInboxId: last.id });
      break;
    default:
      state.brainDump.unshift(last);
  }

  saveState();
  renderDock();
  renderDemoWidget(`${CATEGORY_META[category]?.label || "Brain Dump"} saved`, title, ["Undo", "Edit"]);
  wireFocusButtons();
}

function undoLast() {
  if (!undoSnapshot) {
    renderDemoWidget("Nothing to undo", "There is no recent save to reverse.", ["Okay"]);
    return;
  }
  state = undoSnapshot;
  undoSnapshot = null;
  saveState();
  renderDock();
  renderDemoWidget("Undone", "The last change was reversed.", ["Okay"]);
}

function searchMemory(query) {
  const scope = query.scope.includes("ALL") ? Object.keys(CATEGORY_META) : query.scope;
  const lower = query.text.toLowerCase();
  const window = query.timeWindow;
  const results = [];

  if (scope.includes("CALENDAR")) {
    state.calendars.forEach((event) => {
      const inWindow = window ? isBetween(event.start, window.start, window.end) : fuzzyMatch(event.title, lower);
      if (inWindow) {
        results.push({ icon: "📅", title: event.title, subtitle: `${formatDateTime(event.start)} · ${event.calendarType.toLowerCase()}` });
      }
    });
  }

  if (scope.includes("TASK")) {
    state.tasks.filter((task) => task.status === "OPEN").forEach((task) => {
      const inWindow = window && task.due ? isBetween(task.due, window.start, window.end) : fuzzyMatch(task.title, lower);
      if (inWindow) {
        results.push({ icon: "✅", title: task.title, subtitle: task.due ? `Due ${formatDateTime(task.due)}` : task.nextStep || "Open task" });
      }
    });
  }

  if (scope.includes("RECOMMENDATION")) {
    state.recommendations.forEach((rec) => {
      if (fuzzyMatch(`${rec.title} ${rec.kind}`, lower)) results.push({ icon: "⭐", title: rec.title, subtitle: rec.kind.toLowerCase() });
    });
  }

  if (scope.includes("NOTE")) {
    state.notes.forEach((note) => {
      if (fuzzyMatch(`${note.title} ${note.body}`, lower)) results.push({ icon: "📝", title: note.title, subtitle: "note" });
    });
  }

  if (scope.includes("IDEA")) {
    state.ideas.forEach((idea) => {
      if (fuzzyMatch(`${idea.title} ${idea.body || ""}`, lower)) results.push({ icon: "💡", title: idea.title, subtitle: "idea" });
    });
  }

  return results.sort((a, b) => a.subtitle.localeCompare(b.subtitle));
}

function getCategoryItems(category) {
  switch (category) {
    case "CALENDAR":
      return state.calendars.map((event) => ({ title: event.title, subtitle: `${formatDateTime(event.start)} · ${event.calendarType.toLowerCase()}` }));
    case "TASK":
      return state.tasks.filter((task) => task.status === "OPEN").map((task) => ({ title: task.title, subtitle: task.due ? `Due ${formatDateTime(task.due)}` : task.nextStep }));
    case "IDEA":
      return state.ideas.map((idea) => ({ title: idea.title, subtitle: idea.body || "Captured idea" }));
    case "RECOMMENDATION":
      return state.recommendations.map((rec) => ({ title: rec.title, subtitle: rec.kind.toLowerCase() }));
    case "NOTE":
      return state.notes.map((note) => ({ title: note.title, subtitle: note.body }));
    case "BRAIN_DUMP":
      return state.brainDump.map((item) => ({ title: item.title, subtitle: item.reason || "Needs review" }));
    default:
      return [];
  }
}

function getCounts() {
  return {
    CALENDAR: state.calendars.length,
    TASK: state.tasks.filter((task) => task.status === "OPEN").length,
    IDEA: state.ideas.length,
    RECOMMENDATION: state.recommendations.length,
    NOTE: state.notes.length,
    BRAIN_DUMP: state.brainDump.length,
  };
}

function getContext() {
  return {
    userId: "demo-user",
    now: new Date(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    preferences: {
      autoCommitThreshold: 0.78,
      reviewThreshold: 0.50,
      defaultCalendar: "PERSONAL",
      lowStimulationMode: false,
      showCountsOnly: true,
      defaultReminderMinutesBefore: [1440, 120, 15],
      quietHours: { startHHmm: "22:00", endHHmm: "07:00" },
    },
    calendars: state.calendars,
    tasks: state.tasks,
    recommendations: state.recommendations,
    notes: state.notes,
    ideas: state.ideas,
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return seedState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedState() {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  return {
    inbox: [],
    brainDump: [
      { id: "brain_seed_1", title: "That thing Dan mentioned", rawText: "Remember that thing Dan mentioned", reason: "Ambiguous note", createdAt: new Date().toISOString() },
      { id: "brain_seed_2", title: "Look into side hustle idea", rawText: "Look into side hustle idea", reason: "Needs review", createdAt: new Date().toISOString() },
    ],
    calendars: [
      { id: "event_seed_1", title: "Production standup", start: atTime(today, 9, 30), calendarType: "WORK" },
      { id: "event_seed_2", title: "Pick up Kieran", start: atTime(today, 17, 0), calendarType: "PERSONAL" },
      { id: "event_seed_3", title: "Gym", start: atTime(tomorrow, 18, 0), calendarType: "PERSONAL" },
    ],
    tasks: [
      { id: "task_seed_1", title: "Reply to emails", status: "OPEN", energy: "LOW", durationMinutes: 10, nextStep: "Open email and write the first sentence." },
      { id: "task_seed_2", title: "Buy cat food", status: "OPEN", energy: "LOW", durationMinutes: 15, nextStep: "Add it to the shopping list or choose where to get it." },
      { id: "task_seed_3", title: "Finish report", status: "OPEN", energy: "HIGH", durationMinutes: 60, nextStep: "Open the report and write one ugly sentence." },
      { id: "task_seed_4", title: "Clean desk for 5 minutes", status: "OPEN", energy: "LOW", durationMinutes: 5, nextStep: "Clear one visible surface." },
    ],
    recommendations: [
      { id: "rec_seed_1", title: "Dune: Part Two", kind: "MOVIE", status: "SAVED" },
      { id: "rec_seed_2", title: "The Marías — Submarine", kind: "ALBUM", status: "SAVED" },
      { id: "rec_seed_3", title: "KazuNori Sushi", kind: "RESTAURANT", status: "SAVED" },
    ],
    notes: [
      { id: "note_seed_1", title: "MindMelt principle", body: "Capture first. Classify second. Ask only when needed." },
      { id: "note_seed_2", title: "Single entry bar", body: "User can type anything and the system decides where it goes." },
    ],
    ideas: [
      { id: "idea_seed_1", title: "Productive boredom killers", body: "Suggest low-friction tasks when the user says they are bored." },
      { id: "idea_seed_2", title: "Focus Area", body: "One large widget that changes based on the entry." },
    ],
  };
}

function atTime(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "No time";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function isBetween(iso, startIso, endIso) {
  const time = new Date(iso).getTime();
  return time >= new Date(startIso).getTime() && time <= new Date(endIso).getTime();
}

function fuzzyMatch(source, query) {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const s = source.toLowerCase();
  if (!q || q.includes("plans") || q.includes("what do i have") || q.includes("anything")) return true;
  return q.split(/\s+/).some((term) => term.length > 2 && s.includes(term));
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message) {
  els.status.textContent = message;
}

window.MindMeltDemo = {
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    state = seedState();
    saveState();
    renderDock();
    renderIdle();
  },
  state: () => structuredClone(state),
};
