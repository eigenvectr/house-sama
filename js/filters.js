import {
  PIPELINE_STAGES,
  completedDimensions,
  computeCompositeScore,
  computePricePerSqft,
  isAboveRange,
  isInactiveStatus,
} from "./scoring.js";

export const BUILTIN_VIEWS = [
  {
    key: "best-fit",
    name: "Best Fit",
    view: {
      search: "",
      sortBy: "composite",
      showInactive: true,
      stageFocus: "all",
    },
  },
  {
    key: "fast-commute",
    name: "Fast Commute",
    view: {
      search: "",
      sortBy: "commute",
      showInactive: true,
      stageFocus: "all",
    },
  },
  {
    key: "budget-lens",
    name: "Budget Lens",
    view: {
      search: "",
      sortBy: "price-low",
      showInactive: true,
      stageFocus: "all",
    },
  },
  {
    key: "dad-packet",
    name: "Dad Packet",
    view: {
      search: "",
      sortBy: "composite",
      showInactive: true,
      stageFocus: "send-to-dad",
    },
  },
];

export function mergeListingWithEvaluation(listing, evaluation) {
  const compositeScore = computeCompositeScore(evaluation.scores);
  return {
    ...listing,
    ...evaluation,
    inactive: isInactiveStatus(listing.status),
    compositeScore,
    completedScores: completedDimensions(evaluation.scores),
    pricePerSqft: computePricePerSqft(listing.price, listing.sqft),
    aboveRange: isAboveRange(listing.price),
  };
}

export function buildBoardState(listings, evaluations, view) {
  const merged = listings
    .map((listing) => mergeListingWithEvaluation(listing, evaluations[listing.id]))
    .filter((listing) => (view.showInactive ? true : !listing.inactive))
    .filter((listing) => matchesSearch(listing, view.search))
    .sort((left, right) => compareListings(left, right, view.sortBy));

  const stageCounts = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, 0]));
  for (const listing of merged) {
    stageCounts[listing.pipelineStage] += 1;
  }

  const visibleStages =
    view.stageFocus && view.stageFocus !== "all"
      ? PIPELINE_STAGES.filter((stage) => stage.key === view.stageFocus)
      : PIPELINE_STAGES;

  const columns = visibleStages.map((stage) => ({
    ...stage,
    listings: merged.filter((listing) => listing.pipelineStage === stage.key),
  }));

  return {
    merged,
    columns,
    stageCounts,
  };
}

export function compareListings(left, right, sortBy) {
  switch (sortBy) {
    case "gut":
      return compareDescendingNumbers(right.fitScoreOverride, left.fitScoreOverride) || compareDescendingNumbers(right.compositeScore, left.compositeScore);
    case "commute":
      return compareAscendingNumbers(left.commuteMinutes, right.commuteMinutes) || compareDescendingNumbers(right.compositeScore, left.compositeScore);
    case "price-low":
      return compareAscendingNumbers(left.price, right.price) || compareDescendingNumbers(right.compositeScore, left.compositeScore);
    case "price-high":
      return compareDescendingNumbers(right.price, left.price) || compareDescendingNumbers(right.compositeScore, left.compositeScore);
    case "freshness":
      return compareDates(right.refreshedAt, left.refreshedAt) || compareDescendingNumbers(right.compositeScore, left.compositeScore);
    case "composite":
    default:
      return compareDescendingNumbers(right.compositeScore, left.compositeScore) || compareDescendingNumbers(right.fitScoreOverride, left.fitScoreOverride) || compareAscendingNumbers(left.commuteMinutes, right.commuteMinutes);
  }
}

function matchesSearch(listing, query) {
  if (!query) return true;
  const haystack = [
    listing.title,
    listing.street,
    listing.city,
    listing.state,
    listing.status,
    listing.notes,
    listing.visitNotes,
    listing.nextAction,
    listing.summaryForDad,
    ...(listing.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function compareDescendingNumbers(left, right) {
  const safeLeft = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
  const safeRight = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;
  return safeLeft - safeRight;
}

function compareAscendingNumbers(left, right) {
  const safeLeft = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY;
  const safeRight = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY;
  return safeLeft - safeRight;
}

function compareDates(left, right) {
  const safeLeft = left ? new Date(left).getTime() : 0;
  const safeRight = right ? new Date(right).getTime() : 0;
  return safeLeft - safeRight;
}
