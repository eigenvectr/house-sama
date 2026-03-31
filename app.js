const DATA_URL = "./data/listings.json";
const STORAGE_KEY = "house-sama-state-v1";
const INACTIVE_STATUSES = new Set(["pending", "sold", "off-market"]);

const BUILTIN_VIEWS = [
  {
    key: "fresh-feed",
    name: "Fresh feed",
    filters: {
      search: "",
      statusFilter: "all",
      groupBy: "status",
      sortBy: "freshness",
      pinInactive: true,
    },
  },
  {
    key: "actionable",
    name: "Actionable",
    filters: {
      search: "",
      statusFilter: "active",
      groupBy: "bucket",
      sortBy: "fit-high",
      pinInactive: true,
    },
  },
  {
    key: "closed-loop",
    name: "Closed loop",
    filters: {
      search: "",
      statusFilter: "inactive",
      groupBy: "status",
      sortBy: "freshness",
      pinInactive: false,
    },
  },
];

const BUCKETS = [
  { value: "", label: "Unsorted" },
  { value: "shortlist", label: "Shortlist" },
  { value: "tour", label: "Tour soon" },
  { value: "watch", label: "Watchlist" },
  { value: "hold", label: "Hold" },
  { value: "pass", label: "Pass" },
];

const state = {
  listings: [],
  updatedAt: null,
  overlays: {},
  savedViews: [],
  activeViewKey: "fresh-feed",
  filters: {
    search: "",
    statusFilter: "all",
    groupBy: "status",
    sortBy: "freshness",
    pinInactive: true,
  },
};

const dom = {
  boardCount: document.querySelector("#board-count"),
  controlsForm: document.querySelector("#controls-form"),
  groupBy: document.querySelector("#group-by"),
  heroMetrics: document.querySelector("#hero-metrics"),
  listingGroups: document.querySelector("#listing-groups"),
  pinInactive: document.querySelector("#pin-inactive"),
  saveViewButton: document.querySelector("#save-view-button"),
  savedViews: document.querySelector("#saved-views"),
  search: document.querySelector("#search-input"),
  sortBy: document.querySelector("#sort-by"),
  statusFilter: document.querySelector("#status-filter"),
};

init().catch((error) => {
  console.error(error);
  dom.listingGroups.innerHTML = renderEmptyState(
    "Data load failed",
    "The board could not load `data/listings.json`. Check the console and confirm the data file exists.",
  );
});

async function init() {
  bindEvents();
  hydrateLocalState();
  syncControlsFromState();
  await loadListings();
  render();
}

function bindEvents() {
  dom.controlsForm.addEventListener("input", () => {
    state.activeViewKey = null;
    state.filters.search = dom.search.value.trim();
    state.filters.statusFilter = dom.statusFilter.value;
    state.filters.groupBy = dom.groupBy.value;
    state.filters.sortBy = dom.sortBy.value;
    state.filters.pinInactive = dom.pinInactive.checked;
    persistLocalState();
    render();
  });

  dom.saveViewButton.addEventListener("click", () => {
    const name = window.prompt("Name this view");
    if (!name) return;

    const id = `saved-${Date.now().toString(36)}`;
    state.savedViews = [
      ...state.savedViews,
      {
        id,
        name: name.trim(),
        filters: structuredClone(state.filters),
      },
    ];
    state.activeViewKey = id;
    persistLocalState();
    renderSavedViews();
  });

  dom.savedViews.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteId = target.dataset.deleteView;
    if (deleteId) {
      state.savedViews = state.savedViews.filter((view) => view.id !== deleteId);
      if (state.activeViewKey === deleteId) {
        state.activeViewKey = null;
      }
      persistLocalState();
      render();
      return;
    }

    const viewKey = target.dataset.viewKey;
    if (!viewKey) return;

    const builtin = BUILTIN_VIEWS.find((view) => view.key === viewKey);
    const saved = state.savedViews.find((view) => view.id === viewKey);
    const view = builtin ?? saved;
    if (!view) return;

    state.filters = structuredClone(view.filters);
    state.activeViewKey = viewKey;
    syncControlsFromState();
    persistLocalState();
    render();
  });

  dom.listingGroups.addEventListener("input", (event) => {
    updateOverlayFromEvent(event, false);
  });

  dom.listingGroups.addEventListener("change", (event) => {
    updateOverlayFromEvent(event, true);
  });
}

