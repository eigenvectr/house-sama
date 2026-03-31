import { renderBoard, renderStageTabs } from "./board.js";
import { renderEditorPanel } from "./card.js";
import { BUILTIN_VIEWS, buildBoardState, mergeListingWithEvaluation } from "./filters.js";
import {
  IBM_REFERENCE,
  PIPELINE_STAGES,
  escapeHtml,
  formatCurrency,
  formatMaybeScore,
  isInactiveStatus,
  nextStage,
  relativeTime,
} from "./scoring.js";
import { cloneView, ensureLocalState, loadLocalState, parseTags, saveLocalState } from "./storage.js";

const DATA_URL = "./data/listings.json";

const state = {
  listings: [],
  updatedAt: null,
  local: ensureLocalState(loadLocalState(), []),
  activeListingId: null,
  draggingId: null,
};

const dom = {
  boardCaption: document.querySelector("#board-caption"),
  boardRoot: document.querySelector("#board-root"),
  controlsForm: document.querySelector("#controls-form"),
  editorBackdrop: document.querySelector("#editor-backdrop"),
  editorCloseButton: document.querySelector("#editor-close-button"),
  editorRoot: document.querySelector("#editor-root"),
  editorShell: document.querySelector("#editor-shell"),
  heroMetrics: document.querySelector("#hero-metrics"),
  saveViewButton: document.querySelector("#save-view-button"),
  savedViews: document.querySelector("#saved-views"),
  searchInput: document.querySelector("#search-input"),
  showInactive: document.querySelector("#show-inactive"),
  sortBy: document.querySelector("#sort-by"),
  stageTabs: document.querySelector("#stage-tabs"),
};

init().catch((error) => {
  console.error(error);
  dom.boardRoot.innerHTML = `<section class="panel empty-state"><h3>Load failed</h3><p>${escapeHtml(error.message)}</p></section>`;
});

async function init() {
  bindEvents();
  await loadListings();
  render();
}

