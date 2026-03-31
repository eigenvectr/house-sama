import {
  IBM_REFERENCE,
  PIPELINE_STAGES,
  SCORE_DIMENSIONS,
  escapeAttribute,
  escapeHtml,
  formatCurrency,
  formatInteger,
  formatMaybeScore,
  formatShortDate,
  formatStatus,
  getCommuteTone,
  getPrimaryStageAction,
  getScoreTone,
  relativeTime,
  stageMeta,
  truncateText,
} from "./scoring.js";
import { tagsToText } from "./storage.js";

export function renderListingCard(listing, options = {}) {
  const stage = stageMeta(listing.pipelineStage);
  const primaryAction = getPrimaryStageAction(listing.pipelineStage);
  const commuteTone = getCommuteTone(listing.commuteMinutes);
  const compositeTone = getScoreTone(listing.compositeScore);
  const gutTone = getScoreTone(listing.fitScoreOverride, 10);
  const expanded = Boolean(options.expanded);
  const justMoved = Boolean(options.justMoved);
  const heroBackground = buildHeroBackground(listing.heroImage);
  const bubbleText = getBubbleText(listing);

  return `
    <article
      class="house-card ${listing.inactive ? "house-card--inactive" : ""} ${expanded ? "is-expanded" : ""} ${justMoved ? "house-card--pulse" : ""}"
      data-listing-id="${escapeAttribute(listing.id)}"
      draggable="true"
      style="--hero-height: ${listing.layout.heroHeight}px; --expand-height: ${listing.layout.expandedHeight}px; --bubble-width: ${listing.layout.noteBubbleWidth}px;"
    >
      <button class="house-card__glance" type="button" data-action="toggle-expand" data-id="${escapeAttribute(listing.id)}" aria-expanded="${expanded ? "true" : "false"}">
        <div class="house-card__hero" style="${heroBackground}">
          <div class="house-card__hero-top">
            <span class="stage-token stage-token--${escapeAttribute(stage.key)}">${escapeHtml(stage.label)}</span>
            <span class="status-token">${escapeHtml(formatStatus(listing.status))}</span>
          </div>

          <div class="house-card__hover-panel">
            <div class="score-ribbons">
              ${renderScoreBars(listing)}
            </div>
            <div class="hover-badges">
              <span class="hover-badge hover-badge--${escapeHtml(commuteTone)}">
                ${escapeHtml(
                  Number.isFinite(listing.commuteMinutes)
                    ? `${listing.commuteMinutes} min to ${IBM_REFERENCE}`
                    : `Add commute to ${IBM_REFERENCE}`,
                )}
              </span>
              ${listing.aboveRange ? '<span class="hover-badge hover-badge--flag">Above Range</span>' : ""}
              ${listing.inactive ? '<span class="hover-badge hover-badge--muted">Demoted from active pool</span>' : ""}
            </div>
          </div>

          ${
            listing.heroImage
              ? ""
              : `
                <div class="house-card__photo-fallback">
                  <span>No photo yet</span>
                </div>
              `
          }
        </div>

        <div class="house-card__summary">
          <div class="house-card__headline">
            <div class="house-card__price-stack">
              <p class="house-card__price">${escapeHtml(formatCurrency(listing.price))}</p>
              <p class="house-card__title">${escapeHtml(listing.title)}</p>
              <p class="house-card__address">${escapeHtml(
                [listing.city, listing.state].filter(Boolean).join(", ") || listing.street || "",
              )}</p>
            </div>
            <div class="score-orb-stack">
              ${renderScoreOrb("Composite", listing.compositeScore, compositeTone, 5)}
              ${
                Number.isFinite(listing.fitScoreOverride)
                  ? renderScoreOrb("Gut", listing.fitScoreOverride, gutTone, 10, true)
                  : ""
              }
            </div>
          </div>

          <div class="house-card__facts-line">
            <span>${escapeHtml(buildFactLine(listing))}</span>
            ${
              Number.isFinite(listing.pricePerSqft)
                ? `<span>${escapeHtml(`${formatCurrency(listing.pricePerSqft)}/sf`)}</span>`
                : ""
            }
          </div>

          ${renderStageAccent(listing)}
        </div>
      </button>

      <div class="house-card__expand" aria-hidden="${expanded ? "false" : "true"}">
        <div class="house-card__expand-inner">
          <section class="inline-editor">
            <div class="inline-editor__head">
              <p class="eyebrow">Quick scoring</p>
              <p>${escapeHtml(stage.description)}</p>
            </div>

            <div class="inline-score-stack">
              ${SCORE_DIMENSIONS.map((dimension) => renderScoreRow(listing, dimension)).join("")}
            </div>

            <div class="inline-fields">
              <label class="inline-field">
                <span>Commute minutes</span>
                <input
                  data-id="${escapeAttribute(listing.id)}"
                  data-field="commuteMinutes"
                  type="number"
                  min="0"
                  step="1"
                  value="${listing.commuteMinutes ?? ""}"
                  placeholder="25"
                />
              </label>

              <label class="inline-field">
                <span>Visit date</span>
                <input
                  data-id="${escapeAttribute(listing.id)}"
                  data-field="visitDate"
                  type="date"
                  value="${escapeAttribute(listing.visitDate ?? "")}"
                />
              </label>

              <label class="inline-field">
                <span>Tags</span>
                <input
                  data-id="${escapeAttribute(listing.id)}"
                  data-field="tagsText"
                  type="text"
                  value="${escapeAttribute(tagsToText(listing.tags))}"
                  placeholder="yard, kitchen, school"
                />
              </label>

              <label class="inline-field inline-field--wide">
                <span>Next action</span>
                <input
                  data-id="${escapeAttribute(listing.id)}"
                  data-field="nextAction"
                  type="text"
                  value="${escapeAttribute(listing.nextAction ?? "")}"
                  placeholder="Confirm the showing, ask about roof age, compare taxes..."
                />
              </label>
            </div>

            <label class="inline-field inline-field--wide">
              <span>Working note</span>
              <textarea
                data-id="${escapeAttribute(listing.id)}"
                data-field="notes"
                style="height: ${listing.layout.notesHeight}px"
                placeholder="What matters here, what worries you, and what to verify next."
              >${escapeHtml(listing.notes ?? "")}</textarea>
            </label>

            <div class="house-card__note-bubble" style="max-width: ${listing.layout.noteBubbleWidth}px">
              ${escapeHtml(bubbleText)}
            </div>
          </section>
        </div>
      </div>

      <footer class="house-card__footer">
        <button class="text-action" type="button" data-action="open-detail" data-id="${escapeAttribute(listing.id)}">
          Open packet
        </button>
        <button
          class="text-action text-action--strong"
          type="button"
          data-action="advance-stage"
          data-id="${escapeAttribute(listing.id)}"
          data-target-stage="${escapeAttribute(primaryAction.target)}"
        >
          ${escapeHtml(primaryAction.label)}
        </button>
        <a class="text-link" href="${escapeAttribute(listing.canonicalUrl)}" target="_blank" rel="noreferrer">
          Redfin
        </a>
      </footer>
    </article>
  `;
}

