# SaaS Architecture Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Three systems shipped in order:

1. **Ship 1** ✅ — Settings restructure (trackers, seedboxes, remove .env)
2. **Ship 2** — Auth + AWS deployment (Cognito, DynamoDB, S3, per-user isolation)
3. **Ship 3** — qBittorrent watcher (background poller, time-series data, dashboard tab)

---

## Auth (Ship 2)

**AWS Cognito User Pools — email + password only.**

- Users sign up and log in with email + password
- Cognito issues JWTs (access + refresh tokens)
- Frontend stores tokens, attaches `Authorization: Bearer <token>` to every API request
- FastAPI backend validates JWT on every request, extracts `user_id` (Cognito `sub` claim)
- All data operations are scoped to `user_id` — users can never see each other's data

No social login for now. Can be added later via Cognito federated identities.

---

## Data Storage (Ship 2)

### DynamoDB — structured, frequently queried data

All tables use `user_id` as partition key.

| Table | PK | SK | Data |
|-------|----|----|------|
| `UserSettings` | `user_id` | — | trackers, seedboxes, autobrr config |
| `Filters` | `user_id` | `filter_id` | filter JSON, source, version |
| `TorrentMetadata` | `user_id` | `torrent_hash` | name, size, category, added_on, tracker |
| `TorrentSnapshots` | `user_id#torrent_hash` | `timestamp` | upload_speed, dl_speed, ratio, uploaded, state. TTL = added_on + 7 days |

### S3 — blobs and historical aggregates

Bucket structure:
```
s3://tpa-userdata/
  {user_id}/
    datasets/
      torrents_data_freeleech_2026-03-17_1430.csv
    filters/
      generated/
        freeleech/
          tier-1-opportunistic.json
          analysis_results.json
    snapshots/
      {year}/{month}/{day}/{hour}/
        {user_id}_{torrent_hash}_agg.parquet
```

- **Datasets (CSV)** — uploaded after scrape, read by analysis script
- **Generated filters** — written by analysis script, read by dashboard
- **Snapshot aggregates** — 1-minute rollups written by archival Lambda after 2 hours, queried via Athena for historical charts

### Transition from files to cloud storage

Current backend reads/writes local files. Migration path:
- `settings_service.py` → DynamoDB `UserSettings`
- `filters.py` → DynamoDB `Filters`
- `datasets.py` → S3 bucket
- Analysis output → S3 bucket
- `.settings.json`, `.sync_state.json` → DynamoDB

---

## qBittorrent Watcher (Ship 3)

### Overview

Background polling service that connects to users' qBittorrent instances via their REST API, records torrent performance history, and serves it to the dashboard.

### Watcher Rules

- **Max 150 torrents monitored per user** — when at capacity, always evict the oldest by `added_on` to make room for new ones
- **7-day monitoring window** — torrents older than 7 days since `added_on` are ignored and evicted
- **Poll tiers based on torrent age:**

| Age since `added_on` | Poll interval | Reason |
|----------------------|---------------|--------|
| 0–1 hour | 10 seconds | Racing window — maximum resolution |
| 1–2 hours | 30 seconds | Activity winding down |
| 2 hours–7 days | 60 seconds | Long-tail seeding — low resolution sufficient |
| 7+ days | ignored | Evicted from monitoring |

- **On restart:** honour `added_on` for tier placement. Accept the gap in history for downtime periods.

### Polling Architecture

Single async polling loop using `asyncio` + `httpx.AsyncClient`. Runs on a dedicated t3.nano EC2 instance in a public subnet with outbound-only security group (no inbound rules).

```
Every 10 seconds:
  Load all users with qBittorrent configured
  For each user:
    Call qBit sync/maindata (incremental, uses rid)
    Discover new torrents → add to monitored set (evict oldest if at 150 cap)
    For each monitored torrent:
      Determine poll tier from age
      If (now - last_polled) >= tier_interval → record snapshot
  Write due snapshots to DynamoDB in batch
```

Concurrency: asyncio fan-out with semaphore cap (e.g. 200 concurrent qBit connections). At 500 users this keeps a full round well within the 10-second master interval.

### qBittorrent API Usage

- `GET /api/v2/auth/login` — authenticate (session cookie)
- `GET /api/v2/sync/maindata?rid={rid}` — incremental state, only changed torrents returned
- Store last `rid` per user in memory (reload from DynamoDB on restart)

### In-Memory State

The poller keeps per-user state in memory:

```python
{
  user_id: {
    "rid": 42,                          # last sync rid
    "session": httpx.AsyncClient,        # authenticated session
    "monitored": {
      torrent_hash: {
        "added_on": 1710000000,
        "last_polled": 1710003600,
        "last_snapshot": { ... }         # last written state
      }
    }
  }
}
```

On poller restart, reload `monitored` state from DynamoDB `TorrentMetadata` table.

### Data Written

**TorrentMetadata** (written once on discovery, updated on category change):
```json
{
  "user_id": "abc123",
  "torrent_hash": "def456",
  "name": "SomeRelease.S01E01.1080p.WEB-DL",
  "size_bytes": 2147483648,
  "category": "freeleech",
  "added_on": 1710000000,
  "tracker_type": "TorrentLeech"
}
```

