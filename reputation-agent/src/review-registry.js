import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.REPUTATION_DATA_DIR || path.join(process.cwd(), 'data');
const registryFile = path.join(dataDir, 'review-registry.json');

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(registryFile)) {
    fs.writeFileSync(registryFile, JSON.stringify({ reviews: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(registryFile, 'utf8'));
}

function writeStore(store) {
  ensureStore();
  const temp = `${registryFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, registryFile);
}

export function getReviewRecord(reviewId) {
  if (!reviewId) return null;
  return readStore().reviews[String(reviewId)] || null;
}

export function hasBeenContacted(reviewId) {
  const record = getReviewRecord(reviewId);
  return Boolean(record?.firstContactAt);
}

export function registerReview({ reviewId, businessId, businessName, reviewUrl, campaignId, metadata = {} }) {
  if (!reviewId) throw new Error('reviewId is required');
  const store = readStore();
  const key = String(reviewId);
  const existing = store.reviews[key] || {};
  store.reviews[key] = {
    ...existing,
    reviewId: key,
    businessId: businessId || existing.businessId || null,
    businessName: businessName || existing.businessName || null,
    reviewUrl: reviewUrl || existing.reviewUrl || null,
    campaignId: campaignId || existing.campaignId || null,
    discoveredAt: existing.discoveredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { ...(existing.metadata || {}), ...metadata }
  };
  writeStore(store);
  return store.reviews[key];
}

export function markFirstContact(reviewId, channel = 'email') {
  const store = readStore();
  const key = String(reviewId);
  if (!store.reviews[key]) throw new Error(`Unknown reviewId: ${key}`);
  if (!store.reviews[key].firstContactAt) {
    store.reviews[key].firstContactAt = new Date().toISOString();
    store.reviews[key].firstContactChannel = channel;
  }
  store.reviews[key].updatedAt = new Date().toISOString();
  writeStore(store);
  return store.reviews[key];
}

export function shouldSendFirstOutreach(reviewId) {
  if (!reviewId) return false;
  return !hasBeenContacted(reviewId);
}