async function loadListings() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load listing data (${response.status})`);
  }

  const payload = await response.json();
  state.updatedAt = payload.updatedAt ?? null;
  state.listings = Array.isArray(payload.listings) ? payload.listings : [];
  state.local = ensureLocalState(state.local, state.listings);
  saveLocalState(state.local);
}

function bindEvents() {
  dom.controlsForm.addEventListener("input", () => {
    state.local.view.search = dom.searchInput.value.trim();
    state.local.view.sortBy = dom.sortBy.value;
    state.local.view.showInactive = dom.showInactive.checked;
    state.local.activeViewKey = null;
    persistAndRender();
  });

  dom.saveViewButton.addEventListener("click", () => {
    const name = window.prompt("Name this view");
    if (!name) return;

    const id = `saved-${Date.now().toString(36)}`;
    state.local.savedViews = [
      ...state.local.savedViews,
      { id, name: name.trim(), view: cloneView(state.local.view) },
    ];
    state.local.activeViewKey = id;
    persistAndRender();
  });

  dom.savedViews.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteView = target.dataset.deleteView;
    if (deleteView) {
      state.local.savedViews = state.local.savedViews.filter((view) => view.id !== deleteView);
      if (state.local.activeViewKey === deleteView) {
        state.local.activeViewKey = null;
      }
      persistAndRender();
      return;
    }

    const viewKey = target.dataset.viewKey;
    if (!viewKey) return;

    const builtin = BUILTIN_VIEWS.find((view) => view.key === viewKey);
    const saved = state.local.savedViews.find((view) => view.id === viewKey);
    const nextView = builtin?.view ?? saved?.view;
    if (!nextView) return;

    state.local.view = { ...state.local.view, ...cloneView(nextView) };
    state.local.activeViewKey = viewKey;
    syncControls();
    persistAndRender();
  });

  dom.stageTabs.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-stage-focus]");
    if (!(button instanceof HTMLElement)) return;

    state.local.view.stageFocus = button.dataset.stageFocus ?? "all";
    state.local.activeViewKey = null;
    persistAndRender();
  });

  dom.boardRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    const listingId = target.dataset.id;

    if (action === "open-editor" && listingId) {
      state.activeListingId = listingId;
      renderEditor();
      return;
    }

    if (action === "advance-stage" && listingId) {
      moveListingToStage(listingId, target.dataset.targetStage ?? nextStage(getEvaluation(listingId).pipelineStage));
    }
  });

  dom.boardRoot.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const card = target.closest("[data-listing-id]");
    if (!(card instanceof HTMLElement)) return;
    state.draggingId = card.dataset.listingId ?? null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.draggingId ?? "");
    }
  });

  dom.boardRoot.addEventListener("dragover", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const zone = target.closest("[data-stage-dropzone]");
    if (!(zone instanceof HTMLElement)) return;
    event.preventDefault();
  });

  dom.boardRoot.addEventListener("drop", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const zone = target.closest("[data-stage-dropzone]");
    if (!(zone instanceof HTMLElement) || !state.draggingId) return;
    event.preventDefault();
    moveListingToStage(state.draggingId, zone.dataset.stageDropzone);
    state.draggingId = null;
  });

  dom.editorCloseButton.addEventListener("click", closeEditor);
  dom.editorBackdrop.addEventListener("click", closeEditor);

  dom.editorRoot.addEventListener("input", handleEditorChange);
  dom.editorRoot.addEventListener("change", handleEditorChange);
}

function handleEditorChange(event) {
  const target = event.target;
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
  ) {
    return;
  }

  const listingId = state.activeListingId;
  if (!listingId) return;

  const evaluation = getEvaluation(listingId);

  if (target.dataset.scoreKey) {
    const numericValue = target.value === "" ? null : Number(target.value);
    evaluation.scores[target.dataset.scoreKey] = Number.isFinite(numericValue) ? numericValue : null;
  } else if (target.dataset.field === "tagsText") {
    evaluation.tags = parseTags(target.value);
  } else if (target.dataset.field) {
    evaluation[target.dataset.field] = normalizeFieldValue(target.dataset.field, target.value);
  }

  if (evaluation.pipelineStage === "send-to-dad" && !evaluation.sentToDadAt) {
    evaluation.sentToDadAt = todayString();
  }

  persistAndRender();
}

function normalizeFieldValue(field, rawValue) {
  if (["commuteMinutes", "fitScoreOverride"].includes(field)) {
    const numericValue = rawValue === "" ? null : Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  return rawValue === "" ? nullIfDateField(field) : rawValue;
}

function nullIfDateField(field) {
  return ["visitDate", "sentToDadAt"].includes(field) ? null : "";
}

function moveListingToStage(listingId, stageKey) {
  const evaluation = getEvaluation(listingId);
  evaluation.pipelineStage = stageKey;
  if (stageKey === "send-to-dad" && !evaluation.sentToDadAt) {
    evaluation.sentToDadAt = todayString();
  }
  persistAndRender();
}

function getEvaluation(listingId) {
  return state.local.evaluations[listingId];
}

function persistAndRender() {
  saveLocalState(state.local);
  render();
}

function render() {
  syncControls();

  const boardState = buildBoardState(state.listings, state.local.evaluations, state.local.view);
  dom.boardCaption.textContent = `${boardState.merged.length} listings in pipeline`;
  dom.stageTabs.innerHTML = renderStageTabs(boardState.stageCounts, state.local.view.stageFocus);
  dom.boardRoot.innerHTML = renderBoard(boardState.columns);

  if (boardState.merged.length === 0) {
    dom.boardRoot.innerHTML = `<section class="panel empty-state"><h3>No houses match this view</h3><p>Widen the search, show dormant listings again, or reset the stage focus.</p></section>`;
  }

  renderSavedViews();
  renderHeroMetrics(boardState.merged, boardState.stageCounts);
  renderEditor();
}

function renderSavedViews() {
  const builtinMarkup = BUILTIN_VIEWS.map(
    (view) => `
      <button class="view-chip ${state.local.activeViewKey === view.key ? "is-active" : ""}" type="button" data-view-key="${view.key}">
        ${escapeHtml(view.name)}
      </button>
    `,
  );

  const savedMarkup = state.local.savedViews.flatMap((view) => [
    `
      <button class="view-chip ${state.local.activeViewKey === view.id ? "is-active" : ""}" type="button" data-view-key="${view.id}">
        ${escapeHtml(view.name)}
      </button>
    `,
    `
      <button class="view-chip view-chip--delete" type="button" data-delete-view="${view.id}">
        x
      </button>
    `,
  ]);

  dom.savedViews.innerHTML = [...builtinMarkup, ...savedMarkup].join("");
}

function renderHeroMetrics(listings, stageCounts) {
  const scoredCount = listings.filter((listing) => Number.isFinite(listing.compositeScore)).length;
  const dadCount = stageCounts["send-to-dad"] ?? 0;
  const aboveRangeCount = listings.filter((listing) => listing.aboveRange).length;
  const fastestCommute = listings
    .map((listing) => listing.commuteMinutes)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];

  const metrics = [
    {
      label: "Tracked homes",
      value: String(listings.length),
      copy: `${listings.filter((listing) => !isInactiveStatus(listing.status)).length} active opportunities still on the board`,
    },
    {
      label: "Scored",
      value: String(scoredCount),
      copy: "Listings with all four fit dimensions completed",
    },
    {
      label: "Budget watch",
      value: String(aboveRangeCount),
      copy: `Homes above the $550k reference band`,
    },
    {
      label: "Fastest commute",
      value: Number.isFinite(fastestCommute) ? `${fastestCommute} min` : "Unset",
      copy: Number.isFinite(fastestCommute) ? `Manual commute input to ${IBM_REFERENCE}` : `Add commute times to compare against ${IBM_REFERENCE}`,
    },
    {
      label: "Finalists",
      value: String(dadCount),
      copy: "Listings already promoted into the dad packet lane",
    },
    {
      label: "Data refresh",
      value: state.updatedAt ? relativeTime(state.updatedAt) : "n/a",
      copy: state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "No refresh timestamp yet",
    },
  ];

  dom.heroMetrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric">
          <span class="metric__label">${escapeHtml(metric.label)}</span>
          <span class="metric__value">${escapeHtml(metric.value)}</span>
          <span class="metric__copy">${escapeHtml(metric.copy)}</span>
        </article>
      `,
    )
    .join("");
}

function renderEditor() {
  const activeListing =
    state.listings
      .map((listing) => mergeListingWithEvaluation(listing, state.local.evaluations[listing.id]))
      .find((listing) => listing.id === state.activeListingId) ?? null;
  dom.editorRoot.innerHTML = renderEditorPanel(activeListing);
  dom.editorShell.dataset.open = activeListing ? "true" : "false";
  dom.editorBackdrop.hidden = !activeListing;
}

function syncControls() {
  dom.searchInput.value = state.local.view.search;
  dom.sortBy.value = state.local.view.sortBy;
  dom.showInactive.checked = state.local.view.showInactive;
}

function closeEditor() {
  state.activeListingId = null;
  renderEditor();
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
