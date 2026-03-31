import { layout, prepare, prepareWithSegments, walkLineRanges } from "./vendor/pretext/layout.js";

export const PRETEXT_FONTS = {
  display: '28px "Instrument Serif"',
  price: "30px Inter",
  title: '26px "Instrument Serif"',
  body: "14px Inter",
  meta: "12px Inter",
  bubble: "13px Inter",
  textarea: "14px Inter",
};

const preparedCache = new Map();
const segmentedCache = new Map();

export async function ensurePretextReady() {
  if (!document.fonts?.load) return;

  await Promise.all([
    document.fonts.load(PRETEXT_FONTS.display),
    document.fonts.load(PRETEXT_FONTS.price),
    document.fonts.load(PRETEXT_FONTS.title),
    document.fonts.load(PRETEXT_FONTS.body),
    document.fonts.load(PRETEXT_FONTS.bubble),
  ]);

  await document.fonts.ready;
}

export function buildMeasuredColumns(columns, options) {
  const profile = resolveBoardProfile(options.boardWidth, columns.length, options.viewMode);

  return columns.map((column, index) => {
    const stageWidth = Math.floor(profile.widths[index] ?? profile.widths[0] ?? options.boardWidth);
    const laneCount = resolveLaneCount(column.key, stageWidth, options.viewMode, column.listings.length);
    const laneGap = 18;
    const contentPadding = 22;
    const laneWidth = Math.max(
      248,
      Math.floor((stageWidth - contentPadding * 2 - Math.max(0, laneCount - 1) * laneGap) / laneCount),
    );

    const lanes = Array.from({ length: laneCount }, () => ({ height: 0, listings: [] }));
    const measuredListings = [];

    for (const listing of column.listings) {
      const cardLayout = measureCardLayout(listing, laneWidth, listing.id === options.expandedListingId);
      const measuredListing = {
        ...listing,
        layout: cardLayout,
      };
      const lane = lanes.reduce((best, current) => (current.height < best.height ? current : best), lanes[0]);

      lane.listings.push(measuredListing);
      measuredListings.push(measuredListing);
      lane.height += cardLayout.collapsedHeight + 18;
    }

    return {
      ...column,
      mode: profile.mode,
      stageWidth,
      laneCount,
      laneWidth,
      listings: measuredListings,
      lanes: lanes.map((lane) => lane.listings),
    };
  });
}

export function measureDetailLayout(listing, panelWidth = 404) {
  const contentWidth = Math.max(240, panelWidth - 44);
  return {
    notesHeight: measureTextareaHeight(listing.notes, contentWidth, { minRows: 5 }),
    visitNotesHeight: measureTextareaHeight(listing.visitNotes, contentWidth, { minRows: 5 }),
    summaryHeight: measureTextareaHeight(listing.summaryForDad, contentWidth, { minRows: 5 }),
    dadPreview: measureShrinkwrapBubble(resolveBubbleText(listing), {
      minWidth: 164,
      maxWidth: Math.min(316, contentWidth),
      maxLines: 4,
    }),
  };
}

export function measureTextareaHeight(text, width, options = {}) {
  const lineHeight = options.lineHeight ?? 20;
  const minRows = options.minRows ?? 4;
  const maxRows = options.maxRows ?? 10;
  const content = String(text ?? "").trim() || "Add context worth remembering.";
  const block = measureTextBlock(content, PRETEXT_FONTS.textarea, Math.max(120, width - 28), lineHeight);
  const minHeight = minRows * lineHeight + 28;
  const maxHeight = maxRows * lineHeight + 28;
  return clamp(Math.ceil(block.height + 28), minHeight, maxHeight);
}

export function measureShrinkwrapBubble(text, options = {}) {
  const content = String(text ?? "").trim();
  const font = options.font ?? PRETEXT_FONTS.bubble;
  const lineHeight = options.lineHeight ?? 18;
  const minWidth = Math.max(72, Math.floor(options.minWidth ?? 124));
  const maxWidth = Math.max(minWidth, Math.floor(options.maxWidth ?? 248));
  const maxLines = Math.max(1, options.maxLines ?? 3);

  if (!content) {
    return {
      width: minWidth,
      height: lineHeight * 2,
      lines: 1,
    };
  }

  const prepared = getPreparedWithSegments(content, font);
  let naturalLines = 0;
  walkLineRanges(prepared, maxWidth, () => {
    naturalLines += 1;
  });

  const targetLines = Math.min(Math.max(1, naturalLines), maxLines);
  let lo = minWidth;
  let hi = maxWidth;

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    let lineCount = 0;
    walkLineRanges(prepared, mid, () => {
      lineCount += 1;
    });

    if (lineCount <= targetLines) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const measured = layout(getPrepared(content, font), hi, lineHeight);
  return {
    width: hi,
    height: measured.height,
    lines: measured.lineCount,
  };
}

