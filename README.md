# Filterbrr

[filterbrr.com](https://filterbrr.com)

A SaaS platform for managing and optimising torrent filters on private trackers. Filterbrr scrapes tracker listings, analyses seeding trends, and automatically generates and synchronises intelligent filter configurations to [autobrr](https://autobrr.com).

**Stack:** React 19 · NestJS · AWS Lambda · DynamoDB · S3 · Cognito · Terraform · TypeScript end-to-end

---

## Features

- **Scraper** — Authenticates to private trackers and scrapes torrent listings into structured datasets
- **Analyser** — Calculates percentile-based filter tiers from scrape data to maximise seeding efficiency
- **Simulator** — Back-tests filter configurations against historical datasets with toggleable filter chips before deploying
- **Sync** — Pushes validated filters directly to autobrr via API
- **Demo mode** — Ephemeral per-user demo sessions with pre-seeded data, no signup required
- **Role-based access** — JWT role claims (`user`, `demo`, `admin`) with a strict ACL guard
- **Multi-user** — Per-user data isolation via AWS Cognito + DynamoDB partition keys
- **KMS encryption** — Sensitive fields (API keys, tracker passwords) encrypted at rest via AWS KMS

---

## Architecture

```
Browser (React + Vite)
    │
    ▼
Lambda Function URL → NestJS (Lambda)
    │
    ├── DynamoDB   (settings, filters, sync state, jobs, demo sessions)
    ├── S3         (scrape datasets, analysis reports)
    └── KMS        (field-level encryption for user secrets)

Async Lambdas:
    Scraper Lambda → S3 JSON dataset
    Analyser Lambda → S3 report + DynamoDB filters

Cognito:
    Pre-token trigger Lambda → injects role claim into JWTs
```

---

## Local Development

### Prerequisites

- Node.js 22+
- Docker (for local AWS services)

### Setup

**1. Create env files**

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

**Backend env vars** (`backend/.env.local`):

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `local` to enable local login endpoint |
| `COGNITO_REGION` | AWS region for Cognito |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `AWS_REGION` | AWS region for DynamoDB/S3 |
| `S3_BUCKET` | S3 bucket name for datasets |
| `KMS_KEY_ID` | KMS key alias for field encryption |
| `DEMO_JWT_SECRET` | Secret for signing demo/local JWTs (any string locally) |
| `LOCAL_ROLE` | Role assigned to local login — `user`, `demo`, or `admin` |

**Frontend env vars** (`frontend/.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID |

The frontend needs real Cognito values to load — fill in `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_CLIENT_ID` from your AWS Cognito User Pool.

### Local Login

When running locally, sign in with `local@filterbrr.com` and password `sCqGfiq4VoVmF&jd`. This creates a local JWT with the role from `LOCAL_ROLE` — no Cognito required. You can also click "Try Demo" to test the demo experience.

**2. Start services**

```bash
# Start DynamoDB Local + LocalStack S3 + local Lambda containers
docker compose up -d
```

On first run, LocalStack will automatically create the `filterbrr-userdata` S3 bucket via the init script in `localstack-init/`. DynamoDB tables are created automatically by the backend on startup. Data persists across restarts via Docker named volumes.

```bash
# Backend (port 3000)
cd backend
npm install
npm run start:dev

# Frontend (port 5173, proxies /api to backend)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Running Tests

```bash
cd backend && npm test
```

---

## Deployment

Deployed to AWS via Terraform and GitHub Actions CI/CD. Infrastructure includes:

- **Lambda Function URLs** — NestJS backend via serverless-express
- **S3** — Dataset and filter storage, frontend static hosting
- **DynamoDB** — User data with per-user partition keys + TTL for demo sessions
- **Cognito** — Email/password auth with pre-token trigger for role injection
- **KMS** — Field-level encryption for sensitive user settings
- **CloudFront** — Frontend CDN
- **GitHub OIDC** — Keyless deploys from GitHub Actions

```bash
cd infrastructure
terraform init
terraform apply
```

CI runs tests before any deploy. Failing tests block all deployments.
