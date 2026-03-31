import { PIPELINE_STAGES, escapeHtml } from "./scoring.js";
import { renderListingCard } from "./card.js";

export function renderStageTabs(stageCounts, stageFocus) {
  const allCount = Object.values(stageCounts).reduce((sum, count) => sum + count, 0);
  return `
    <button class="stage-tab ${stageFocus === "all" ? "is-active" : ""}" type="button" data-stage-focus="all">
      All stages <span>${allCount}</span>
    </button>
    ${PIPELINE_STAGES.map(
      (stage) => `
        <button class="stage-tab ${stageFocus === stage.key ? "is-active" : ""}" type="button" data-stage-focus="${stage.key}">
          ${escapeHtml(stage.label)} <span>${stageCounts[stage.key] ?? 0}</span>
        </button>
      `,
    ).join("")}
  `;
}

export function renderBoard(columns) {
  return columns
    .map(
      (column) => `
        <section class="stage-column stage-column--${column.key}">
          <header class="stage-column__head">
            <div>
              <p class="eyebrow">${escapeHtml(column.shortLabel)}</p>
              <h3>${escapeHtml(column.label)}</h3>
            </div>
            <p>${column.listings.length} ${column.listings.length === 1 ? "house" : "houses"}</p>
          </header>
          <p class="stage-column__copy">${escapeHtml(column.description)}</p>
          <div class="stage-dropzone" data-stage-dropzone="${column.key}">
            ${
              column.listings.length
                ? column.listings.map(renderListingCard).join("")
                : `<div class="stage-empty">Drop a house here or move one with the quick action.</div>`
            }
          </div>
        </section>
      `,
    )
    .join("");
}
