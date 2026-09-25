const authHeader = () => {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO credentials missing');
  return 'Basic ' + Buffer.from(login + ':' + password).toString('base64');
};

const apiBase = () => process.env.DATAFORSEO_MODE === 'sandbox'
  ? 'https://sandbox.dataforseo.com/v3'
  : 'https://api.dataforseo.com/v3';

async function request(path, options = {}) {
  const r = await fetch(apiBase() + path, {
    ...options,
    headers: {
      authorization: authHeader(),
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const json = await r.json();
  if (!r.ok || (json.status_code && json.status_code >= 40000)) {
    throw new Error(json.status_message || ('DataForSEO HTTP ' + r.status));
  }
  return json;
}

function itemsFrom(json) {
  return (json.tasks || []).flatMap(t => t.result || []).flatMap(r => r.items || []);
}

function businessToRow(x) {
  const rating = x.rating || {};
  return {
    businessName: x.title || x.name || '',
    website: x.url || x.domain || '',
    email: x.email || '',
    phone: x.phone || '',
    address: x.address || '',
    profileUrl: x.place_url || x.url || '',
    profileRating: Number(rating.value || x.rating_value || 0),
    totalReviews: Number(rating.votes_count || x.reviews_count || 0),
    placeId: x.place_id || x.cid || '',
    featureId: x.feature_id || ''
  };
}

function reviewToFields(x) {
  return {
    rating: Number(x.rating?.value || x.rating || 0),
    text: x.review_text || x.text || '',
    reviewUrl: x.review_url || x.url || '',
    reviewAuthor: x.profile_name || x.author || '',
    reviewId: x.review_id || x.id || '',
    ownerAnswer: x.owner_answer || x.owner_response || ''
  };
}

export async function searchDataForSeo(campaign) {
  if (process.env.DATAFORSEO_MODE === 'sandbox') {
    const reviews = await request('/business_data/google/reviews/task_get/00000000-0000-0000-0000-000000000000');
    const reviewItems = itemsFrom(reviews);
    const maxStars = Number(campaign.reviewFilters?.maxStars || 2);
    return reviewItems
      .map((r, i) => ({
        businessName: r.title || ('DataForSEO Sandbox Unternehmen ' + (i + 1)),
        website: r.domain || 'https://example.com',
        email: r.email || ('kontakt' + (i + 1) + '@example.com'),
        profileRating: Number(r.rating?.value || 4.5),
        totalReviews: Number(r.reviews_count || 10),
        placeId: r.place_id || '',
        ...reviewToFields(r)
      }))
      .filter(x => x.rating > 0 && x.rating <= maxStars && !x.ownerAnswer);
  }

  const payload = [{
    description: campaign.industry,
    title: campaign.industry,
    location_name: campaign.state,
    limit: 100
  }];
  const listings = await request('/business_data/business_listings/search/live', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const businesses = itemsFrom(listings).map(businessToRow);
  throw new Error('Live review expansion is disabled until sandbox validation is complete. Found ' + businesses.length + ' businesses.');
}
