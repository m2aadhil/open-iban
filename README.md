# open-iban

[![Docker Hub](https://img.shields.io/docker/v/m2aadhil/open-iban?label=docker&logo=docker)](https://hub.docker.com/r/m2aadhil/open-iban)
[![Docker Image Size](https://img.shields.io/docker/image-size/m2aadhil/open-iban/latest)](https://hub.docker.com/r/m2aadhil/open-iban)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript port of [fourcube/goiban](https://github.com/fourcube/goiban) —
the validation/BIC-lookup service that powers `openiban.com`. Adds a web UI
for admins to refresh per-country bank register data, full audit logging,
authentication, rate limiting, and a complete test suite.

## Features

**Public API**
- `GET /validate/:iban?getBIC=true&validateBankCode=true` — IBAN validation (mod-97 + length + country) and optional BIC lookup
- `GET /calculate/:countryCode/:bankCode/:accountNumber` — build an IBAN
- `GET /countries` — supported countries + bank-data availability
- `GET /health` and `GET /metrics` (Prometheus)

**Admin (JWT, cookie)**
- `POST /admin/login` / `POST /admin/logout`
- `POST /admin/data/:country` — multipart upload of an official bank register file (DE/AT/BE/NL/CH/LU/LI). Replaces all rows for that source atomically.
- `GET /admin/data/status` — per-country row counts + last upload metadata
- `GET /admin/audit` — paginated audit log

**Supported countries with BIC lookup**: DE, AT, BE, NL, CH, LU, LI
**Supported countries for format-only validation**: 80+ (full ISO 13616 set)

## Quick start

### Docker (recommended)

```bash
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v ./data:/app/data \
  --name open-iban \
  m2aadhil/open-iban:latest

# Create admin user
docker exec -it open-iban node packages/server/dist/scripts/seedAdmin.js
```

Or with docker-compose:

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d
```

### From source

```bash
npm install
cp .env.example .env       # edit JWT_SECRET
npm run seed:admin         # interactively create an admin user
npm run dev                # API on :3000, web on :5173
```

Then open <http://localhost:5173>.

Run the test suite:

```bash
npm test
```

Run with Docker:

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
```

## Bank register data sources

| Country | Source | Format | URL |
|---|---|---|---|
| DE | Deutsche Bundesbank | fixed-width text (ISO-8859-1) | https://www.bundesbank.de/en/tasks/payment-systems/services/bank-sort-codes/download-bank-sort-codes |
| AT | Oesterreichische Nationalbank | CSV | https://www.oenb.at/en/Statistics/Standardized-Tables/Bank-and-Financial-Institutions/list-of-monetary-financial-institutions.html |
| BE | National Bank of Belgium | XLSX | https://www.nbb.be/en/payments-and-securities/payment-standards/bank-identification-codes |
| NL | Betaalvereniging Nederland | XLSX | https://www.betaalvereniging.nl |
| CH | Swiss National Bank | XLSX | https://www.six-group.com |
| LU | Banque centrale du Luxembourg | XLSX | https://www.bcl.lu |
| LI | Liechtenstein FMA | XLSX | https://www.fma-li.li |

Download the file, open the admin UI, pick the country, upload. The previous data
for that source is removed and replaced inside a single SQLite transaction.

## Improvements over the original goiban

1. Streamed parsing — never loads the whole register into memory before commit.
2. Atomic data refresh inside a transaction (no read-during-update inconsistencies).
3. Web UI for data management — original required a Go CLI on the host.
4. Full audit trail (DB-backed) with IP, user agent, hashed IBANs for public requests.
5. Admin authentication (argon2id + JWT in httpOnly cookie) and per-route rate limiting.
6. Prometheus metrics endpoint.
7. End-to-end TypeScript types via the `shared` workspace package.
8. Single-binary deployment via Docker; no MySQL needed (SQLite + WAL).

## Architecture

```
React SPA  →  Fastify API  →  SQLite (WAL)
                ↑
                ├── Validator (mod-97)
                ├── Calculator
                ├── BIC lookup (with DE "400" rule)
                ├── Parser registry (DE/AT/BE/NL/CH/LU/LI)
                └── Audit + Auth services
```

## License

MIT (same as the original goiban).