export function renderDetailPanel(listing) {
  if (!listing) {
    return `
      <section class="detail-empty">
        <p class="eyebrow">Full packet</p>
        <h2>Open a house packet</h2>
        <p>Double-click a card or use “Open packet” when a listing needs gallery review, visit notes, or a financing summary.</p>
      </section>
    `;
  }

  const compositeTone = getScoreTone(listing.compositeScore);
  const gutTone = getScoreTone(listing.fitScoreOverride, 10);
  const heroBackground = buildHeroBackground(listing.heroImage);

  return `
    <section class="detail-sheet">
      <div class="detail-hero" style="${heroBackground}">
        <div class="detail-hero__veil"></div>
        <div class="detail-hero__content">
          <p class="eyebrow">Full packet</p>
          <h2>${escapeHtml(listing.title)}</h2>
          <p>${escapeHtml(buildStreetLine(listing))}</p>
          <div class="detail-hero__orbs">
            ${renderScoreOrb("Composite", listing.compositeScore, compositeTone, 5)}
            ${
              Number.isFinite(listing.fitScoreOverride)
                ? renderScoreOrb("Gut", listing.fitScoreOverride, gutTone, 10, true)
                : ""
            }
          </div>
        </div>
      </div>

      <div class="detail-gallery">
        ${renderGallery(listing)}
      </div>

      <section class="detail-summary">
        ${renderSummaryMetric("Price", formatCurrency(listing.price))}
        ${renderSummaryMetric("Commute", Number.isFinite(listing.commuteMinutes) ? `${listing.commuteMinutes} min` : "Unset")}
        ${renderSummaryMetric("Status", formatStatus(listing.status))}
        ${renderSummaryMetric("Refreshed", listing.refreshedAt ? relativeTime(listing.refreshedAt) : "n/a")}
      </section>

      <section class="detail-section">
        <div class="detail-section__head">
          <p class="eyebrow">Pipeline</p>
          <p>${escapeHtml(stageMeta(listing.pipelineStage).description)}</p>
        </div>

        <div class="detail-grid">
          <label class="detail-field">
            <span>Stage</span>
            <select data-id="${escapeAttribute(listing.id)}" data-field="pipelineStage">
              ${PIPELINE_STAGES.map(
                (stage) => `
                  <option value="${stage.key}" ${listing.pipelineStage === stage.key ? "selected" : ""}>
                    ${escapeHtml(stage.label)}
                  </option>
                `,
              ).join("")}
            </select>
          </label>

          <label class="detail-field">
            <span>Commute minutes to ${escapeHtml(IBM_REFERENCE)}</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="commuteMinutes"
              type="number"
              min="0"
              step="1"
              value="${listing.commuteMinutes ?? ""}"
              placeholder="25"
            />
          </label>

          <label class="detail-field">
            <span>Gut override (1-10)</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="fitScoreOverride"
              type="number"
              min="1"
              max="10"
              step="0.1"
              value="${listing.fitScoreOverride ?? ""}"
              placeholder="8.6"
            />
          </label>

          <label class="detail-field">
            <span>Visit date</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="visitDate"
              type="date"
              value="${escapeAttribute(listing.visitDate ?? "")}"
            />
          </label>
        </div>
      </section>

      <section class="detail-section">
        <div class="detail-section__head">
          <p class="eyebrow">Scoring</p>
          <p>Composite stays weighted. Gut override stays separate.</p>
        </div>
        <div class="inline-score-stack inline-score-stack--detail">
          ${SCORE_DIMENSIONS.map((dimension) => renderScoreRow(listing, dimension)).join("")}
        </div>
      </section>

      <section class="detail-section">
        <div class="detail-section__head">
          <p class="eyebrow">Working notes</p>
          <p>Keep the quick read here, then preserve the in-person details separately.</p>
        </div>

        <div class="detail-grid">
          <label class="detail-field">
            <span>Tags</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="tagsText"
              type="text"
              value="${escapeAttribute(tagsToText(listing.tags))}"
              placeholder="yard, fixer, school, kitchen"
            />
          </label>

          <label class="detail-field">
            <span>Next action</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="nextAction"
              type="text"
              value="${escapeAttribute(listing.nextAction ?? "")}"
              placeholder="What has to happen before this moves forward?"
            />
          </label>
        </div>

        <label class="detail-field detail-field--wide">
          <span>General notes</span>
          <textarea
            data-id="${escapeAttribute(listing.id)}"
            data-field="notes"
            style="height: ${listing.detailLayout.notesHeight}px"
            placeholder="Topline thoughts, concerns, pros, cons."
          >${escapeHtml(listing.notes ?? "")}</textarea>
        </label>

        <label class="detail-field detail-field--wide">
          <span>Visit notes</span>
          <textarea
            data-id="${escapeAttribute(listing.id)}"
            data-field="visitNotes"
            style="height: ${listing.detailLayout.visitNotesHeight}px"
            placeholder="How did it feel in person? What changed after the visit?"
          >${escapeHtml(listing.visitNotes ?? "")}</textarea>
        </label>
      </section>

      <section class="detail-section">
        <div class="detail-section__head">
          <p class="eyebrow">Dad packet</p>
          <p>This is the financing-facing summary, not the whole brain dump.</p>
        </div>

        <div class="detail-packet-preview">
          <div class="detail-packet-preview__orb score-orb score-orb--${escapeAttribute(compositeTone)}">
            <span class="score-orb__label">Fit</span>
            <strong>${escapeHtml(Number.isFinite(listing.compositeScore) ? formatMaybeScore(listing.compositeScore) : "--")}</strong>
          </div>
          <div
            class="detail-packet-preview__bubble"
            style="max-width: ${listing.detailLayout.dadPreview.width}px"
          >
            ${escapeHtml(
              truncateText(
                listing.summaryForDad || listing.notes || "Write the one-paragraph case you would actually send.",
                220,
              ),
            )}
          </div>
        </div>

        <div class="detail-grid">
          <label class="detail-field">
            <span>Sent to dad</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="sentToDadAt"
              type="date"
              value="${escapeAttribute(listing.sentToDadAt ?? "")}"
            />
          </label>

          <label class="detail-field">
            <span>Dad verdict</span>
            <input
              data-id="${escapeAttribute(listing.id)}"
              data-field="dadVerdict"
              type="text"
              value="${escapeAttribute(listing.dadVerdict ?? "")}"
              placeholder="Promising, too much work, wait, pass..."
            />
          </label>
        </div>

        <label class="detail-field detail-field--wide">
          <span>Summary for dad</span>
          <textarea
            data-id="${escapeAttribute(listing.id)}"
            data-field="summaryForDad"
            style="height: ${listing.detailLayout.summaryHeight}px"
            placeholder="Why this one, what could go wrong, what should happen next."
          >${escapeHtml(listing.summaryForDad ?? "")}</textarea>
        </label>
      </section>
    </section>
  `;
}

