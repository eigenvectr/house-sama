export const IBM_REFERENCE = "IBM Research Albany";
export const BUDGET_REFERENCE = 550000;
export const BUDGET_WARNING_THRESHOLD = 575000;

export const PIPELINE_STAGES = [
  {
    key: "interested",
    label: "Interested",
    description: "New lead. Score it before it blends into the feed.",
    shortLabel: "Lead",
  },
  {
    key: "scheduled",
    label: "Scheduled",
    description: "A showing or open house is locked in.",
    shortLabel: "Tour",
  },
  {
    key: "visited",
    label: "Visited",
    description: "Real-world impressions beat photo optimism.",
    shortLabel: "Seen",
  },
  {
    key: "send-to-dad",
    label: "Send to Dad",
    description: "Finalists worth a financing conversation.",
    shortLabel: "Final",
  },
];

export const SCORE_DIMENSIONS = [
  {
    key: "commute",
    label: "Commute",
    shortLabel: "C",
    weight: 0.3,
  },
  {
    key: "photoCondition",
    label: "Photo / Condition",
    shortLabel: "P",
    weight: 0.25,
  },
  {
    key: "neighborhood",
    label: "Neighborhood",
    shortLabel: "N",
    weight: 0.25,
  },
  {
    key: "priceFit",
    label: "Price Fit",
    shortLabel: "$",
    weight: 0.2,
  },
];

export function normalizeStatus(status) {
  return String(status ?? "active")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function isInactiveStatus(status) {
  return ["pending", "sold", "off-market"].includes(normalizeStatus(status));
}

export function formatStatus(status) {
  return normalizeStatus(status)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function stageMeta(stageKey) {
  return PIPELINE_STAGES.find((stage) => stage.key === stageKey) ?? PIPELINE_STAGES[0];
}

export function nextStage(stageKey) {
  const index = PIPELINE_STAGES.findIndex((stage) => stage.key === stageKey);
  return PIPELINE_STAGES[Math.min(index + 1, PIPELINE_STAGES.length - 1)]?.key ?? PIPELINE_STAGES[0].key;
}

export function getPrimaryStageAction(stageKey) {
  switch (stageKey) {
    case "interested":
      return { label: "Schedule It", target: "scheduled" };
    case "scheduled":
      return { label: "Log Visit", target: "visited" };
    case "visited":
      return { label: "Send to Dad", target: "send-to-dad" };
    default:
      return { label: "Refine Packet", target: "send-to-dad" };
  }
}

export function computeCompositeScore(scores) {
  if (!scores) return null;
  const hasAllDimensions = SCORE_DIMENSIONS.every((dimension) => Number.isFinite(Number(scores[dimension.key])));
  if (!hasAllDimensions) return null;

  const weightedTotal = SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + Number(scores[dimension.key]) * dimension.weight,
    0,
  );

  return Number(weightedTotal.toFixed(2));
}

export function completedDimensions(scores) {
  return SCORE_DIMENSIONS.filter((dimension) => Number.isFinite(Number(scores?.[dimension.key]))).length;
}

export function computePricePerSqft(price, sqft) {
  if (!Number.isFinite(price) || !Number.isFinite(sqft) || sqft <= 0) return null;
  return Math.round(price / sqft);
}

export function isAboveRange(price) {
  return Number.isFinite(price) && price > BUDGET_WARNING_THRESHOLD;
}

export function getCommuteTone(minutes) {
  if (!Number.isFinite(minutes)) return "missing";
  if (minutes <= 25) return "good";
  if (minutes <= 35) return "ok";
  return "slow";
}

export function getScoreTone(value, scale = 5) {
  if (!Number.isFinite(value)) return "muted";
  const normalized = scale === 10 ? value / 2 : value;
  if (normalized >= 4) return "high";
  if (normalized >= 2.5) return "mid";
  return "low";
}

export function formatCurrency(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatInteger(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatMaybeScore(value, digits = 1) {
  if (!Number.isFinite(value)) return "Not scored";
  return Number(value).toFixed(digits);
}

export function formatShortDate(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function relativeTime(value) {
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

export function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function titleCase(text) {
  return String(text ?? "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
