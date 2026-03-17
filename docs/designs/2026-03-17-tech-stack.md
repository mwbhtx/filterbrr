# Tech Stack Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Full TypeScript stack end-to-end. React frontend, NestJS backend, DynamoDB for storage, deployed serverless on AWS with Terraform IaC.

---

## Frontend

| Concern | Technology |
|---------|-----------|
| Framework | React 19 |
| Language | TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS 4 |
| Component library | shadcn/ui (Radix UI primitives) |
| State management | Zustand |
| Server state / caching | TanStack Query |
| Charts | Recharts |
| Testing | Vitest + Testing Library |

**Patterns:**
- shadcn/ui components live in `dashboard/frontend/src/components/ui/` — copied in, not a runtime dependency
- Zustand stores for UI state (active filters, selected seedbox, navigation)
- TanStack Query for all API calls — handles caching, background refetch, loading/error states
- Page components in `src/pages/`, shared components in `src/components/`

---

## Backend API

| Concern | Technology |
|---------|-----------|
| Framework | NestJS |
| Language | TypeScript |
| Runtime | Node.js 20 |
| HTTP adapter | Express (NestJS default) |
| Validation | class-validator + class-transformer |
| Testing | Jest + Supertest |

**Patterns:**
- NestJS modules per domain: `auth`, `filters`, `datasets`, `simulation`, `settings`, `autobrr`, `sync`
- Guards for Cognito JWT validation
- DTOs with class-validator for all request bodies
- Dual entry point: `src/main.ts` (local HTTP server) + `src/lambda.ts` (Lambda handler via `@vendia/serverless-express`)

---

## Lambda Functions

Three standalone Lambda functions, each in their own directory under `lambdas/`:

| Function | Purpose | Key libraries |
|----------|---------|---------------|
| `scraper` | Scrapes TorrentLeech torrent listings | axios, cheerio |
| `analyser` | Analyses CSV dataset, generates tier filters | — (pure TS) |
| `archival` | Archives DynamoDB snapshots to S3 Parquet | @aws-sdk/client-dynamodb, @aws-sdk/client-s3 |

All Lambda functions use Node.js 20 runtime (ZIP deployment, no Docker required).

---

## Database & Storage

| Concern | Technology |
|---------|-----------|
| Database | DynamoDB (on-demand billing) |
| DynamoDB client | AWS SDK v3 Document Client |
| File storage | S3 |
| Historical queries | Athena + Glue Data Catalog |

**DynamoDB Tables:**

| Table | PK | SK | Data |
|-------|----|----|------|
| `UserSettings` | `user_id` | — | trackers, seedboxes, autobrr config |
| `Filters` | `user_id` | `filter_id` (UUID) | filter JSON, source, version |
| `TorrentMetadata` | `user_id` | `torrent_hash` | name, size, category, added_on, tracker |
| `TorrentSnapshots` | `user_id#torrent_hash` | `timestamp` | upload_speed, dl_speed, ratio, uploaded, state. TTL = added_on + 7 days |

**S3 Bucket (`tpa-userdata`):**
```
{user_id}/
  datasets/         # scraped CSV files
  filters/          # generated filter JSON
  snapshots/        # archived Parquet files
```

---

## Auth

| Concern | Technology |
|---------|-----------|
| Provider | AWS Cognito User Pools |
| Method | Email + password |
| Tokens | JWT (access + refresh) |
| Backend validation | NestJS Guard + Cognito JWKS endpoint |

- Frontend stores tokens in memory (access) and localStorage (refresh)
- Every API request includes `Authorization: Bearer <access_token>`
- NestJS `CognitoAuthGuard` validates JWT signature against Cognito JWKS, extracts `user_id` from `sub` claim
- Local dev: `DevAuthGuard` injects a hardcoded `user_id` — no Cognito needed locally

---

## Poller Service

| Concern | Technology |
|---------|-----------|
| Language | TypeScript + Node.js 20 |
| HTTP client | axios |
| Hosting | EC2 t3.nano (always-on) |
| Networking | Public subnet, outbound-only security group |

Standalone Node.js process, separate from the NestJS API. Polls users' qBittorrent instances every 10 seconds, writes snapshots to DynamoDB.

---

## Infrastructure

| Concern | Technology |
|---------|-----------|
| IaC | Terraform (`infra/` directory) |
| API hosting | Lambda + API Gateway (HTTP API) |
| Frontend hosting | S3 + CloudFront |
| Poller | EC2 t3.nano |
| DNS | Route 53 |
| SSL | ACM (auto-renewing) |
| Observability | CloudWatch Logs (7-day retention) + Alarms |
| CI/CD | CodePipeline + CodeBuild |
| Secrets | AWS Secrets Manager |

**Terraform structure:**
```
infra/
  main.tf
  variables.tf
  outputs.tf
  modules/
    api/            # Lambda + API Gateway
    poller/         # EC2 + security group + IAM
    storage/        # DynamoDB tables + S3 bucket
    auth/           # Cognito User Pool
    cdn/            # CloudFront + S3 frontend bucket
    observability/  # CloudWatch log groups + alarms
```

State stored in S3 backend with DynamoDB locking table.

---

## Local Development

| Service | Local equivalent |
|---------|-----------------|
| NestJS API | `npm run dev` on port 3000 |
| React frontend | Vite dev server on port 5173 (proxies `/api` → 3000) |
| DynamoDB | DynamoDB Local via Docker |
| S3 | LocalStack via Docker |
| Cognito | DevAuthGuard (bypasses auth, injects fake user_id) |
| Poller | `npm run dev` in `poller/` |

**docker-compose.yml** at repo root starts DynamoDB Local and LocalStack. Single `docker compose up -d` gets the data layer running.

---

## Cost Estimate (no free tier)

| Users | Monthly cost |
|-------|-------------|
| 10 | ~$5 |
| 100 | ~$10 |
| 500 | ~$23 |
| 500 (worst case, freeleech spike) | ~$35 |

Primary cost drivers: t3.nano ($4 flat), DynamoDB writes (scales with users), CloudWatch Logs.
