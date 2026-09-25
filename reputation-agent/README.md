# Reputation Agent MVP

MVP für den Workflow: Kampagne definieren, Review-Daten importieren, konservative Vorqualifizierung, menschliche Freigabe, personalisierten E-Mail-Entwurf erzeugen, vorausgefüllten Auftrag mit Vollmacht bereitstellen und akzeptierte Fälle an eine manuelle Removal-Bearbeitung übergeben.

## Wichtig

Die Software verspricht keine Entfernung. Automatische Klassifizierung ist nur eine Vorprüfung und jeder Fall bleibt vor Kontaktaufnahme und Einreichung menschlich zu prüfen. Der Versand unaufgeforderter Werbe-E-Mails ist absichtlich nicht automatisiert. Vor produktivem Outreach sind die jeweils geltenden wettbewerbs- und datenschutzrechtlichen Anforderungen zu prüfen.

## Start

```bash
npm install
npm test
npm start
```

Dann `http://localhost:3000` öffnen. `PUBLIC_BASE_URL` sollte im Deployment auf die öffentliche URL gesetzt werden. `DATA_FILE` kann auf einen persistenten Pfad zeigen.

## API

* `POST /api/campaigns`
* `POST /api/campaigns/:id/import` mit `{ "rows": [...] }`
* `POST /api/cases/:id/approve-outreach`
* `GET /api/orders/by-token/:token`
* `POST /api/orders/by-token/:token/accept`
* `GET /api/handoff`
* `GET /health`

## Erwartete Importfelder

`businessName`, `website`, `email`, `phone`, `address`, `profileUrl`, `profileRating`, `totalReviews`, `reviewRating` oder `rating`, `reviewText` oder `text`, `reviewUrl`, `reviewAuthor`.

Für die Suche in Google Maps/Google Business Profiles ist bewusst ein externer Datenlieferant vorgesehen. Der MVP koppelt die Discovery-Schicht über den Import, statt fragiles Scraping fest in den Kern zu verdrahten.
