const STORAGE_KEY = "house-sama-local-v2";

const DEFAULT_VIEW = {
  search: "",
  sortBy: "composite",
  showInactive: true,
  stageFocus: "all",
};

const DEFAULT_SCORES = {
  commute: null,
  photoCondition: null,
  neighborhood: null,
  priceFit: null,
};

export function loadLocalState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyLocalState();
    const parsed = JSON.parse(raw);
    return {
      evaluations: parsed.evaluations ?? {},
      savedViews: Array.isArray(parsed.savedViews) ? parsed.savedViews : [],
      activeViewKey: parsed.activeViewKey ?? "best-fit",
      view: { ...DEFAULT_VIEW, ...(parsed.view ?? {}) },
      viewMode: parsed.viewMode ?? "board",
      captureDraft: parsed.captureDraft ?? "",
    };
  } catch {
    return createEmptyLocalState();
  }
}

export function saveLocalState(localState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

export function createEmptyLocalState() {
  return {
    evaluations: {},
    savedViews: [],
    activeViewKey: "best-fit",
    view: { ...DEFAULT_VIEW },
    viewMode: "board",
    captureDraft: "",
  };
}

export function ensureLocalState(localState, listings) {
  const nextState = {
    evaluations: { ...(localState?.evaluations ?? {}) },
    savedViews: Array.isArray(localState?.savedViews) ? localState.savedViews : [],
    activeViewKey: localState?.activeViewKey ?? "best-fit",
    view: { ...DEFAULT_VIEW, ...(localState?.view ?? {}) },
    viewMode: localState?.viewMode ?? "board",
    captureDraft: localState?.captureDraft ?? "",
  };

  for (const listing of listings) {
    nextState.evaluations[listing.id] = {
      ...createDefaultEvaluation(listing),
      ...(nextState.evaluations[listing.id] ?? {}),
      scores: {
        ...DEFAULT_SCORES,
        ...(nextState.evaluations[listing.id]?.scores ?? {}),
      },
    };
  }

  return nextState;
}

export function createDefaultEvaluation(listing) {
  return {
    pipelineStage: "interested",
    scores: { ...DEFAULT_SCORES },
    commuteMinutes: Number.isFinite(Number(listing.commuteMinutesHint)) ? Number(listing.commuteMinutesHint) : null,
    fitScoreOverride: null,
    notes: "",
    tags: [],
    visitDate: null,
    visitNotes: "",
    nextAction: "",
    sentToDadAt: null,
    summaryForDad: "",
    dadVerdict: "",
  };
}

export function cloneView(view) {
  return {
    search: view.search,
    sortBy: view.sortBy,
    showInactive: view.showInactive,
    stageFocus: view.stageFocus,
  };
}

export function tagsToText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

export function parseTags(text) {
  return String(text ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
