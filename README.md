# Filterbrr

A SaaS platform for managing and optimising torrent filters on private trackers. Filterbrr scrapes tracker listings, analyses seeding trends, and automatically generates and synchronises intelligent filter configurations to [autobrr](https://autobrr.com).

**Stack:** React 19 · NestJS · AWS Lambda · DynamoDB · S3 · Terraform · TypeScript end-to-end

---

## Features

- **Scraper** — Authenticates to private trackers and scrapes torrent listings into structured datasets
- **Analyser** — Calculates percentile-based filter tiers from scrape data to maximise seeding efficiency
- **Simulator** — Back-tests filter configurations against historical datasets before deploying
- **Sync** — Pushes validated filters directly to autobrr via API
- **Multi-user** — Per-user data isolation via AWS Cognito + DynamoDB partition keys

---

## Architecture

```
Browser (React + Vite)
    │
    ▼
API Gateway → NestJS (Lambda)
    │
    ├── DynamoDB   (settings, filters, sync state)
    └── S3         (scrape datasets, generated filters)

Async Lambdas:
    Scraper Lambda → S3 CSV
    Analyser Lambda → S3 JSON filters
```

---

**Local Development**

### Prerequisites

- Node.js 20+
- Docker (for local AWS services)

### Setup

**1. Create env files**

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

The backend runs with `NODE_ENV=local` which bypasses Cognito auth. The frontend `.env.local` needs real Cognito values to load — fill in `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_CLIENT_ID` from your AWS Cognito User Pool, otherwise the app will show a white screen.

**2. Start services**

```bash
# Start DynamoDB Local + LocalStack S3
docker compose up -d
```

On first run, LocalStack will automatically create the `filterbrr-userdata` S3 bucket via the init script in `localstack-init/`. DynamoDB tables (`UserSettings`, `Filters`, `SyncState`) are created automatically by the backend on startup. Data persists across restarts via Docker named volumes.

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
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```



**Deployment**

Filterbrr is deployed to AWS using Terraform. Infrastructure includes:

- **API Gateway + Lambda** — NestJS backend via serverless-express
- **S3** — Dataset and filter storage
- **DynamoDB** — User data with per-user partition keys
- **Cognito** — Email/password auth with JWT validation
- **CloudFront + S3** — Frontend CDN hosting

```bash
cd infra
terraform init
terraform apply
```

> Requires AWS credentials with appropriate IAM permissions.

