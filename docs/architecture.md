# House Sama Architecture

## Product target

Build a visually opinionated house-tracking app on GitHub Pages that turns scattered Redfin links into a sortable shortlist.

## Non-negotiable requirements

- resolve both canonical Redfin URLs and shortened `redf.in` URLs
- pull listing status and visually demote `pending` or `sold` homes
- support better organization than a flat list
- allow custom views and stronger grouping controls
- keep the UI deliberate, editorial, and spatially expressive instead of default dashboard boilerplate

## Constraints

- GitHub Pages is static hosting
- Redfin data is not dependable from in-browser `fetch()` calls because of CORS and anti-bot behavior
- user-authored organization data needs a persistence story separate from the static hosting layer

## Chosen architecture

### 1. Static front-end on GitHub Pages

The site reads `data/listings.json` and renders:

- a grouped listing board
- status-aware card styling
- custom sort and grouping controls
- saved local view presets
- per-card local notes, tags, bucket, and fit score

This keeps the public app extremely cheap to host and easy to deploy.

### 2. Repo-owned ingestion pipeline

Redfin scraping runs outside the browser through `scripts/ingest-redfin.mjs`.

Responsibilities:

- follow redirects from shortened `redf.in` links
- fetch the final Redfin listing page with browser-like headers
- extract listing status from `xdp-meta`
- extract property facts from the embedded JSON-LD `RealEstateListing`
- merge results back into `data/listings.json`

### 3. GitHub Actions bridge

Two workflows close the loop:

- `deploy-pages.yml`: publishes the static site
- `refresh-listings.yml`: refreshes existing listings or adds new ones from manual input

That gives the project a lightweight “static app + background refresh” model without standing up a backend.

## Data model

Each listing in `data/listings.json` is shaped for both machine refreshes and UI-level organization:

```json
{
  "id": "97974308",
  "source": "redfin",
  "sourceUrl": "https://redf.in/JAR82i",
  "canonicalUrl": "https://www.redfin.com/NY/Delmar/60-Fernbank-Ave-12054/home/97974308",
  "title": "60 Fernbank Ave",
  "street": "60 Fernbank Ave",
  "city": "Delmar",
  "state": "NY",
  "zip": "12054",
  "status": "pending",
  "price": 549900,
  "beds": 4,
  "baths": 3,
  "sqft": 2260,
  "yearBuilt": 1984,
  "propertyType": "Single Family Residential",
  "description": "...",
  "heroImage": "https://...",
  "gallery": ["https://..."],
  "addedAt": "2026-03-31T...",
  "refreshedAt": "2026-03-31T..."
}
```

Local organization state currently lives in browser storage:

- `bucket`
- `fitScore`
- `notes`
- `tags`
- saved view presets

## UI direction

The visual direction follows the spirit of [Pretext](https://github.com/chenglou/pretext) rather than a standard admin dashboard:

- oversized editorial typography
- asymmetrical panels instead of repetitive widget grids
- layered backgrounds and depth cues
- calm neutrals with a few sharp accent colors
- dense but readable cards that reward scanning

## MVP in this repo

- static site scaffold
- Redfin ingest script
- sample seeded data from the provided short URL
- Pages deploy workflow
- manual/scheduled refresh workflow

## Next slices

- map and commute overlays
- comparable sales lane
- import from CSV or browser extension capture
- shared annotations backed by GitHub Issues, Supabase, or another lightweight API
- change detection digest when a listing flips to pending, sold, or drops in price
