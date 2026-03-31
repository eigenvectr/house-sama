# House Sama Architecture

## Product intent

House Sama is a pipeline-native house evaluation app. The goal is not to collect listings. The goal is to narrow them to a confident shortlist and send finalists to dad with a clearer case.

Core principles:

- opinionated evaluation over passive bookmarking
- commute, condition, neighborhood, and price fit are explicit dimensions
- GitHub Pages hosts the app, but Redfin scraping happens outside the browser

## Runtime split

### 1. Static front-end

The site is a static app served on GitHub Pages.

It renders:

- a four-stage kanban board
- dense listing cards with hero images and score bars
- a side editor for scoring, notes, visit details, and dad packet prep
- saved local views for sorting the pipeline in different ways

### 2. Repo-owned ingest

Redfin ingestion is handled by `scripts/ingest-redfin.mjs`.

It:

- resolves shortened `redf.in` links
- fetches listing HTML with browser-like headers
- extracts status from `xdp-meta`
- extracts listing facts and gallery images from JSON-LD
- writes normalized listing records to `data/listings.json`

### 3. Local decision state

All personal evaluation state stays in browser storage for the MVP:

- pipeline stage
- commute minutes
- 1–5 dimension scores
- 1–10 gut override
- notes, tags, visit notes, next action
- sent-to-dad summary and verdict

That keeps deployment simple and avoids trying to fake multi-user persistence on a static host.

## Listing data model

Repo-owned listing records are facts, not opinions:

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
  "lat": 42.6137796,
  "lng": -73.828765,
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
  "refreshedAt": "2026-03-31T...",
  "commuteMinutesHint": 18
}
```

## Fit score model

Composite fit score uses weighted 1–5 inputs:

- commute: 0.30
- photo / condition: 0.25
- neighborhood: 0.25
- price fit: 0.20

The app also supports a separate 1–10 override for instinct.

Budget logic:

- `$550k` is the soft reference point
- listings above `$575k` get an `Above Range` flag
- they remain sortable and fully evaluable

## UI direction

The current UI direction follows the editorial/masonry feel from [Pretext](https://github.com/chenglou/pretext), adapted for a real estate pipeline:

- oversized serif headings
- asymmetric board proportions
- warm neutral palette with teal / amber / sage accents
- photo-forward cards
- status demotion for pending and sold listings
- compact score micro-bars for at-a-glance scanning

## Constraints

- GitHub Pages is static hosting only
- browser-side Redfin fetches are off-limits because of CORS and anti-bot behavior
- localStorage is device-local
- Redfin image hotlinks may decay over time

## Next likely upgrades

- commute auto-calculation with a maps API
- map overlay
- lightbox photo review
- change detection for price drops and status changes
- shared state beyond localStorage
