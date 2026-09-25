const STRONG_REASONS = new Set(['spam_or_fake','harassment_or_insult','personal_data']);
const MEDIUM_REASONS = new Set(['conflict_of_interest','factual_claim_check']);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Internal prioritisation score, not a statistical removal probability.
 * Only uses observable case factors. Local Guide status is intentionally
 * not penalised because Google does not document a lower removal likelihood.
 */
export function scoreRemovalCase({ review = {}, businessProfile = {}, evidence = {} } = {}) {
  const reasons = new Set(review.qualification?.reasons || []);
  let score = 10;
  const factors = [];

  for (const reason of reasons) {
    if (STRONG_REASONS.has(reason)) {
      score += 20;
      factors.push({ factor: reason, impact: 20 });
    } else if (MEDIUM_REASONS.has(reason)) {
      score += 10;
      factors.push({ factor: reason, impact: 10 });
    }
  }

  if (evidence.customerRecord === false) {
    score += 20;
    factors.push({ factor: 'no_customer_record_confirmed', impact: 20 });
  }
  if (evidence.competitorEvidence === true) {
    score += 15;
    factors.push({ factor: 'competitor_evidence', impact: 15 });
  }
  if (evidence.personalDataConfirmed === true) {
    score += 20;
    factors.push({ factor: 'personal_data_confirmed', impact: 20 });
  }
  if (evidence.documentsAvailable === true) {
    score += 10;
    factors.push({ factor: 'supporting_documents', impact: 10 });
  }

  const totalReviews = Number(businessProfile.totalReviews || 0);
  const lowRatingReviews = Number(businessProfile.lowRatingReviews || 0);
  if (totalReviews >= 10 && lowRatingReviews / totalReviews >= 0.35) {
    score -= 15;
    factors.push({ factor: 'many_negative_reviews_on_profile', impact: -15 });
  }

  if (!String(review.text || '').trim()) {
    score -= 10;
    factors.push({ factor: 'no_review_text', impact: -10 });
  }

  const finalScore = clamp(score);
  const band = finalScore >= 70 ? 'high' : finalScore >= 45 ? 'medium' : 'low';

  return {
    score: finalScore,
    band,
    factors,
    isProbability: false,
    localGuidePenaltyApplied: false,
    note: 'Interner Prioritätswert auf Basis beobachtbarer Faktoren, keine statistische Löschwahrscheinlichkeit.'
  };
}
