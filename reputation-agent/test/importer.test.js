import test from 'node:test';
import assert from 'node:assert/strict';
import { importRows } from '../src/importer.js';

const campaign = {
  id: 'c1',
  reviewFilters: { maxStars: 2, minReviewCount: 5, onlyWithReviewText: true },
  leadFilters: { requireWebsite: true, requireEmail: true }
};

test('filters rows and imports eligible leads', () => {
  const r = importRows([
    { businessName: 'A', website: 'x', email: 'a@b.de', totalReviews: 10, rating: 1, text: 'Ich war nie Kunde' },
    { businessName: 'B', website: 'x', email: '', totalReviews: 10, rating: 1, text: 'Ich war nie Kunde' },
    { businessName: 'C', website: 'x', email: 'c@d.de', totalReviews: 10, rating: 5, text: 'Top' }
  ], campaign);
  assert.equal(r.length, 1);
  assert.equal(r[0].business.name, 'A');
});
