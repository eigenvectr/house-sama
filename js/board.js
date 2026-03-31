import { PIPELINE_STAGES, escapeAttribute, escapeHtml } from "./scoring.js";
import { renderListingCard } from "./card.js";

export function renderStageTabs(stageCounts, stageFocus) {
  const total = Object.values(stageCounts).reduce((sum, count) => sum + count, 0);

  return `
    <button class="stage-tab ${stageFocus === "all" ? "is-active" : ""}" type="button" data-stage-focus="all">
      <span>All</span>
      <strong>${total}</strong>
    </button>
    ${PIPELINE_STAGES.map(
      (stage) => `
        <button
          class="stage-tab ${stageFocus === stage.key ? "is-active" : ""}"
          type="button"
          data-stage-focus="${stage.key}"
        >
          <span>${escapeHtml(stage.label)}</span>
          <strong>${stageCounts[stage.key] ?? 0}</strong>
        </button>
      `,
    ).join("")}
  `;
}

export function renderBoard(columns, options = {}) {
  if (options.viewMode === "map") {
    return renderMapPlaceholder(columns);
  }

  return columns
    .map((column) => renderStageColumn(column, options))
    .join("");
}

function renderStageColumn(column, options) {
  const stageBody =
    options.viewMode === "list"
      ? `
          <div class="stage-lanes stage-lanes--stacked" data-stage-dropzone="${column.key}">
            <div class="stage-lane">
              ${
                column.listings.length
                  ? column.listings
                      .map((listing) =>
                        renderListingCard(listing, {
                          expanded: options.expandedListingId === listing.id,
                          justMoved: options.justMovedId === listing.id,
                        }),
                      )
                      .join("")
                  : `<div class="stage-empty">No houses in this lane right now.</div>`
              }
            </div>
          </div>
        `
      : `
          <div class="stage-lanes ${column.laneCount > 1 ? "stage-lanes--masonry" : ""}" data-stage-dropzone="${column.key}">
            ${
              column.lanes.some((lane) => lane.length)
                ? column.lanes
                    .map(
                      (lane, index) => `
                        <div class="stage-lane stage-lane--${index + 1}">
                          ${
                            lane.length
                              ? lane
                                  .map((listing) =>
                                    renderListingCard(listing, {
                                      expanded: options.expandedListingId === listing.id,
                                      justMoved: options.justMovedId === listing.id,
                                    }),
                                  )
                                  .join("")
                              : `<div class="stage-empty">This lane is ready for the next candidate.</div>`
                          }
                        </div>
                      `,
                    )
                    .join("")
                : `<div class="stage-empty">Drop a house here or move a candidate into this stage.</div>`
            }
          </div>
        `;

  return `
    <section
      class="stage-column stage-column--${escapeAttribute(column.key)} stage-column--${escapeAttribute(column.mode)}"
      style="--stage-width: ${column.stageWidth}px; --lane-count: ${column.laneCount};"
      data-stage-column="${escapeAttribute(column.key)}"
    >
      <header class="stage-column__head">
        <div>
          <p class="eyebrow">${escapeHtml(column.shortLabel)}</p>
          <h2>${escapeHtml(column.label)}</h2>
        </div>
        <p>${column.listings.length} ${column.listings.length === 1 ? "house" : "houses"}</p>
      </header>
      <p class="stage-column__copy">${escapeHtml(column.description)}</p>
      ${stageBody}
    </section>
  `;
}

function renderMapPlaceholder(columns) {
  const merged = columns.flatMap((column) => column.listings);
  const mappable = merged.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng)).length;

  return `
    <section class="map-placeholder">
      <p class="eyebrow">Map view</p>
      <h2>Phase 2 overlay</h2>
      <p>The map toggle is wired into the shell, but the actual commute-first spatial view still belongs in the next iteration.</p>
      <div class="map-placeholder__facts">
        <div>
          <span>Visible listings</span>
          <strong>${merged.length}</strong>
        </div>
        <div>
          <span>With coordinates</span>
          <strong>${mappable}</strong>
        </div>
      </div>
    </section>
  `;
}
