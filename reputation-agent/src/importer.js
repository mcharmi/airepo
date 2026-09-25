import { qualifyReview } from './qualifier.js';
import { id } from './store.js';

function norm(v) { return String(v ?? '').trim(); }

export function importRows(rows, campaign) {
  const out = [];
  for (const row of rows) {
    const rating = Number(row.reviewRating ?? row.rating ?? 0);
    const text = norm(row.reviewText ?? row.text);
    const totalReviews = Number(row.totalReviews ?? 0);
    const profileRating = Number(row.profileRating ?? 0);

    if (!norm(row.businessName)) continue;
    if (campaign.reviewFilters?.onlyWithReviewText && !text) continue;
    if (campaign.reviewFilters?.maxStars && rating > campaign.reviewFilters.maxStars) continue;
    if (campaign.reviewFilters?.minReviewCount && totalReviews < campaign.reviewFilters.minReviewCount) continue;
    if (campaign.reviewFilters?.minProfileRating && profileRating && profileRating < campaign.reviewFilters.minProfileRating) continue;
    if (campaign.reviewFilters?.maxProfileRating && profileRating && profileRating > campaign.reviewFilters.maxProfileRating) continue;
    if (campaign.leadFilters?.requireWebsite && !norm(row.website)) continue;
    if (campaign.leadFilters?.requireEmail && !norm(row.email)) continue;

    const review = {
      rating,
      text,
      url: norm(row.reviewUrl),
      author: norm(row.reviewAuthor)
    };
    const qualification = qualifyReview(review);

    out.push({
      id: id('case'),
      campaignId: campaign.id,
      status: qualification.candidate ? 'needs_review' : 'filtered',
      business: {
        name: norm(row.businessName),
        website: norm(row.website),
        email: norm(row.email),
        phone: norm(row.phone),
        address: norm(row.address)
      },
      profile: {
        url: norm(row.profileUrl),
        rating: profileRating || null,
        totalReviews: totalReviews || null
      },
      review: { ...review, qualification },
      createdAt: new Date().toISOString(),
      outreachApproved: false
    });
  }
  return out;
}