export function measureTextBlock(text, font, maxWidth, lineHeight) {
  const content = String(text ?? "").trim();
  if (!content) {
    return { height: lineHeight, lines: 1 };
  }

  const measured = layout(getPrepared(content, font), Math.max(64, Math.floor(maxWidth)), lineHeight);
  return {
    height: measured.height,
    lines: measured.lineCount,
  };
}

function measureCardLayout(listing, laneWidth, expanded) {
  const contentWidth = Math.max(196, laneWidth - 40);
  const heroHeight = clamp(Math.round(laneWidth * (expanded ? 0.76 : 0.72)), 188, 324);
  const titleHeight = measureTextBlock(listing.title, PRETEXT_FONTS.title, contentWidth, 32).height;
  const addressHeight = measureTextBlock(
    [listing.city, listing.state].filter(Boolean).join(", "),
    PRETEXT_FONTS.body,
    contentWidth,
    20,
  ).height;
  const statHeight = measureTextBlock(buildStatLine(listing), PRETEXT_FONTS.body, contentWidth, 20).height;
  const noteBubble = measureShrinkwrapBubble(resolveBubbleText(listing), {
    minWidth: Math.min(156, contentWidth),
    maxWidth: Math.min(contentWidth, 268),
    maxLines: listing.pipelineStage === "send-to-dad" ? 4 : 3,
  });
  const notesHeight = measureTextareaHeight(listing.notes, contentWidth, { minRows: 4, maxRows: 7 });

  const collapsedHeight = heroHeight + titleHeight + addressHeight + statHeight + 150;
  const expandedHeight =
    collapsedHeight + 308 + notesHeight + Math.max(38, noteBubble.height) + (listing.pipelineStage === "visited" ? 42 : 0);

  return {
    heroHeight,
    collapsedHeight,
    expandedHeight,
    noteBubbleWidth: noteBubble.width,
    noteBubbleHeight: noteBubble.height,
    notesHeight,
  };
}

function resolveBoardProfile(boardWidth, columnCount, viewMode) {
  const safeWidth = Math.max(320, boardWidth);
  const viewportWidth = window.innerWidth;

  if (viewMode !== "board") {
    return {
      mode: "stacked",
      widths: Array.from({ length: columnCount }, () => safeWidth),
    };
  }

  if (viewportWidth < 768 || columnCount === 1) {
    return {
      mode: "mobile",
      widths: Array.from({ length: columnCount }, () => safeWidth),
    };
  }

  if (viewportWidth < 1200) {
    const stageWidth = clamp(Math.round(safeWidth * 0.78), 340, 520);
    return {
      mode: "tablet",
      widths: Array.from({ length: columnCount }, () => stageWidth),
    };
  }

  const gap = 22;
  const ratios =
    columnCount === 4 ? [1.56, 1.1, 1.04, 0.78] : Array.from({ length: columnCount }, () => 1);
  const ratioTotal = ratios.reduce((sum, ratio) => sum + ratio, 0);
  const availableWidth = safeWidth - gap * Math.max(0, columnCount - 1);

  return {
    mode: "desktop",
    widths: ratios.map((ratio) => Math.floor((availableWidth * ratio) / ratioTotal)),
  };
}

function resolveLaneCount(stageKey, stageWidth, viewMode, itemCount) {
  if (viewMode !== "board" || itemCount < 2) return 1;
  if (stageKey === "interested" && stageWidth >= 520) return 2;
  if (stageKey === "visited" && stageWidth >= 560 && itemCount >= 3) return 2;
  return 1;
}

function getPrepared(text, font) {
  const key = `${font}__${text}`;
  if (!preparedCache.has(key)) {
    preparedCache.set(key, prepare(text, font));
  }
  return preparedCache.get(key);
}

function getPreparedWithSegments(text, font) {
  const key = `${font}__${text}`;
  if (!segmentedCache.has(key)) {
    segmentedCache.set(key, prepareWithSegments(text, font));
  }
  return segmentedCache.get(key);
}

function resolveBubbleText(listing) {
  if (listing.pipelineStage === "send-to-dad") {
    return listing.summaryForDad || listing.notes || "Condense the financing case before it leaves this lane.";
  }
  if (listing.pipelineStage === "visited") {
    return listing.visitNotes || listing.notes || "Capture the in-person reality before the memory gets generous.";
  }
  if (listing.pipelineStage === "scheduled") {
    return listing.nextAction || "Set the checklist before you walk through the front door.";
  }
  return listing.notes || "Score the fit, trust the photos only a little, then decide if this deserves a visit.";
}

function buildStatLine(listing) {
  return [
    Number.isFinite(listing.beds) ? `${listing.beds} bd` : null,
    Number.isFinite(listing.baths) ? `${listing.baths} ba` : null,
    Number.isFinite(listing.sqft) ? `${new Intl.NumberFormat("en-US").format(listing.sqft)} sf` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
