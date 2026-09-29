
# Fuel Tracker Bulgaria

A full-stack fuel price tracking platform built around validated, traceable observations rather than placeholder data.

## Overview

Fuel Tracker Bulgaria collects fuel-price observations, validates them before persistence, and exposes the data through a cached API and Next.js dashboard.

The architecture is designed to make the age, source and quality of an observation explicit instead of presenting stale or missing data as current information.

    Authorised source
          ↓
    Source adapter
          ↓
    Normalisation (BGN / EUR)
          ↓
    Validation & outlier checks
          ↓
    Immutable observations + change log
          ↓
    PostgreSQL / Prisma
          ↓
    Cached API
          ↓
    Next.js dashboard

## Engineering Highlights

- Isolated source adapters so individual providers can fail without taking down the collection pipeline.
- BGN/EUR normalisation using Bulgaria's fixed lev exchange rate.
- Validation and outlier checks before data is persisted.
- Immutable price observations and station-level change tracking.
- Audit-oriented metadata including source, URL, timestamp, confidence and fetch state.
- Bearer-protected collection endpoint.
- API-first architecture with a cached read layer for the dashboard.
- Explicit handling of missing and stale observations.
- Road-distance based nearby-station comparison.
- Destination geocoding and trip planning with detour-cost comparison.
- Provider fallback behaviour so the nearby-station experience remains usable when routing data is unavailable.

## Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | Next.js API routes, Node.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Routing | OSRM-compatible routing service |
| Geocoding | Nominatim / OpenStreetMap |

## API

Implemented endpoints include:

- GET /api/fuels/diesel
- GET /api/fuels/diesel/history?days=30
- GET /api/prices/latest
- GET /api/prices/cheapest
- GET /api/prices/changes
- GET /api/stations
- GET /api/stations/:id
- GET /api/stations/:id/history
- GET /api/news
- GET /api/market-data
- POST /api/routing
- POST /api/geocode
- POST /api/trip
- GET /api/admin/sources
- POST /api/collect

The collection endpoint is protected by a bearer secret. Administrative endpoints use HTTP Basic Auth in production.

## Local Development

Requirements:

- Node.js 20+
- PostgreSQL 16+

    git clone https://github.com/MihailKanev01/fuel-tracker-bulgaria.git
    cd fuel-tracker-bulgaria

    cp .env.example .env
    npm install

    npm run db:generate
    npm run db:migrate
    npm run dev

## Configuration

Production deployments use environment variables for database access, collection secrets, administrative credentials and routing configuration.

The application also supports an authorised CSV source with:

    name,address,city,brand,region,latitude,longitude,fuel,price,currency,observed_at,url

## Production Notes

External collection sources must be explicitly reviewed for their terms, licence, robots policy and rate limits before they are enabled.

For higher traffic, use a dedicated or self-hosted routing service instead of relying on a public routing endpoint.

Operational hardening still includes areas such as scheduled retries, backups, monitoring, secrets management and role-based administrative access.

## Project Status

The repository contains the application foundation, data model, API layer and dashboard architecture. External providers must be explicitly vetted and configured before their data is collected.

## License

See [LICENSE](LICENSE).
