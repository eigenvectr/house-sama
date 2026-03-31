import { renderBoard, renderStageTabs } from "./board.js";
import { renderDetailPanel } from "./card.js";
import { BUILTIN_VIEWS, buildBoardState, mergeListingWithEvaluation } from "./filters.js";
import { buildMeasuredColumns, ensurePretextReady, measureDetailLayout } from "./pretext-layout.js";
import {
  IBM_REFERENCE,
  escapeHtml,
  formatMaybeScore,
  isInactiveStatus,
  nextStage,
  relativeTime,
} from "./scoring.js";
import { cloneView, ensureLocalState, loadLocalState, parseTags, saveLocalState } from "./storage.js";

const DATA_URL = "./data/listings.json";
const REFRESH_WORKFLOW_URL =
  "https://github.com/eigenvectr/house-sama/actions/workflows/refresh-listings.yml";

const state = {
  listings: [],
  updatedAt: null,
  local: ensureLocalState(loadLocalState(), []),
  activeListingId: null,
  expandedListingId: null,
  draggingId: null,
  justMovedId: null,
  captureFeedback: "GitHub Pages stays static. New URLs still go through the refresh workflow.",
};

let renderFrame = 0;
let pulseTimer = 0;

const dom = {
  boardCaption: document.querySelector("#board-caption"),
  boardRoot: document.querySelector("#board-root"),
  boardViewport: document.querySelector("#board-viewport"),
  captureFeedback: document.querySelector("#capture-feedback"),
  captureForm: document.querySelector("#capture-form"),
  captureInput: document.querySelector("#capture-input"),
  detailBackdrop: document.querySelector("#detail-backdrop"),
  detailCloseButton: document.querySelector("#detail-close-button"),
  detailRoot: document.querySelector("#detail-root"),
  detailShell: document.querySelector("#detail-shell"),
  heroMetrics: document.querySelector("#hero-metrics"),
  saveViewButton: document.querySelector("#save-view-button"),
  savedViews: document.querySelector("#saved-views"),
  searchInput: document.querySelector("#search-input"),
  showInactive: document.querySelector("#show-inactive"),
  sortBy: document.querySelector("#sort-by"),
  stageTabs: document.querySelector("#stage-tabs"),
  viewToggle: document.querySelector("#view-toggle"),
};

init().catch((error) => {
  console.error(error);
  dom.boardRoot.innerHTML = `<section class="empty-state"><h2>Load failed</h2><p>${escapeHtml(error.message)}</p></section>`;
});

async function init() {
  bindEvents();
  await Promise.all([loadListings(), ensurePretextReady()]);
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
  dom.captureForm.addEventListener("submit", handleCaptureSubmit);
  dom.captureInput.addEventListener("input", () => {
    state.local.captureDraft = dom.captureInput.value;
    saveLocalState(state.local);
  });

  dom.searchInput.addEventListener("input", () => {
    state.local.view.search = dom.searchInput.value.trim();
    state.local.activeViewKey = null;
    persistAndRender();
  });

  dom.sortBy.addEventListener("change", () => {
    state.local.view.sortBy = dom.sortBy.value;
    state.local.activeViewKey = null;
    persistAndRender();
  });

  dom.showInactive.addEventListener("change", () => {
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

    const chip = target.closest("[data-view-key]");
    if (!(chip instanceof HTMLElement)) return;
    const viewKey = chip.dataset.viewKey;
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

  dom.viewToggle.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-view-mode]");
    if (!(button instanceof HTMLElement)) return;

    state.local.viewMode = button.dataset.viewMode ?? "board";
    persistAndRender();
  });

  dom.boardRoot.addEventListener("click", handleBoardAction);
  dom.boardRoot.addEventListener("dblclick", handleBoardDoubleClick);
  dom.boardRoot.addEventListener("input", handleFieldInput);
  dom.boardRoot.addEventListener("change", handleFieldCommit);
  dom.detailRoot.addEventListener("input", handleFieldInput);
  dom.detailRoot.addEventListener("change", handleFieldCommit);
  dom.detailRoot.addEventListener("click", handleBoardAction);

  dom.boardRoot.addEventListener("dragstart", handleDragStart);
  dom.boardRoot.addEventListener("dragend", clearDragState);
  dom.boardRoot.addEventListener("dragover", handleDragOver);
  dom.boardRoot.addEventListener("dragleave", handleDragLeave);
  dom.boardRoot.addEventListener("drop", handleDrop);

  dom.detailCloseButton.addEventListener("click", closeDetail);
  dom.detailBackdrop.addEventListener("click", closeDetail);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", queueRender);
}

