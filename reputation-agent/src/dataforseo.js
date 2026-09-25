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
    // Deterministic fixtures: exercise filters and the full UI flow without paid API calls.
    const maxStars = Number(campaign.reviewFilters?.maxStars || 2);
    const fixtures = [
      { businessName: 'Sandbox Zahnarzt Beispiel', website: 'https://example.com', email: 'kontakt@example.com', phone: '+49 431 000001', address: 'Beispielstraße 1, Kiel', profileUrl: 'https://www.google.com/maps', profileRating: 4.6, totalReviews: 87, placeId: 'sandbox_place_1', rating: 1, text: 'Ich war nie Kunde dieses Unternehmens und kann die Leistung nicht beurteilen.', reviewUrl: 'https://www.google.com/maps/reviews/sandbox-1', reviewAuthor: 'Test Nutzer 1', reviewId: 'sandbox_review_1', ownerAnswer: '' },
      { businessName: 'Sandbox Praxis Beispiel', website: 'https://example.org', email: 'info@example.org', phone: '+49 431 000002', address: 'Musterweg 2, Kiel', profileUrl: 'https://www.google.com/maps', profileRating: 4.3, totalReviews: 42, placeId: 'sandbox_place_2', rating: 2, text: 'Abzocke. Nie wieder. Keine weiteren Angaben.', reviewUrl: 'https://www.google.com/maps/reviews/sandbox-2', reviewAuthor: 'Test Nutzer 2', reviewId: 'sandbox_review_2', ownerAnswer: '' },
      { businessName: 'Sandbox Mit Antwort', website: 'https://example.net', email: 'mail@example.net', profileRating: 4.7, totalReviews: 61, placeId: 'sandbox_place_3', rating: 1, text: 'Sehr schlechte Erfahrung.', reviewUrl: 'https://www.google.com/maps/reviews/sandbox-3', reviewAuthor: 'Test Nutzer 3', reviewId: 'sandbox_review_3', ownerAnswer: 'Vielen Dank für Ihr Feedback.' },
      { businessName: 'Sandbox Gute Bewertung', website: 'https://example.edu', email: 'mail@example.edu', profileRating: 4.8, totalReviews: 100, placeId: 'sandbox_place_4', rating: 5, text: 'Alles bestens.', reviewUrl: 'https://www.google.com/maps/reviews/sandbox-4', reviewAuthor: 'Test Nutzer 4', reviewId: 'sandbox_review_4', ownerAnswer: '' }
    ];
    return fixtures.filter(x => x.rating <= maxStars && !x.ownerAnswer);
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