**TorrentSnapshots** (written per poll tier interval):
```json
{
  "pk": "abc123#def456",
  "timestamp": 1710003610,
  "upload_speed": 15234567,
  "dl_speed": 0,
  "uploaded_bytes": 4831838208,
  "ratio": 2.25,
  "state": "uploading",
  "ttl": 1710604800
}
```

TTL = `added_on + 7 days` — DynamoDB auto-deletes at no cost.

### Archival (S3 + Athena for historical)

A Lambda runs hourly:
1. Queries DynamoDB for snapshots older than 2 hours
2. Aggregates to 1-minute buckets (avg/max upload speed, total uploaded, state)
3. Writes as Parquet to S3: `s3://tpa-userdata/{user_id}/snapshots/{year}/{month}/{day}/{hour}/`
4. Deletes archived records from DynamoDB (keeps only last 2 hours hot)

Frontend queries:
- **Last 2 hours** → DynamoDB (10s or 30s resolution)
- **Older** → Athena (1-minute resolution)

---

## Dashboard Tab: Watcher

Three views:

**Live** — current state of all monitored torrents. Updates every 10 seconds via polling the backend (or WebSocket). Shows: name, state, upload speed, ratio, age, tier badge.

**Torrent Detail** — click any torrent to see its full history chart. Upload speed over time, ratio progression, state timeline. Automatically selects the right data source (DynamoDB vs Athena) based on time range.

**Summary** — aggregate stats: total uploaded today, average ratio across active torrents, busiest hours heatmap.

---

## Deployment (Ship 2)

### Architecture

- **Frontend** — S3 + CloudFront (static assets, global CDN)
- **Backend API** — Lambda + API Gateway (HTTP API, serverless, pay per invocation)
- **Poller** — t3.nano EC2, always-on, public subnet, outbound-only security group
- **Archival Lambda** — triggered by EventBridge hourly rule
- **Cognito** — User Pool in same region, email + password only
- **DynamoDB** — on-demand billing, same region
- **S3** — single bucket, per-user prefix isolation
- **Athena + Glue** — historical snapshot queries, Parquet on S3
- **CloudWatch** — logs (7-day retention on all log groups), alarms for error rate + poller health
- **Route 53** — DNS for custom domain
- **ACM** — SSL certificate (free, auto-renewing)
- **CodePipeline + CodeBuild** — CI/CD from GitHub
- **SSM Session Manager** — shell access to poller EC2 (no SSH port, no bastion)

### Networking

- VPC with a single public subnet
- t3.nano poller has a public IP, security group with **no inbound rules**
- Lambda runs outside VPC (reaches DynamoDB/S3 natively via AWS endpoints)
- No NAT Gateway, no ALB, no bastion host

### Infrastructure as Code

**Terraform** — `infra/` directory in this repo.

```
infra/
  main.tf
  variables.tf
  outputs.tf
  modules/
    api/          # Lambda + API Gateway
    poller/       # EC2 t3.nano + security group + IAM role
    storage/      # DynamoDB tables + S3 bucket
    auth/         # Cognito User Pool
    cdn/          # CloudFront + S3 frontend bucket
    observability/ # CloudWatch log groups + alarms
```

State stored in S3 backend with DynamoDB locking table.

---

## Full Cost Estimate (no free tier)

### 100 Users/month

| Category | Services | Cost |
|----------|----------|------|
| Compute + API | t3.nano ($4) + Lambda ($0.50) + API Gateway ($0.05) | $4.55 |
| Storage | DynamoDB ($1.50) + S3 ($0.15) | $1.65 |
| Auth + CDN + DNS | CloudFront ($0.42) + Route 53 ($0.51) + ACM ($0) + Cognito ($0) | $0.93 |
| Data processing | Archival Lambda ($0.05) + EventBridge ($0.01) + Athena ($0.05) + Glue ($0.10) | $0.21 |
| Observability | CloudWatch Logs ($0.50) + Alarms ($0.50) | $1.00 |
| CI/CD | CodePipeline ($1.00) + CodeBuild ($0.50) | $1.50 |
| **Total** | | **~$10/month** |

### 500 Users/month

| Category | Services | Cost |
|----------|----------|------|
| Compute + API | t3.nano ($4) + Lambda ($2.50) + API Gateway ($0.25) | $6.75 |
| Storage | DynamoDB ($8.00) + S3 ($0.73) | $8.73 |
| Auth + CDN + DNS | CloudFront ($2.10) + Route 53 ($0.51) + ACM ($0) + Cognito ($0) | $2.61 |
| Data processing | Archival Lambda ($0.20) + EventBridge ($0.01) + Athena ($0.25) + Glue ($0.10) | $0.56 |
| Observability | CloudWatch Logs ($2.50) + Alarms ($0.50) | $3.00 |
| CI/CD | CodePipeline ($1.00) + CodeBuild ($0.50) | $1.50 |
| **Total** | | **~$23/month** |

**Worst-case at 500 users** (freeleech event spike): ~$30-35/month due to DynamoDB write bursts and CloudWatch log volume.

### Cost Notes

- **CloudWatch Logs** is the most unpredictable line item — set 7-day retention on all log groups from day one
- **Data transfer out** adds ~$1-2/month at 500 users (API responses via API Gateway)
- **DynamoDB** is the primary scaling cost — spikes during freeleech events when all users' hot-tier torrents write simultaneously
- Architecture requires no changes until ~1,000+ users, at which point split the poller to ECS Fargate
