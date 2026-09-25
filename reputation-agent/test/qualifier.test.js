import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyReview } from '../src/qualifier.js';

test('marks possible no-customer review as candidate', () => {
  const q = qualifyReview({ rating: 1, text: 'Ich war nie Kunde und kenne den Laden nicht' });
  assert.equal(q.candidate, true);
  assert.ok(q.score >= 4);
});

test('does not classify ordinary dissatisfaction as removable candidate', () => {
  const q = qualifyReview({ rating: 1, text: 'Die Wartezeit war mir persönlich zu lang.' });
  assert.equal(q.candidate, false);
});
