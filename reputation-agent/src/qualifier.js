const RULES = [
  { id: 'possible_fake_or_no_customer_relationship', weight: 4, terms: ['nie kunde', 'nie kundin', 'war nie dort', 'kenne den laden nicht', 'fake bewertung'] },
  { id: 'possible_conflict_of_interest', weight: 4, terms: ['mitbewerber', 'konkurrent', 'ex-mitarbeiter', 'ex mitarbeiter', 'ehemaliger mitarbeiter'] },
  { id: 'possible_personal_data', weight: 4, terms: ['telefonnummer', 'handynummer', 'private adresse', 'wohnadresse'] },
  { id: 'possible_abuse_or_insult', weight: 3, terms: ['idiot', 'drecksladen', 'verbrecher', 'betrüger', 'abzocker'] },
  { id: 'factual_claim_needs_evidence_check', weight: 1, terms: ['immer', 'nie', 'absichtlich', 'vorsätzlich', 'garantiert'] }
];

export function qualifyReview(review = {}) {
  const text = String(review.text || '').trim();
  const rating = Number(review.rating || 0);
  const lower = text.toLowerCase();
  const hits = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.terms.some((term) => lower.includes(term))) {
      hits.push(rule.id);
      score += rule.weight;
    }
  }
  if (rating > 0 && rating <= 2) score += 1;
  if (text.length > 0 && text.length < 16 && rating <= 2) {
    hits.push('low_context_review');
    score += 1;
  }
  const substantive = hits.some((id) => id.startsWith('possible_'));
  return {
    candidate: substantive,
    score,
    reasons: [...new Set(hits)],
    requiresHumanCheck: true,
    summary: substantive
      ? 'Möglicher Beanstandungsgrund erkannt. Vor Ansprache und Einreichung manuell prüfen.'
      : 'Kein belastbarer Beanstandungsgrund automatisch erkannt.'
  };
}

export function buildOutreachDraft({ business, review, caseId, orderUrl }) {
  const excerpt = String(review.text || '').trim().slice(0, 400);
  return {
    subject: `Hinweis zu einer Google-Bewertung bei ${business.name}`,
    text: `Guten Tag,

bei Ihrem Google-Unternehmensprofil ist uns folgende Bewertung aufgefallen:

„${excerpt}“

Nach einer ersten technischen Vorprüfung kann eine genauere Prüfung sinnvoll sein. Eine Entfernung kann nicht garantiert werden und hängt von den Richtlinien bzw. der rechtlichen Prüfung sowie der Entscheidung von Google ab.

Wir übernehmen nach Beauftragung die Prüfung und das zulässige Entfernungsverfahren. Das Honorar beträgt 79,00 EUR netto und fällt nur an, wenn genau diese Bewertung erfolgreich entfernt wird.

Auftrag und Vollmacht: ${orderUrl}

Fall-ID: ${caseId}

Freundliche Grüße`
  };
}