function updateOverlayFromEvent(event, rerender) {
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

  const article = target.closest("[data-listing-id]");
  if (!(article instanceof HTMLElement)) return;

  const listingId = article.dataset.listingId;
  const field = target.dataset.field;
  if (!listingId || !field) return;

  const current = state.overlays[listingId] ?? {};
  const next = { ...current };

  if (field === "fitScore") {
    const numericValue = target.value.trim() === "" ? null : Number(target.value);
    next.fitScore = Number.isFinite(numericValue) ? numericValue : null;
  } else if (field === "tagsText") {
    next.tags = target.value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } else {
    next[field] = target.value;
  }

  state.overlays[listingId] = next;
  persistLocalState();

  if (rerender) {
    render();
  }
}

async function loadListings() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load listing data (${response.status})`);
  }

  const payload = await response.json();
  state.updatedAt = payload.updatedAt ?? null;
  state.listings = (payload.listings ?? []).map(normalizeListing);
}

function hydrateLocalState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    state.overlays = parsed.overlays ?? {};
    state.savedViews = parsed.savedViews ?? [];
    state.filters = { ...state.filters, ...(parsed.filters ?? {}) };
    state.activeViewKey = parsed.activeViewKey ?? state.activeViewKey;
  } catch (error) {
    console.warn("Local state was invalid and has been ignored.", error);
  }
}

function persistLocalState() {
  const payload = {
    overlays: state.overlays,
    savedViews: state.savedViews,
    filters: state.filters,
    activeViewKey: state.activeViewKey,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function syncControlsFromState() {
  dom.search.value = state.filters.search;
  dom.statusFilter.value = state.filters.statusFilter;
  dom.groupBy.value = state.filters.groupBy;
  dom.sortBy.value = state.filters.sortBy;
  dom.pinInactive.checked = Boolean(state.filters.pinInactive);
}

function normalizeListing(listing) {
  return {
    ...listing,
    status: normalizeStatus(listing.status),
    tags: Array.isArray(listing.tags) ? listing.tags : [],
    beds: numberOrNull(listing.beds),
    baths: numberOrNull(listing.baths),
    price: numberOrNull(listing.price),
    sqft: numberOrNull(listing.sqft),
    yearBuilt: numberOrNull(listing.yearBuilt),
  };
}

function render() {
  const mergedListings = state.listings.map(mergeListingWithOverlay);
  renderHeroMetrics(mergedListings);
  renderSavedViews();

  const filtered = applyFilters(mergedListings);
  dom.boardCount.textContent = `${filtered.length} ${filtered.length === 1 ? "listing" : "listings"}`;

  if (filtered.length === 0) {
    dom.listingGroups.innerHTML = renderEmptyState(
      "Nothing matches this view",
      "Try widening the search, removing the status filter, or disabling the inactive pin.",
    );
    return;
  }

  const groups = buildGroups(filtered, state.filters.groupBy);
  dom.listingGroups.innerHTML = groups
    .map(
      (group) => `
        <section class="group">
          <div class="group-head">
            <h3>${escapeHtml(group.label)}</h3>
            <span class="group-meta">${group.listings.length} ${group.listings.length === 1 ? "home" : "homes"}</span>
          </div>
          <div class="group-grid">
            ${group.listings.map(renderCard).join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderHeroMetrics(listings) {
  const activeCount = listings.filter((listing) => !isInactiveStatus(listing.status)).length;
  const inactiveCount = listings.length - activeCount;
  const shortlistCount = listings.filter((listing) => listing.bucket === "shortlist").length;
  const totalValue = listings.reduce((sum, listing) => sum + (listing.price ?? 0), 0);

  const metrics = [
    {
      label: "Inventory",
      value: String(listings.length),
      copy: `${activeCount} actionable, ${inactiveCount} already cooling off`,
    },
    {
      label: "Shortlist",
      value: String(shortlistCount),
      copy: "Homes manually promoted into the top bucket",
    },
    {
      label: "Tracked value",
      value: formatCurrency(totalValue),
      copy: "Combined asking price across the current board",
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
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <span class="metric-value">${escapeHtml(metric.value)}</span>
          <span class="metric-copy">${escapeHtml(metric.copy)}</span>
        </article>
      `,
    )
    .join("");
}

function renderSavedViews() {
  const builtinMarkup = BUILTIN_VIEWS.map(
    (view) => `
      <button
        class="view-chip ${state.activeViewKey === view.key ? "is-active" : ""}"
        type="button"
        data-view-key="${view.key}"
      >
        ${escapeHtml(view.name)}
      </button>
    `,
  );

  const savedMarkup = state.savedViews.flatMap((view) => [
    `
      <button
        class="view-chip ${state.activeViewKey === view.id ? "is-active" : ""}"
        type="button"
        data-view-key="${view.id}"
      >
        ${escapeHtml(view.name)}
      </button>
    `,
    `
      <button
        class="view-chip view-chip--delete"
        type="button"
        title="Delete ${escapeHtml(view.name)}"
        data-delete-view="${view.id}"
      >
        x
      </button>
    `,
  ]);

  dom.savedViews.innerHTML = [...builtinMarkup, ...savedMarkup].join("");
}

function mergeListingWithOverlay(listing) {
  const overlay = state.overlays[listing.id] ?? {};
  return {
    ...listing,
    bucket: overlay.bucket ?? listing.bucket ?? "",
    fitScore: overlay.fitScore ?? listing.fitScore ?? null,
    notes: overlay.notes ?? listing.notes ?? "",
    tags: overlay.tags ?? listing.tags ?? [],
  };
}

function applyFilters(listings) {
  const searchTerm = state.filters.search.toLowerCase();
  return [...listings]
    .filter((listing) => matchesStatusFilter(listing, state.filters.statusFilter))
    .filter((listing) => matchesSearch(listing, searchTerm))
    .sort((left, right) => compareListings(left, right, state.filters.sortBy, state.filters.pinInactive));
}

function buildGroups(listings, groupBy) {
  if (groupBy === "none") {
    return [{ label: "All listings", listings }];
  }

  const buckets = new Map();
  for (const listing of listings) {
    const key = groupKeyForListing(listing, groupBy);
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(listing);
  }

  return [...buckets.entries()]
    .sort(([leftKey], [rightKey]) => compareGroupKeys(leftKey, rightKey, groupBy))
    .map(([key, groupedListings]) => ({
      label: labelForGroupKey(key, groupBy),
      listings: groupedListings,
    }));
}

function compareListings(left, right, sortBy, pinInactive) {
  if (pinInactive) {
    const inactiveDelta = Number(isInactiveStatus(left.status)) - Number(isInactiveStatus(right.status));
    if (inactiveDelta !== 0) return inactiveDelta;
  }

  switch (sortBy) {
    case "fit-high":
      return compareNumber(right.fitScore, left.fitScore) || compareDate(right.refreshedAt, left.refreshedAt);
    case "price-low":
      return compareNumber(left.price, right.price) || compareDate(right.refreshedAt, left.refreshedAt);
    case "price-high":
      return compareNumber(right.price, left.price) || compareDate(right.refreshedAt, left.refreshedAt);
    case "size-high":
      return compareNumber(right.sqft, left.sqft) || compareDate(right.refreshedAt, left.refreshedAt);
    case "freshness":
    default:
      return compareDate(right.refreshedAt, left.refreshedAt) || compareNumber(right.price, left.price);
  }
}

function compareGroupKeys(leftKey, rightKey, groupBy) {
  if (groupBy === "bucket") {
    return bucketRank(leftKey) - bucketRank(rightKey);
  }

  if (groupBy === "status") {
    return statusRank(leftKey) - statusRank(rightKey);
  }

  return leftKey.localeCompare(rightKey);
}

function renderCard(listing) {
  const statusClass = `pill-status-${statusClassSuffix(listing.status)}`;
  const tagsText = listing.tags.join(", ");
  const imageStyle = listing.heroImage
    ? `style="background-image: linear-gradient(180deg, transparent 0%, rgba(21, 23, 27, 0.55) 100%), url('${escapeAttribute(listing.heroImage)}')"`
    : "";

  return `
    <article class="listing-card ${isInactiveStatus(listing.status) ? "listing-card--inactive" : ""}" data-listing-id="${escapeAttribute(listing.id)}">
      <div class="listing-media" ${imageStyle}></div>
      <div class="listing-body">
        <div class="pill-row">
          <span class="pill ${statusClass}">${escapeHtml(formatStatus(listing.status))}</span>
          ${listing.bucket ? `<span class="pill pill-accent">${escapeHtml(labelForBucket(listing.bucket))}</span>` : ""}
          <span class="pill pill-muted">${escapeHtml(relativeTime(listing.refreshedAt))}</span>
        </div>

        <div>
          <h3 class="listing-title">${escapeHtml(listing.title || listing.street || "Untitled listing")}</h3>
          <p class="listing-location">${escapeHtml(formatLocation(listing))}</p>
        </div>

        <div class="fact-grid">
          ${renderFact("Price", formatCurrency(listing.price))}
          ${renderFact("Beds", fallbackValue(listing.beds))}
          ${renderFact("Baths", fallbackValue(listing.baths))}
          ${renderFact("Sq Ft", formatInteger(listing.sqft))}
        </div>

        <p class="listing-description">${escapeHtml(truncateText(listing.description || "No description was scraped for this home.", 260))}</p>

        <div class="field-grid">
          <label class="field">
            <span>Bucket</span>
            <select data-field="bucket">
              ${BUCKETS.map(
                (bucket) => `
                  <option value="${bucket.value}" ${listing.bucket === bucket.value ? "selected" : ""}>
                    ${escapeHtml(bucket.label)}
                  </option>
                `,
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>Fit score</span>
            <input
              data-field="fitScore"
              type="number"
              min="0"
              max="100"
              step="1"
              value="${listing.fitScore ?? ""}"
              placeholder="0-100"
            />
          </label>

          <label class="field field--wide">
            <span>Tags</span>
            <input data-field="tagsText" type="text" value="${escapeAttribute(tagsText)}" placeholder="yard, kitchen, commute" />
          </label>

          <label class="field field--wide">
            <span>Notes</span>
            <textarea data-field="notes" placeholder="Why this one matters, why it does not, or what to verify...">${escapeHtml(listing.notes)}</textarea>
          </label>
        </div>

        <div class="listing-links">
          <a href="${escapeAttribute(listing.canonicalUrl)}" target="_blank" rel="noreferrer">Open listing</a>
          ${
            listing.sourceUrl && listing.sourceUrl !== listing.canonicalUrl
              ? `<a href="${escapeAttribute(listing.sourceUrl)}" target="_blank" rel="noreferrer">Original shared URL</a>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderFact(label, value) {
  return `
    <div class="fact">
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderEmptyState(title, copy) {
  return `
    <section class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </section>
  `;
}

function groupKeyForListing(listing, groupBy) {
  switch (groupBy) {
    case "bucket":
      return listing.bucket || "unsorted";
    case "city":
      return formatCityGroup(listing);
    case "status":
    default:
      return normalizeStatus(listing.status);
  }
}

function labelForGroupKey(key, groupBy) {
  if (groupBy === "bucket") {
    return labelForBucket(key);
  }

  if (groupBy === "city") {
    return key;
  }

  return formatStatus(key);
}

function labelForBucket(bucket) {
  return BUCKETS.find((option) => option.value === bucket)?.label ?? "Unsorted";
}

function bucketRank(bucket) {
  const rank = ["shortlist", "tour", "watch", "hold", "unsorted", "pass"].indexOf(bucket);
  return rank === -1 ? 999 : rank;
}

function statusRank(status) {
  const rank = ["active", "coming-soon", "pending", "sold", "off-market"].indexOf(status);
  return rank === -1 ? 999 : rank;
}

function matchesStatusFilter(listing, statusFilter) {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return !isInactiveStatus(listing.status);
  if (statusFilter === "inactive") return isInactiveStatus(listing.status);
  return normalizeStatus(listing.status) === statusFilter;
}

function matchesSearch(listing, searchTerm) {
  if (!searchTerm) return true;
  const haystack = [
    listing.title,
    listing.street,
    listing.city,
    listing.state,
    listing.zip,
    listing.status,
    listing.propertyType,
    listing.notes,
    ...(listing.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchTerm);
}

function isInactiveStatus(status) {
  return INACTIVE_STATUSES.has(normalizeStatus(status));
}

function normalizeStatus(status) {
  return String(status ?? "active")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function formatStatus(status) {
  return normalizeStatus(status)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClassSuffix(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "pending") return "pending";
  if (normalized === "sold") return "sold";
  if (normalized === "off-market") return "off-market";
  return "active";
}

function formatLocation(listing) {
  return [listing.street, [listing.city, listing.state].filter(Boolean).join(", "), listing.zip]
    .filter(Boolean)
    .join(" ");
}

function formatCityGroup(listing) {
  const cityState = [listing.city, listing.state].filter(Boolean).join(", ");
  return cityState || "Unknown location";
}

function fallbackValue(value) {
  if (value == null) return "n/a";
  return String(value);
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function compareNumber(left, right) {
  const safeLeft = left ?? Number.NEGATIVE_INFINITY;
  const safeRight = right ?? Number.NEGATIVE_INFINITY;
  return safeLeft - safeRight;
}

function compareDate(left, right) {
  const leftValue = left ? new Date(left).getTime() : 0;
  const rightValue = right ? new Date(right).getTime() : 0;
  return leftValue - rightValue;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function relativeTime(value) {
  if (!value) return "n/a";
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "n/a";

  const seconds = Math.round((target - Date.now()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(days) >= 1) return formatter.format(days, "day");
  if (Math.abs(hours) >= 1) return formatter.format(hours, "hour");
  if (Math.abs(minutes) >= 1) return formatter.format(minutes, "minute");
  return formatter.format(seconds, "second");
}

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
