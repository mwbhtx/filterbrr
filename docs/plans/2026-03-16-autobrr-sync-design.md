# Autobrr Sync & Multi-User Design

## Overview

Add the ability for users to connect their autobrr instance to the dashboard, pull/push filters via the autobrr API, and manage filter sync state. The app becomes a multi-user SaaS management layer — each user brings their own autobrr.

## Architecture

### Backend (FastAPI)

All autobrr interaction and business logic lives in the backend. Frontend is a thin client.

**New modules:**
- `autobrr_service.py` — Handles all autobrr API calls (list filters, get filter, update filter, create filter)
- `sync.py` — Sync logic: diff local vs remote, resolve matches by name with `[AUTO]` prefix
- `settings_service.py` — CRUD for user settings (autobrr URL, API key) stored in DynamoDB

### Auth & Multi-tenancy

**AWS Cognito:**
- User pool with email/password signup
- Cognito issues JWTs — frontend stores the token, sends it on every API call
- Backend validates JWT on every request, extracts `user_id`
- Free tier covers first 50,000 MAUs

**DynamoDB single-table design:**
- Partition key: `PK` = `USER#<user_id>`
- Sort key: `SK` for different record types:
  - `SK=SETTINGS` — User's autobrr URL + encrypted API key
  - `SK=FILTER#<filter_id>` — Local filter data
  - `SK=SYNC#<filter_id>` — Sync state (remote autobrr filter ID, last synced timestamp, status)

**Security:**
- All endpoints are user-scoped via JWT
- Autobrr API key encrypted at rest in DynamoDB (KMS or Fernet)
- No user can access another user's data
- API key never returned in full to frontend after initial save

### Local Development

- DynamoDB Local via Docker
- Auth bypassed locally with a hardcoded dev user ID, or Cognito dev user pool

## Filter Naming Convention

Filters managed by this app are prefixed with `[AUTO]` in autobrr (e.g., `[AUTO] fl-freeleech-tier-3-medium-priority`). This prevents accidental overwrites of manually-managed filters in autobrr.

## API Endpoints

### Settings (user-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Return user settings (API key masked) |
| PUT | `/api/settings` | Update settings, encrypt API key |

### Autobrr Sync (user-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/autobrr/status` | Test connection to user's autobrr instance |
| GET | `/api/autobrr/filters` | Pull all filters from autobrr with sync status |
| POST | `/api/autobrr/pull` | Pull all remote filters into local storage |
| POST | `/api/autobrr/pull/{filter_id}` | Pull a single filter |
| POST | `/api/autobrr/push` | Push all local filter changes to autobrr |
| POST | `/api/autobrr/push/{filter_id}` | Push a single filter |

### Existing Endpoints (become user-scoped)

All existing filter and simulation endpoints scoped to authenticated user via JWT.

## Sync Logic

1. Fetch all remote filters from autobrr API
2. Match local <-> remote by name (with `[AUTO]` prefix)
3. For each filter, compute status: `in_sync`, `local_ahead`, `remote_ahead`, `local_only`, `remote_only`
4. **Pull** = overwrite local with remote data, update sync state
5. **Push** = overwrite remote with local data via autobrr API, update sync state

## Frontend Pages

### Sync Page

- Connection status banner at top (green/red)
- Filter table with columns: Name, Source (local/remote/both), Status, Last Synced
- Checkbox selection for bulk operations
- "Pull Selected" and "Push Selected" buttons
- "Pull All" and "Push All" as convenience actions
- Individual pull/push icon buttons per row

### Settings Page

- Form: Autobrr URL, API Key (masked input)
- "Test Connection" button — calls `GET /api/autobrr/status`, shows success/error inline
- "Save" button
- Connection status indicator persists in app header/nav

## AWS Deployment

- **Compute:** ECS Fargate or Lambda (TBD)
- **Auth:** Cognito user pool
- **Database:** DynamoDB (single-table, per-user partitioning)
- **Secrets:** API keys encrypted via KMS or Fernet key stored in Secrets Manager
