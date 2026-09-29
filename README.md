# Fuel Tracker Bulgaria

A production-oriented foundation for a diesel-price tracking platform focused on trustworthy, auditable observations rather than placeholder data.

## What it does

The application is designed around a simple rule: the dashboard should show validated observations from the database and clearly distinguish missing or stale data from live information.

The data flow is:

```text
Authorised source
      ↓
Source adapter
      ↓
Normalisation (BGN / EUR)
      ↓
Validation & outlier checks
      ↓
Immutable price observations + change log
      ↓
PostgreSQL / Prisma
      ↓
Cached API
      ↓
Next.js dashboard
```

## Engineering highlights

- Isolated `SourceAdapter` implementations so one provider can fail without taking down the collection pipeline.
- BGN/EUR normalisation using the fixed Bulgarian lev exchange rate.
- Validation and outlier checks before data is persisted.
- Immutable price observations and station-level change tracking.
- Audit-oriented metadata such as source, original URL, timestamp, confidence and fetch state.
- Bearer-protected collection endpoint.
- API-first architecture with a cached read layer for the dashboard.
- Explicit handling of missing or stale observations instead of presenting them as current prices.

## Stack

**Frontend:** Next.js, React, TypeScript  
**Backend:** Next.js API routes  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Runtime:** Node.js 20+

## API surface

Implemented endpoints include:

- `GET /api/fuels/diesel`
- `GET /api/fuels/diesel/history?days=30`
- `GET /api/prices/latest`
- `GET /api/prices/cheapest`
- `GET /api/prices/changes`
- `GET /api/stations`
- `GET /api/stations/:id`
- `GET /api/stations/:id/history`
- `GET /api/news`
- `GET /api/market-data`
- `GET /api/admin/sources`
- `POST /api/collect`

The collection endpoint is protected by a bearer secret.

## Local development

Requirements:

- Node.js 20+
- PostgreSQL 16+

Setup:

```bash
git clone https://github.com/MihailKanev01/fuel-tracker-bulgaria.git
cd fuel-tracker-bulgaria

cp .env.example .env
npm install

npm run db:generate
npm run db:migrate
npm run dev
```

The app can also consume an authorised CSV source with the following columns:

```text
name,address,city,brand,region,latitude,longitude,fuel,price,currency,observed_at,url
```


### Production environment

Set these environment variables before deploying:

- `DATABASE_URL` — PostgreSQL connection string.
- `COLLECTOR_SECRET` — protects the manual `POST /api/collect` endpoint.
- `CRON_SECRET` — protects the scheduled `GET /api/cron/collect` endpoint. The cron endpoint fails closed when this is missing.
- `ADMIN_USER` and `ADMIN_PASSWORD` — HTTP Basic Auth credentials for `/admin` and `/api/admin/*` in production.

The database debug endpoint `/api/debug/db` is development-only and returns 404 in production.

## Production considerations

Automated collection should only be configured for sources whose terms, licence, robots policy and rate limits permit it.

Before production rollout, the project should also have:

- scheduled/queued collection with retries and per-domain rate limits
- database backup and migration procedures
- monitoring and alerting
- secrets management
- authentication and RBAC for administrative operations
- a verified notification/delivery worker for alerts

## Project status

The repository contains the application foundation, data model, API layer and dashboard architecture. External providers must be explicitly vetted and configured before their data is collected.

## License

See [LICENSE](LICENSE).
