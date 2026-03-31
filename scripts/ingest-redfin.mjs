import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(rootDir, "data", "listings.json");

const browserHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const store = await readStore();
  const incomingUrls = collectUrls(process.argv.slice(2), process.env.HOUSE_SAMA_URLS ?? "");
  const refreshTargets = incomingUrls.length
    ? incomingUrls
    : store.listings.map((listing) => listing.sourceUrl || listing.canonicalUrl).filter(Boolean);

  if (!refreshTargets.length) {
    console.log("No URLs to ingest.");
    return;
  }

  const uniqueTargets = [...new Set(refreshTargets)];
  const now = new Date().toISOString();
  const existingListings = [...store.listings];
  const nextById = new Map(existingListings.map((listing) => [listing.id, listing]));
  let didChange = false;

  for (const [index, sourceUrl] of uniqueTargets.entries()) {
    try {
      const scraped = await scrapeListing(sourceUrl);
      const existing = findExistingListing(existingListings, scraped);
      const merged = mergeListing(existing, scraped, sourceUrl);

      if (!existing || hasMaterialChange(existing, merged)) {
        merged.refreshedAt = now;
        didChange = true;
      } else {
        merged.refreshedAt = existing.refreshedAt ?? now;
      }

      nextById.set(merged.id, merged);
      console.log(`Updated ${merged.title} [${merged.status}]`);
    } catch (error) {
      console.error(`Failed to ingest ${sourceUrl}: ${error.message}`);
    }

    if (index < uniqueTargets.length - 1) {
      await delay(650);
    }
  }

  const nextStore = {
    updatedAt: didChange ? now : store.updatedAt ?? now,
    listings: [...nextById.values()].sort(sortListings),
  };

  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
  console.log(`Wrote ${nextStore.listings.length} listings to ${dataFile}`);
}

async function scrapeListing(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: browserHeaders,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const metadata = extractJsonById(html, "xdp-meta") ?? {};
  const listingJsonLd = extractJsonLdObjects(html).find((entry) =>
    Array.isArray(entry?.["@type"]) ? entry["@type"].includes("RealEstateListing") : false,
  );

  if (!listingJsonLd) {
    throw new Error("Could not find the RealEstateListing JSON-LD block");
  }

  const mainEntity = listingJsonLd.mainEntity ?? {};
  const address = mainEntity.address ?? {};
  const canonicalUrl =
    listingJsonLd.url ?? listingJsonLd.offers?.url ?? extractCanonicalUrl(html) ?? stripQuery(response.url);
  const title = listingJsonLd.name ?? address.streetAddress ?? fallbackTitleFromUrl(canonicalUrl);
  const images = normalizeImages(mainEntity.image ?? listingJsonLd.image);

  return {
    id: extractListingId(canonicalUrl),
    source: "redfin",
    sourceUrl,
    canonicalUrl,
    title,
    street: address.streetAddress ?? null,
    city: address.addressLocality ?? null,
    state: address.addressRegion ?? null,
    zip: address.postalCode ?? null,
    lat: numberOrNull(mainEntity.geo?.latitude),
    lng: numberOrNull(mainEntity.geo?.longitude),
    status: normalizeStatus(metadata.listingStatus),
    price: numberOrNull(listingJsonLd.offers?.price),
    beds: numberOrNull(mainEntity.numberOfBedrooms),
    baths: numberOrNull(mainEntity.numberOfBathroomsTotal),
    sqft: numberOrNull(mainEntity.floorSize?.value),
    yearBuilt: numberOrNull(mainEntity.yearBuilt),
    propertyType: titleCase(cleanText(metadata.propertyType ?? mainEntity.accommodationCategory ?? "")),
    description: cleanText(listingJsonLd.description ?? ""),
    heroImage: images[0] ?? null,
    gallery: images,
    listedAt: listingJsonLd.datePosted ?? null,
    reviewedAt: listingJsonLd.lastReviewed ?? null,
  };
}

function mergeListing(existing, scraped, sourceUrl) {
  const {
    latitude,
    longitude,
    fitScore,
    bucket,
    notes,
    tags,
    ...restExisting
  } = existing ?? {};

  return {
    ...restExisting,
    ...scraped,
    sourceUrl: existing?.sourceUrl ?? sourceUrl,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    commuteMinutesHint: numberOrNull(existing?.commuteMinutesHint),
  };
}

function hasMaterialChange(existing, next) {
  const keys = [
    "canonicalUrl",
    "sourceUrl",
    "title",
    "street",
    "city",
    "state",
    "zip",
    "status",
    "price",
    "beds",
    "baths",
    "sqft",
    "yearBuilt",
    "propertyType",
    "description",
    "heroImage",
    "listedAt",
    "reviewedAt",
  ];

  return keys.some((key) => JSON.stringify(existing?.[key] ?? null) !== JSON.stringify(next?.[key] ?? null));
}

function findExistingListing(existingListings, scraped) {
  return existingListings.find(
    (listing) =>
      listing.id === scraped.id ||
      listing.canonicalUrl === scraped.canonicalUrl ||
      listing.sourceUrl === scraped.sourceUrl,
  );
}

function extractJsonById(html, id) {
  const regex = new RegExp(`<script[^>]*id="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)<\\/script>`, "i");
  const match = html.match(regex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonLdObjects(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  return matches
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function extractCanonicalUrl(html) {
  const match = html.match(/<link rel="canonical" href="([^"]+)"/i);
  return match?.[1] ?? null;
}

function normalizeImages(imageValue) {
  const images = Array.isArray(imageValue) ? imageValue : imageValue ? [imageValue] : [];
  return images
    .map((entry) => (typeof entry === "string" ? entry : entry?.url))
    .filter(Boolean);
}

function extractListingId(canonicalUrl) {
  const match = canonicalUrl.match(/\/home\/(\d+)/i);
  return match?.[1] ?? createHash("sha1").update(canonicalUrl).digest("hex").slice(0, 12);
}

function collectUrls(argvUrls, envUrls) {
  return [...argvUrls, ...envUrls.split(/[\r\n,\s]+/)]
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("http://") || entry.startsWith("https://"));
}

async function readStore() {
  try {
    const text = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(text);
    return {
      updatedAt: parsed.updatedAt ?? null,
      listings: Array.isArray(parsed.listings) ? parsed.listings : [],
    };
  } catch {
    return { updatedAt: null, listings: [] };
  }
}

function cleanText(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("**", "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatus(value) {
  return String(value ?? "active")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function stripQuery(value) {
  const url = new URL(value);
  url.search = "";
  return url.toString();
}

function fallbackTitleFromUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? "Untitled listing";
  } catch {
    return "Untitled listing";
  }
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function sortListings(left, right) {
  const leftStatus = normalizeStatus(left.status);
  const rightStatus = normalizeStatus(right.status);
  const leftInactive = Number(["pending", "sold", "off-market"].includes(leftStatus));
  const rightInactive = Number(["pending", "sold", "off-market"].includes(rightStatus));

  if (leftInactive !== rightInactive) {
    return leftInactive - rightInactive;
  }

  const rightPrice = right.price ?? 0;
  const leftPrice = left.price ?? 0;
  if (rightPrice !== leftPrice) {
    return rightPrice - leftPrice;
  }

  return String(left.title ?? "").localeCompare(String(right.title ?? ""));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function titleCase(text) {
  return String(text ?? "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