function renderScoreBars(listing) {
  return SCORE_DIMENSIONS.map((dimension) => {
    const value = Number(listing.scores?.[dimension.key]);
    const width = Number.isFinite(value) ? value * 20 : 10;
    return `
      <div class="score-ribbons__item">
        <span>${escapeHtml(dimension.shortLabel)}</span>
        <i style="width: ${width}%"></i>
      </div>
    `;
  }).join("");
}

function renderScoreRow(listing, dimension) {
  const value = Number(listing.scores?.[dimension.key]);
  const safeValue = Number.isFinite(value) ? value : 3;

  return `
    <div class="score-row">
      <div class="score-row__copy">
        <span>${escapeHtml(dimension.label)}</span>
        <strong data-live-score-output="${escapeAttribute(`${listing.id}--${dimension.key}`)}">
          ${escapeHtml(Number.isFinite(value) ? String(value) : "Unset")}
        </strong>
      </div>
      <div class="score-row__controls">
        <input
          data-id="${escapeAttribute(listing.id)}"
          data-score-key="${escapeAttribute(dimension.key)}"
          type="range"
          min="1"
          max="5"
          step="1"
          value="${safeValue}"
          aria-label="${escapeAttribute(dimension.label)}"
        />
        <button
          class="score-row__clear"
          type="button"
          data-action="clear-score"
          data-id="${escapeAttribute(listing.id)}"
          data-score-key="${escapeAttribute(dimension.key)}"
        >
          Clear
        </button>
      </div>
    </div>
  `;
}

