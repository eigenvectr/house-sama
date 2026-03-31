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
  stageMeta,
  truncateText,
} from "./scoring.js";
import { tagsToText } from "./storage.js";

export function renderListingCard(listing) {
  const stage = stageMeta(listing.pipelineStage);
  const primaryAction = getPrimaryStageAction(listing.pipelineStage);
  const commuteTone = getCommuteTone(listing.commuteMinutes);

  return `
    <article
      class="house-card ${listing.inactive ? "house-card--inactive" : ""}"
      data-listing-id="${escapeAttribute(listing.id)}"
      draggable="true"
    >
      <div
        class="house-card__media"
        style="background-image: linear-gradient(180deg, transparent 0%, rgba(12, 16, 21, 0.72) 100%), url('${escapeAttribute(listing.heroImage ?? "")}')"
      >
        <div class="house-card__badges">
          <span class="pill pill--status">${escapeHtml(formatStatus(listing.status))}</span>
          ${listing.aboveRange ? '<span class="pill pill--warning">Above Range</span>' : ""}
          <span class="pill pill--muted">${escapeHtml(stage.label)}</span>
        </div>
      </div>

      <div class="house-card__body">
        <div class="house-card__scoreband">
          <div class="score-badge">
            <span class="score-badge__label">Composite</span>
            <strong>${escapeHtml(listing.compositeScore ? formatMaybeScore(listing.compositeScore) : `${listing.completedScores}/4`)}</strong>
          </div>
          <div class="score-badge score-badge--ghost">
            <span class="score-badge__label">Gut</span>
            <strong>${escapeHtml(Number.isFinite(listing.fitScoreOverride) ? `${formatMaybeScore(listing.fitScoreOverride)}/10` : "Unset")}</strong>
          </div>
        </div>

        <div class="score-mini">
          ${SCORE_DIMENSIONS.map(
            (dimension) => `
              <div class="score-mini__item">
                <span>${escapeHtml(dimension.shortLabel)}</span>
                <div class="score-mini__track">
                  <div class="score-mini__fill" style="width: ${Number.isFinite(listing.scores?.[dimension.key]) ? Number(listing.scores[dimension.key]) * 20 : 10}%"></div>
                </div>
              </div>
            `,
          ).join("")}
        </div>

        <div>
          <h3 class="house-card__title">${escapeHtml(listing.title)}</h3>
          <p class="house-card__address">${escapeHtml([listing.street, [listing.city, listing.state].filter(Boolean).join(", "), listing.zip].filter(Boolean).join(" "))}</p>
        </div>

        <div class="fact-grid">
          ${renderFact("Price", formatCurrency(listing.price))}
          ${renderFact("Beds", formatInteger(listing.beds))}
          ${renderFact("Baths", formatInteger(listing.baths))}
          ${renderFact("Sq Ft", formatInteger(listing.sqft))}
        </div>

        <div class="house-card__signal-row">
          <span class="signal-chip">${escapeHtml(Number.isFinite(listing.pricePerSqft) ? `${formatCurrency(listing.pricePerSqft)}/sqft` : "No ppsf")}</span>
          <span class="signal-chip signal-chip--${escapeHtml(commuteTone)}">${escapeHtml(Number.isFinite(listing.commuteMinutes) ? `${listing.commuteMinutes} min to ${IBM_REFERENCE}` : `Add commute to ${IBM_REFERENCE}`)}</span>
          <span class="signal-chip">${escapeHtml(listing.propertyType || "Property type pending")}</span>
        </div>

        <p class="house-card__description">${escapeHtml(truncateText(listing.description, 180))}</p>
        <p class="house-card__stage-note">${escapeHtml(stageSpecificCopy(listing))}</p>

        <div class="house-card__meta">
          ${listing.visitDate ? `<span class="meta-badge">Visit ${escapeHtml(formatShortDate(listing.visitDate))}</span>` : ""}
          ${listing.sentToDadAt ? `<span class="meta-badge meta-badge--done">Sent ${escapeHtml(formatShortDate(listing.sentToDadAt))}</span>` : ""}
          ${listing.tags?.length ? `<span class="meta-badge">${escapeHtml(tagsToText(listing.tags))}</span>` : ""}
        </div>

        <div class="house-card__actions">
          <button class="card-button" type="button" data-action="open-editor" data-id="${escapeAttribute(listing.id)}">
            ${escapeHtml(listing.pipelineStage === "interested" ? "Score This House" : "Open Evaluation")}
          </button>
          <button class="card-button card-button--ghost" type="button" data-action="advance-stage" data-id="${escapeAttribute(listing.id)}" data-target-stage="${escapeAttribute(primaryAction.target)}">
            ${escapeHtml(primaryAction.label)}
          </button>
          <a class="card-link" href="${escapeAttribute(listing.canonicalUrl)}" target="_blank" rel="noreferrer">Redfin</a>
        </div>
      </div>
    </article>
  `;
}

