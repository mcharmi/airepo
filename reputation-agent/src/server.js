import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, writeState, id } from './store.js';
import { importRows } from './importer.js';
import { buildOutreachDraft } from './qualifier.js';
import { searchDataForSeo } from './dataforseo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const baseUrl = () => process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const defaultCampaign = {
  name: 'Neue Kampagne',
  industry: 'Zahnarzt',
  country: 'DE',
  state: 'Nordrhein-Westfalen',
  cities: [],
  reviewFilters: {
    maxStars: 2,
    minProfileRating: 3.5,
    maxProfileRating: 5,
    minReviewCount: 5,
    onlyWithReviewText: true
  },
  leadFilters: {
    requireWebsite: true,
    requireEmail: true
  },
  priceNetEur: 79,
  billingModel: 'success_only'
};

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'reputation-agent', version: '0.2.0' });
});

app.get('/api/state', (_req, res) => res.json(readState()));
app.get('/api/config/default', (_req, res) => res.json(defaultCampaign));

app.post('/api/campaigns', (req, res) => {
  const state = readState();
  const c = {
    ...defaultCampaign,
    ...req.body,
    id: id('cmp'),
    createdAt: new Date().toISOString()
  };
  c.reviewFilters = {
    ...defaultCampaign.reviewFilters,
    ...(req.body.reviewFilters || {})
  };
  c.leadFilters = {
    ...defaultCampaign.leadFilters,
    ...(req.body.leadFilters || {})
  };
  state.campaigns.push(c);
  writeState(state);
  res.status(201).json(c);
});

app.post('/api/campaigns/:id/search', async (req, res) => {
  const state = readState();
  const c = state.campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'campaign_not_found' });
  try {
    const rows = await searchDataForSeo(c);
    const cases = importRows(rows, c);
    const eligible = cases.filter(x => !x.review.ownerAnswer);
    state.cases.push(...eligible);
    writeState(state);
    res.json({
      mode: process.env.DATAFORSEO_MODE || 'live',
      imported: eligible.length,
      candidates: eligible.filter(x => x.status === 'needs_review').length,
      ignoredOwnerAnswered: cases.length - eligible.length,
      cases: eligible
    });
  } catch (error) {
    console.error('DataForSEO search failed', error);
    res.status(502).json({ error: 'dataforseo_search_failed', message: error.message });
  }
});

app.post('/api/campaigns/:id/import', (req, res) => {
  const state = readState();
  const c = state.campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'campaign_not_found' });
  if (!Array.isArray(req.body.rows)) return res.status(400).json({ error: 'rows_must_be_array' });

  const cases = importRows(req.body.rows, c);
  state.cases.push(...cases);
  writeState(state);
  res.json({
    imported: cases.length,
    candidates: cases.filter(x => x.status === 'needs_review').length,
    cases
  });
});

app.post('/api/cases/:id/approve-outreach', (req, res) => {
  const state = readState();
  const c = state.cases.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'case_not_found' });
  if (!c.review.qualification.candidate) return res.status(409).json({ error: 'case_not_candidate' });

  c.outreachApproved = true;
  c.status = 'outreach_approved';
  c.approvedAt = new Date().toISOString();

  const campaign = state.campaigns.find(x => x.id === c.campaignId);
  const order = {
    id: id('ord'),
    caseId: c.id,
    token: id('tok'),
    status: 'pending',
    priceNetEur: campaign?.priceNetEur ?? 79,
    billingModel: 'success_only',
    createdAt: new Date().toISOString()
  };

  state.orders.push(order);
  c.orderId = order.id;
  c.outreachDraft = buildOutreachDraft({
    business: c.business,
    review: c.review,
    caseId: c.id,
    orderUrl: `${baseUrl()}/order.html?token=${encodeURIComponent(order.token)}`
  });

  writeState(state);
  res.json({ case: c, order, draft: c.outreachDraft });
});

app.get('/api/orders/by-token/:token', (req, res) => {
  const state = readState();
  const order = state.orders.find(x => x.token === req.params.token);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  const c = state.cases.find(x => x.id === order.caseId);
  res.json({ order, case: c });
});

app.post('/api/orders/by-token/:token/accept', (req, res) => {
  const state = readState();
  const order = state.orders.find(x => x.token === req.params.token);
  if (!order) return res.status(404).json({ error: 'order_not_found' });

  const { companyName, fullName, email, authorityAccepted, termsAccepted } = req.body;
  if (!companyName || !fullName || !email || authorityAccepted !== true || termsAccepted !== true) {
    return res.status(400).json({ error: 'missing_required_acceptance_fields' });
  }

  order.status = 'accepted_poa_signed';
  order.acceptedAt = new Date().toISOString();
  order.customer = { companyName, fullName, email };
  order.poa = {
    signerName: fullName,
    signedAt: order.acceptedAt,
    authorityAccepted: true,
    textVersion: 'v1'
  };

  const c = state.cases.find(x => x.id === order.caseId);
  if (c) c.status = 'manual_removal_ready';

  writeState(state);
  res.json({ ok: true, order, handoff: 'manual_removal_ready' });
});

app.get('/api/handoff', (_req, res) => {
  const state = readState();
  const items = state.orders
    .filter(o => o.status === 'accepted_poa_signed')
    .map(o => ({
      order: o,
      case: state.cases.find(c => c.id === o.caseId)
    }));
  res.json(items);
});

app.post('/api/demo', (_req, res) => {
  const state = readState();
  const c = {
    ...defaultCampaign,
    id: id('cmp'),
    name: 'Demo Zahnärzte NRW',
    createdAt: new Date().toISOString()
  };
  state.campaigns.push(c);

  const rows = [
    {
      businessName: 'Praxis Beispiel GmbH',
      website: 'https://example.org',
      email: 'kontakt@example.org',
      profileRating: 4.7,
      totalReviews: 124,
      rating: 1,
      text: 'Ich war nie Kunde. Trotzdem soll ich hier angeblich behandelt worden sein.',
      reviewUrl: 'https://example.org/review/1'
    },
    {
      businessName: 'Praxis Muster',
      website: 'https://example.net',
      email: 'mail@example.net',
      profileRating: 4.5,
      totalReviews: 80,
      rating: 2,
      text: 'Wartezeit war mir zu lang.',
      reviewUrl: 'https://example.net/review/2'
    }
  ];

  const cases = importRows(rows, c);
  state.cases.push(...cases);
  writeState(state);
  res.json({ campaign: c, cases });
});

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => console.log(`reputation-agent listening on ${port}`));
}

export default app;