function handleCaptureSubmit(event) {
  event.preventDefault();
  const url = dom.captureInput.value.trim();

  if (!url) {
    state.captureFeedback = "Paste a Redfin or redf.in URL first.";
    renderCaptureFeedback();
    return;
  }

  if (!/redf\.in|redfin\.com/i.test(url)) {
    state.captureFeedback = "That does not look like a Redfin listing URL yet.";
    renderCaptureFeedback();
    return;
  }

  state.local.captureDraft = url;
  saveLocalState(state.local);
  state.captureFeedback = "Refresh workflow opened in a new tab. The pasted URL is saved locally in this header.";
  renderCaptureFeedback();
  window.open(REFRESH_WORKFLOW_URL, "_blank", "noopener,noreferrer");
}

function handleBoardAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionElement = target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) return;

  const action = actionElement.dataset.action;
  const listingId = actionElement.dataset.id ?? state.activeListingId;
  if (!listingId) return;

  if (action === "toggle-expand") {
    state.expandedListingId = state.expandedListingId === listingId ? null : listingId;
    render();
    return;
  }

  if (action === "open-detail") {
    state.activeListingId = listingId;
    renderDetail();
    return;
  }

  if (action === "advance-stage") {
    moveListingToStage(listingId, actionElement.dataset.targetStage ?? nextStage(getEvaluation(listingId).pipelineStage));
    return;
  }

  if (action === "clear-score") {
    const scoreKey = actionElement.dataset.scoreKey;
    if (!scoreKey) return;
    getEvaluation(listingId).scores[scoreKey] = null;
    persistAndRender();
  }
}

function handleBoardDoubleClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("input, textarea, select, button, a")) return;

  const card = target.closest("[data-listing-id]");
  if (!(card instanceof HTMLElement)) return;

  state.activeListingId = card.dataset.listingId ?? null;
  renderDetail();
}

function handleFieldInput(event) {
  const target = getEditableTarget(event.target);
  if (!target) return;

  const listingId = target.dataset.id ?? state.activeListingId;
  if (!listingId) return;

  applyFieldMutation(target, listingId);
  saveLocalState(state.local);

  if (target.dataset.scoreKey) {
    updateScoreOutputs(listingId, target.dataset.scoreKey, target.value);
  }
}

function handleFieldCommit(event) {
  const target = getEditableTarget(event.target);
  if (!target) return;

  const listingId = target.dataset.id ?? state.activeListingId;
  if (!listingId) return;

  applyFieldMutation(target, listingId);
  persistAndRender();
}

function handleDragStart(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest("[data-listing-id]");
  if (!(card instanceof HTMLElement)) return;

  state.draggingId = card.dataset.listingId ?? null;
  card.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggingId ?? "");
  }
}

function clearDragState(event) {
  state.draggingId = null;
  document
    .querySelectorAll(".is-dragging, .stage-column--dragover")
    .forEach((node) => node.classList.remove("is-dragging", "stage-column--dragover"));

  if (event?.target instanceof HTMLElement) {
    event.target.closest("[data-listing-id]")?.classList.remove("is-dragging");
  }
}

function handleDragOver(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const zone = target.closest("[data-stage-dropzone]");
  if (!(zone instanceof HTMLElement) || !state.draggingId) return;
  event.preventDefault();
  zone.closest("[data-stage-column]")?.classList.add("stage-column--dragover");
}

