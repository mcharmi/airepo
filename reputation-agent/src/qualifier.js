const POLICY_PATTERNS = [
  { reason: 'spam_or_fake', score: 3, words: ['fake', 'gekauft', 'bot', 'spam', 'nie kunde', 'nie dort', 'war nie da', 'kenne ich nicht'] },
  { reason: 'harassment_or_insult', score: 3, words: ['betrüger', 'abzocker', 'idiot', 'verbrecher', 'kriminell', 'drecksladen'] },
  { reason: 'conflict_of_interest', score: 2, words: ['mitbewerber', 'konkurrent', 'ex-mitarbeiter', 'ex mitarbeiter'] },
  { reason: 'personal_data', score: 3, words: ['telefonnummer', 'adresse', 'handynummer', 'private adresse'] },
  { reason: 'factual_claim_check', score: 1, words: ['immer', 'nie', 'garantiert', 'absichtlich', 'vorsätzlich'] }
];

export function qualifyReview(review = {}) {
  const text = String(review.text || '').trim();
  const rating = Number(review.rating || 0);
  const lower = text.toLowerCase();
  const reasons = [];
  let score = 0;

  for (const rule of POLICY_PATTERNS) {
    if (rule.words.some((word) => lower.includes(word))) {
      reasons.push(rule.reason);
      score += rule.score;
    }
  }

  if (rating > 0 && rating <= 2) score += 1;
  if (text.length < 12 && rating <= 2) {
    reasons.push('low_context_review');
    score += 1;
  }

  const qualified = reasons.some((r) => ['spam_or_fake', 'harassment_or_insult', 'conflict_of_interest', 'personal_data'].includes(r));

  return {
    qualified,
    score,
    reasons: [...new Set(reasons)],
    requiresHumanCheck: true,
    note: qualified
      ? 'Potenzieller Richtlinien- oder Rechtsfall. Vor Versand und Einreichung verifizieren.'
      : 'Keine belastbare Löschgrundlage automatisch erkannt. Nicht aktiv als löschbar bewerben.'
  };
}

export function buildOutreachDraft({ business, review, caseId, orderUrl }) {
  const excerpt = String(review.text || '').trim().slice(0, 500);
  const reasons = (review.qualification?.reasons || []).join(', ') || 'manuelle Prüfung erforderlich';
  return {
    subject: `Hinweis zu einer kritischen Google-Bewertung bei ${business.name}`,
    text: `Guten Tag,\n\nbei Ihrem Google-Unternehmensprofil ist uns folgende kritische Bewertung aufgefallen:\n\n„${excerpt}“\n\nUnsere Vorprüfung hat mögliche Beanstandungspunkte ergeben: ${reasons}. Ob Google die Bewertung tatsächlich entfernt, entscheidet Google nach Prüfung.\n\nWir übernehmen die Prüfung und das komplette zulässige Entfernungsverfahren. Sie zahlen 79,00 EUR netto ausschließlich dann, wenn die konkrete Bewertung erfolgreich entfernt wurde.\n\nAuftrag prüfen und freigeben: ${orderUrl}\n\nFall-ID: ${caseId}\n\nFreundliche Grüße`
  };
}