export function renderEditorPanel(listing) {
  if (!listing) {
    return `
      <section class="editor-empty">
        <p class="eyebrow">House editor</p>
        <h2>Select a house</h2>
        <p>Open a card to score it, update pipeline stage, add visit notes, and prep the packet for dad.</p>
      </section>
    `;
  }

  return `
    <section class="editor-sheet">
      <div class="editor-hero" style="background-image: linear-gradient(180deg, rgba(15, 18, 22, 0.05), rgba(15, 18, 22, 0.82)), url('${escapeAttribute(listing.heroImage ?? "")}')">
        <p class="eyebrow">House editor</p>
        <h2>${escapeHtml(listing.title)}</h2>
        <p>${escapeHtml([listing.street, [listing.city, listing.state].filter(Boolean).join(", "), listing.zip].filter(Boolean).join(" "))}</p>
      </div>

      <div class="editor-body">
        <div class="editor-summary">
          <div>
            <span class="summary-label">Composite</span>
            <strong>${escapeHtml(listing.compositeScore ? `${formatMaybeScore(listing.compositeScore)}/5` : "Unscored")}</strong>
          </div>
          <div>
            <span class="summary-label">Gut override</span>
            <strong>${escapeHtml(Number.isFinite(listing.fitScoreOverride) ? `${formatMaybeScore(listing.fitScoreOverride)}/10` : "Unset")}</strong>
          </div>
          <div>
            <span class="summary-label">Reference</span>
            <strong>${escapeHtml(listing.aboveRange ? "Above $550k" : "Inside range")}</strong>
          </div>
        </div>

        <div class="editor-grid">
          <label class="editor-field">
            <span>Pipeline stage</span>
            <select data-field="pipelineStage">
              ${PIPELINE_STAGES.map(
                (stage) => `<option value="${stage.key}" ${listing.pipelineStage === stage.key ? "selected" : ""}>${escapeHtml(stage.label)}</option>`,
              ).join("")}
            </select>
          </label>

          <label class="editor-field">
            <span>Commute minutes to ${escapeHtml(IBM_REFERENCE)}</span>
            <input data-field="commuteMinutes" type="number" min="0" step="1" value="${listing.commuteMinutes ?? ""}" placeholder="25" />
          </label>

          <label class="editor-field">
            <span>Gut override (1-10)</span>
            <input data-field="fitScoreOverride" type="number" min="1" max="10" step="0.1" value="${listing.fitScoreOverride ?? ""}" placeholder="8.5" />
          </label>

          <label class="editor-field">
            <span>Next action</span>
            <input data-field="nextAction" type="text" value="${escapeAttribute(listing.nextAction ?? "")}" placeholder="Confirm open house, verify roof age..." />
          </label>
        </div>

        <section class="editor-section">
          <p class="section-kicker">Scoring dimensions</p>
          <div class="editor-score-grid">
            ${SCORE_DIMENSIONS.map(
              (dimension) => `
                <label class="editor-field">
                  <span>${escapeHtml(dimension.label)}</span>
                  <select data-score-key="${dimension.key}">
                    <option value="">Unscored</option>
                    <option value="1" ${Number(listing.scores?.[dimension.key]) === 1 ? "selected" : ""}>1</option>
                    <option value="2" ${Number(listing.scores?.[dimension.key]) === 2 ? "selected" : ""}>2</option>
                    <option value="3" ${Number(listing.scores?.[dimension.key]) === 3 ? "selected" : ""}>3</option>
                    <option value="4" ${Number(listing.scores?.[dimension.key]) === 4 ? "selected" : ""}>4</option>
                    <option value="5" ${Number(listing.scores?.[dimension.key]) === 5 ? "selected" : ""}>5</option>
                  </select>
                </label>
              `,
            ).join("")}
          </div>
        </section>

        <section class="editor-section">
          <p class="section-kicker">Context</p>
          <div class="editor-grid">
            <label class="editor-field">
              <span>Tags</span>
              <input data-field="tagsText" type="text" value="${escapeAttribute(tagsToText(listing.tags))}" placeholder="yard, kitchen, commute, district" />
            </label>

            <label class="editor-field">
              <span>Visit date</span>
              <input data-field="visitDate" type="date" value="${escapeAttribute(listing.visitDate ?? "")}" />
            </label>
          </div>

          <label class="editor-field editor-field--wide">
            <span>General notes</span>
            <textarea data-field="notes" placeholder="What matters, what worries you, what to verify next.">${escapeHtml(listing.notes ?? "")}</textarea>
          </label>

          <label class="editor-field editor-field--wide">
            <span>Visit notes</span>
            <textarea data-field="visitNotes" placeholder="How did it feel in person? Noise? Smell? Layout? Deferred maintenance?">${escapeHtml(listing.visitNotes ?? "")}</textarea>
          </label>
        </section>

        <section class="editor-section">
          <p class="section-kicker">Dad packet</p>
          <div class="editor-grid">
            <label class="editor-field">
              <span>Sent to dad date</span>
              <input data-field="sentToDadAt" type="date" value="${escapeAttribute(listing.sentToDadAt ?? "")}" />
            </label>

            <label class="editor-field">
              <span>Dad verdict</span>
              <input data-field="dadVerdict" type="text" value="${escapeAttribute(listing.dadVerdict ?? "")}" placeholder="Promising, too much work, keep watching..." />
            </label>
          </div>

          <label class="editor-field editor-field--wide">
            <span>Summary for dad</span>
            <textarea data-field="summaryForDad" placeholder="Short financing-facing summary: why this one, risks, next move.">${escapeHtml(listing.summaryForDad ?? "")}</textarea>
          </label>
        </section>
      </div>
    </section>
  `;
}

function renderFact(label, value) {
  return `
    <div class="fact">
      <span class="fact__label">${escapeHtml(label)}</span>
      <span class="fact__value">${escapeHtml(value)}</span>
    </div>
  `;
}

function stageSpecificCopy(listing) {
  switch (listing.pipelineStage) {
    case "scheduled":
      return listing.visitDate
        ? `Scheduled for ${formatShortDate(listing.visitDate)}. ${listing.nextAction || "Add the checklist before you walk in."}`
        : listing.nextAction || "Lock the date, then show up with a sharper checklist than the photos deserve.";
    case "visited":
      return listing.visitNotes
        ? truncateText(listing.visitNotes, 120)
        : "Real-world notes belong here before the memory smooths over the problems.";
    case "send-to-dad":
      return listing.summaryForDad
        ? truncateText(listing.summaryForDad, 120)
        : "Finalist stage. Tighten the case and send a financing-ready summary.";
    case "interested":
    default:
      return "Score the four dimensions, set commute, and decide whether this deserves calendar time.";
  }
}
