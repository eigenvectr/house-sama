# house-sama

House Sama is a GitHub Pages house-evaluation pipeline for Redfin listings.

The app is built around a simple split:

- `data/listings.json` stores scraped listing facts from Redfin
- browser `localStorage` stores the decision layer: pipeline stage, scores, commute, notes, visit context, and dad packet prep

## Product shape

This is not a bookmark app. Each listing moves through:

- Interested
- Scheduled
- Visited
- Send to Dad

Every house is scored on:

- commute to IBM Research Albany
- photo / condition
- neighborhood
- price fit

The board computes a weighted composite score and also supports a separate gut-feel override.

## Local workflow

```bash
npm start
```

That serves the site at `http://localhost:4173`.

Refresh listings from Redfin:

```bash
npm run ingest -- https://redf.in/JAR82i
```

## File structure

```text
house-sama/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── board.js
│   ├── card.js
│   ├── filters.js
│   ├── scoring.js
│   └── storage.js
├── data/
│   └── listings.json
├── scripts/
│   ├── ingest-redfin.mjs
│   └── serve.mjs
└── .github/workflows/
    ├── deploy-pages.yml
    └── refresh-listings.yml
```

## Current MVP

- kanban pipeline board with four stages
- drag-and-drop stage movement
- composite fit scoring plus gut override
- commute minutes visible at a glance
- budget flag above the soft `$575k` warning threshold
- pending / sold demotion
- saved local view presets
- seeded Capital Region listing sample

## Deployment

The repo includes:

- `deploy-pages.yml` to publish the site
- `refresh-listings.yml` to ingest or refresh listings through GitHub Actions

GitHub Pages must be enabled for the repository and configured to use `GitHub Actions` as the Pages source.

## More detail

The fuller architecture draft lives in [docs/architecture.md](./docs/architecture.md).
