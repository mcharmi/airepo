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
  const excerpt = String(review.text || '').trim().slice(0, 600);
  const stars = Number(review.rating || 0);

  return {
    subject: 'Hinweis zu einer Bewertung Ihres Google-Profils',
    text: `Guten Tag,

bei einer Prüfung Ihres Google-Unternehmensprofils ist uns folgende negative Bewertung aufgefallen:

„${excerpt}“
${stars ? stars + ' von 5 Sternen' : ''}

Google-Bewertungen prägen maßgeblich den ersten Eindruck potenzieller Kunden. Gerade eine einzelne negative Bewertung kann dabei überproportional auffallen und Interessenten bereits vor der ersten Kontaktaufnahme beeinflussen.

Wir sind eine Agentur mit Unternehmenssitz in Kiel und auf Reputationsmanagement und IT-Sicherheit spezialisiert. Wir haben bereits mehrere tausend unberechtigte Negativbewertungen für Unternehmen erfolgreich entfernen lassen.

Bei der oben genannten Bewertung sehen wir nach erster Prüfung konkrete Ansatzpunkte, die eine Entfernung ermöglichen könnten. Gemeinsam mit unserem Rechtsexperten können wir die weitere Prüfung und das vollständige Vorgehen gegenüber Google für Sie übernehmen.

Für Sie entsteht dabei kein Kostenrisiko: Wir berechnen 79 € netto ausschließlich bei erfolgreicher Entfernung. Bleibt die Bewertung bestehen, zahlen Sie nichts. Sie haben außerdem einen direkten Ansprechpartner bei uns und müssen sich um die weitere Abwicklung nicht kümmern.

Wenn Sie die Bewertung prüfen und entfernen lassen möchten:
${orderUrl}

Die Beauftragung dauert nur wenige Minuten. Anschließend übernehmen wir den Fall.

Falls Sie für das Google-Unternehmensprofil nicht selbst verantwortlich sind, leiten Sie diese Nachricht bitte kurz an die Geschäftsführung oder die zuständige Person weiter.

Freundliche Grüße,
Christopher Kühn
Mediaquadrat
Reputationsmanagement & IT-Sicherheit
24106 Kiel

Fall-ID: ${caseId}`
  };
}