function renderScoreOrb(label, value, tone, scale, compact = false) {
  return `
    <div class="score-orb score-orb--${escapeAttribute(tone)} ${compact ? "score-orb--compact" : ""}">
      <span class="score-orb__label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(Number.isFinite(value) ? formatMaybeScore(value) : "--")}</strong>
      <span class="score-orb__scale">/${scale}</span>
    </div>
  `;
}

function renderStageAccent(listing) {
  if (listing.pipelineStage === "scheduled" && listing.visitDate) {
    return `<p class="house-card__accent">Showing ${escapeHtml(formatShortDate(listing.visitDate))}</p>`;
  }

  if (listing.pipelineStage === "visited" && listing.visitNotes) {
    return `<p class="house-card__accent">${escapeHtml(truncateText(listing.visitNotes, 82))}</p>`;
  }

  if (listing.pipelineStage === "send-to-dad" && listing.sentToDadAt) {
    return `<p class="house-card__accent">Sent ${escapeHtml(formatShortDate(listing.sentToDadAt))}</p>`;
  }

  return `<p class="house-card__accent">${escapeHtml(stageMeta(listing.pipelineStage).shortLabel)} lane</p>`;
}

function renderGallery(listing) {
  const images = (listing.gallery ?? []).slice(0, 8);
  if (!images.length) {
    return `<div class="detail-gallery__empty">No gallery cached for this listing yet.</div>`;
  }

  return images
    .map(
      (image, index) => `
        <figure class="detail-gallery__item ${index === 0 ? "detail-gallery__item--lead" : ""}">
          <img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${listing.title} photo ${index + 1}`)}" loading="lazy" />
        </figure>
      `,
    )
    .join("");
}

function renderSummaryMetric(label, value) {
  return `
    <div class="detail-summary__metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function buildHeroBackground(heroImage) {
  if (!heroImage) {
    return "background: linear-gradient(160deg, rgba(26, 38, 49, 0.94), rgba(94, 104, 94, 0.84));";
  }

  return `background-image: linear-gradient(180deg, rgba(8, 12, 17, 0.04), rgba(8, 12, 17, 0.78)), url('${escapeAttribute(heroImage)}'); background-position: center; background-size: cover;`;
}

function buildFactLine(listing) {
  return [
    Number.isFinite(listing.beds) ? `${formatInteger(listing.beds)} bd` : null,
    Number.isFinite(listing.baths) ? `${formatInteger(listing.baths)} ba` : null,
    Number.isFinite(listing.sqft) ? `${formatInteger(listing.sqft)} sf` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Facts still incoming";
}

function buildStreetLine(listing) {
  return [listing.street, [listing.city, listing.state].filter(Boolean).join(", "), listing.zip]
    .filter(Boolean)
    .join(" ");
}

function getBubbleText(listing) {
  if (listing.pipelineStage === "send-to-dad") {
    return listing.summaryForDad || listing.notes || "Write the clear financing case and the remaining risks.";
  }
  if (listing.pipelineStage === "visited") {
    return listing.visitNotes || listing.notes || "Use this space for the part photos could not tell you.";
  }
  if (listing.pipelineStage === "scheduled") {
    return listing.nextAction || "Lock the checklist before the showing arrives.";
  }
  return listing.notes || "The board stays quiet until this house earns more attention.";
}