function handleDragLeave(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  target.closest("[data-stage-column]")?.classList.remove("stage-column--dragover");
}

function handleDrop(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const zone = target.closest("[data-stage-dropzone]");
  if (!(zone instanceof HTMLElement) || !state.draggingId) return;

  event.preventDefault();
  moveListingToStage(state.draggingId, zone.dataset.stageDropzone);
  clearDragState();
}

function handleKeyDown(event) {
  if (event.key !== "Escape") return;

  if (state.activeListingId) {
    closeDetail();
    return;
  }

  if (state.expandedListingId) {
    state.expandedListingId = null;
    render();
  }
}

function applyFieldMutation(target, listingId) {
  const evaluation = getEvaluation(listingId);

  if (target.dataset.scoreKey) {
    const numericValue = target.value === "" ? null : Number(target.value);
    evaluation.scores[target.dataset.scoreKey] = Number.isFinite(numericValue) ? numericValue : null;
  } else if (target.dataset.field === "tagsText") {
    evaluation.tags = parseTags(target.value);
  } else if (target.dataset.field) {
    evaluation[target.dataset.field] = normalizeFieldValue(target.dataset.field, target.value);
  } else {
    return;
  }

  if (evaluation.pipelineStage === "send-to-dad" && !evaluation.sentToDadAt) {
    evaluation.sentToDadAt = todayString();
  }
}

