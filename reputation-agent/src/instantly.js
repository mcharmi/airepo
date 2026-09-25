const base = 'https://api.instantly.ai/api/v2';

function key() {
  if (!process.env.INSTANTLY_API_KEY) throw new Error('INSTANTLY_API_KEY missing');
  return process.env.INSTANTLY_API_KEY;
}

export function instantlyConfigured() {
  return Boolean(process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_CAMPAIGN_ID);
}

async function call(path, options = {}) {
  const r = await fetch(base + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + key(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || body.error || ('Instantly HTTP ' + r.status));
  return body;
}

export async function addLead({ email, companyName, website, phone, personalization, payload = {} }) {
  if (!process.env.INSTANTLY_CAMPAIGN_ID) throw new Error('INSTANTLY_CAMPAIGN_ID missing');
  return call('/leads', {
    method: 'POST',
    body: JSON.stringify({
      campaign: process.env.INSTANTLY_CAMPAIGN_ID,
      email,
      company_name: companyName || undefined,
      website: website || undefined,
      phone: phone || undefined,
      personalization: personalization || undefined,
      payload
    })
  });
}


export async function createCampaignDraft(name = 'Mediaquadrat Reputation Management') {
  return call('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name,
      campaign_schedule: {
        schedules: [{
          name: 'Werktags',
          timing: { from: '09:00', to: '17:00' },
          days: { '0': false, '1': true, '2': true, '3': true, '4': true, '5': true, '6': false },
          timezone: 'Europe/Berlin'
        }]
      },
      email_gap: 10,
      daily_limit: 25,
      daily_max_leads: 25,
      stop_on_reply: true,
      stop_on_auto_reply: false,
      text_only: true,
      open_tracking: false,
      link_tracking: false,
      allow_risky_contacts: false
    })
  });
}
