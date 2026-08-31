# Fuel Tracker Bulgaria

Production-oriented foundation for a transparent diesel-price tracker. The UI contains **no fixture data**: it only renders validated observations from PostgreSQL, and explicitly says `Няма данни` until an authorised source has supplied records.

## Architecture

```text
Authorised public source → isolated adapter → normalise BGN/EUR → validation/outlier rules
    → immutable Price observations + PriceChange log (PostgreSQL/Prisma) → cached read API → Next.js dashboard
```

- Each data provider implements `SourceAdapter`; a failing adapter cannot stop others.
- `ingest()` converts BGN at the fixed BGN/EUR rate, rejects implausible values, creates an immutable observation, and records every actual station-level change.
- `Source`, `FetchRun`, original URL, timestamp, confidence and error state provide auditability.
- The dashboard deliberately does not label stale records as live. Sources must be legally usable; check their licence, robots.txt and rate limits before configuration.

## Local start

1. Install Node.js 20+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Run `npm install`, `npm run db:generate`, `npm run db:migrate`, then `npm run dev`.
4. After vetting a public provider, set `PUBLIC_PRICE_CSV_URL` to an authorised CSV with this header:

   ```csv
   name,address,city,brand,region,latitude,longitude,fuel,price,currency,observed_at,url
   ```

5. Schedule `npm run collect` (for example every 10–15 minutes, respecting the provider's rate limit). Alternatively POST `/api/collect` with `Authorization: Bearer <COLLECTOR_SECRET>` from a trusted scheduler.

## API

`GET /api/fuels/diesel`, `/api/fuels/diesel/history?days=30`, `/api/prices/latest`, `/api/prices/cheapest`, `/api/prices/changes`, `/api/stations`, `/api/stations/:id`, `/api/stations/:id/history`, `/api/news`, `/api/market-data`, and `/api/admin/sources` are implemented. `POST /api/collect` is bearer-protected.

## Before deployment

- Add individual adapters under `src/lib/collectors/` only for sources that explicitly permit automated access; do not scrape private/unpublished endpoints.
- Put the collector behind a queue/scheduler with retries and per-domain rate limits, and add authentication/RBAC before exposing `/admin`.
- Run migration review, database backups, monitoring and secrets management. For external notifications, add a verified user identity and a delivery worker before enabling alerts.