function normalizeFieldValue(field, rawValue) {
  if (["commuteMinutes", "fitScoreOverride"].includes(field)) {
    const numericValue = rawValue === "" ? null : Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (["visitDate", "sentToDadAt"].includes(field)) {
    return rawValue || null;
  }

  return rawValue ?? "";
}

function moveListingToStage(listingId, stageKey) {
  const evaluation = getEvaluation(listingId);
  evaluation.pipelineStage = stageKey;
  if (stageKey === "send-to-dad" && !evaluation.sentToDadAt) {
    evaluation.sentToDadAt = todayString();
  }

  state.justMovedId = listingId;
  window.clearTimeout(pulseTimer);
  pulseTimer = window.setTimeout(() => {
    state.justMovedId = null;
    render();
  }, 520);

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
  const visibleIds = new Set(boardState.merged.map((listing) => listing.id));
  if (state.expandedListingId && !visibleIds.has(state.expandedListingId)) {
    state.expandedListingId = null;
  }

  const measuredColumns = buildMeasuredColumns(boardState.columns, {
    boardWidth: getBoardViewportWidth(),
    expandedListingId: state.expandedListingId,
    viewMode: state.local.viewMode,
  });

  dom.boardRoot.dataset.viewMode = state.local.viewMode;
  dom.stageTabs.innerHTML = renderStageTabs(boardState.stageCounts, state.local.view.stageFocus);
  dom.boardCaption.textContent = buildBoardCaption(boardState.merged);

  if (boardState.merged.length === 0 && state.local.viewMode !== "map") {
    dom.boardRoot.innerHTML = `<section class="empty-state"><h2>No houses match this lens</h2><p>Widen the search, show pending homes again, or switch back to all stages.</p></section>`;
  } else {
    dom.boardRoot.innerHTML = renderBoard(measuredColumns, {
      expandedListingId: state.expandedListingId,
      justMovedId: state.justMovedId,
      viewMode: state.local.viewMode,
    });
  }

  renderSavedViews();
  renderMetrics(boardState.merged, boardState.stageCounts);
  renderCaptureFeedback();
  renderDetail();
}

function renderSavedViews() {
  const builtin = BUILTIN_VIEWS.map(
    (view) => `
      <button class="view-chip ${state.local.activeViewKey === view.key ? "is-active" : ""}" type="button" data-view-key="${view.key}">
        ${escapeHtml(view.name)}
      </button>
    `,
  );

  const saved = state.local.savedViews.flatMap((view) => [
    `
      <button class="view-chip ${state.local.activeViewKey === view.id ? "is-active" : ""}" type="button" data-view-key="${view.id}">
        ${escapeHtml(view.name)}
      </button>
    `,
    `
      <button class="view-chip view-chip--delete" type="button" data-delete-view="${view.id}">
        Remove
      </button>
    `,
  ]);

  dom.savedViews.innerHTML = [...builtin, ...saved].join("");
}

function renderMetrics(listings, stageCounts) {
  const activeCount = listings.filter((listing) => !isInactiveStatus(listing.status)).length;
  const scoredCount = listings.filter((listing) => Number.isFinite(listing.compositeScore)).length;
  const finalistCount = stageCounts["send-to-dad"] ?? 0;
  const fastestCommute = listings
    .map((listing) => listing.commuteMinutes)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];
  const strongestFit = listings
    .map((listing) => listing.compositeScore)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];

  const metrics = [
    {
      label: "Active pool",
      value: String(activeCount),
      copy: `${listings.length} tracked houses total`,
    },
    {
      label: "Scored",
      value: String(scoredCount),
      copy: "All four fit dimensions completed",
    },
    {
      label: "Fastest commute",
      value: Number.isFinite(fastestCommute) ? `${fastestCommute} min` : "Unset",
      copy: `Drive target: ${IBM_REFERENCE}`,
    },
    {
      label: "Best fit",
      value: Number.isFinite(strongestFit) ? formatMaybeScore(strongestFit) : "--",
      copy: finalistCount ? `${finalistCount} in Send to Dad` : "No finalists promoted yet",
    },
    {
      label: "Refreshed",
      value: state.updatedAt ? relativeTime(state.updatedAt) : "n/a",
      copy: state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "No refresh timestamp",
    },
  ];

  dom.heroMetrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-pill">
          <span class="metric-pill__label">${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <p>${escapeHtml(metric.copy)}</p>
        </article>
      `,
    )
    .join("");
}

function renderCaptureFeedback() {
  dom.captureFeedback.textContent = state.captureFeedback;
}

function renderDetail() {
  const listing =
    state.listings
      .map((item) => mergeListingWithEvaluation(item, state.local.evaluations[item.id]))
      .find((item) => item.id === state.activeListingId) ?? null;

  if (!listing) {
    dom.detailRoot.innerHTML = renderDetailPanel(null);
    dom.detailShell.dataset.open = "false";
    dom.detailBackdrop.hidden = true;
    return;
  }

  const detailed = {
    ...listing,
    detailLayout: measureDetailLayout(listing),
  };

  dom.detailRoot.innerHTML = renderDetailPanel(detailed);
  dom.detailShell.dataset.open = "true";
  dom.detailBackdrop.hidden = false;
}

function syncControls() {
  dom.searchInput.value = state.local.view.search;
  dom.sortBy.value = state.local.view.sortBy;
  dom.showInactive.checked = state.local.view.showInactive;
  dom.captureInput.value = state.local.captureDraft ?? "";

  dom.viewToggle.querySelectorAll("[data-view-mode]").forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle("is-active", button.dataset.viewMode === state.local.viewMode);
  });
}

function closeDetail() {
  state.activeListingId = null;
  renderDetail();
}

function queueRender() {
  window.cancelAnimationFrame(renderFrame);
  renderFrame = window.requestAnimationFrame(() => {
    render();
  });
}

function getBoardViewportWidth() {
  return Math.max(320, Math.floor(dom.boardViewport.clientWidth || window.innerWidth - 32));
}

function buildBoardCaption(listings) {
  if (!listings.length) return "No listings visible";
  const activeCount = listings.filter((listing) => !listing.inactive).length;
  return `${listings.length} visible · ${activeCount} active · sorted by ${state.local.view.sortBy.replace("-", " ")}`;
}

function updateScoreOutputs(listingId, scoreKey, nextValue) {
  const text = nextValue ? String(nextValue) : "Unset";
  document
    .querySelectorAll(`[data-live-score-output="${listingId}--${scoreKey}"]`)
    .forEach((node) => {
      node.textContent = text;
    });
}

function getEditableTarget(target) {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return target;
  }

  return null;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
