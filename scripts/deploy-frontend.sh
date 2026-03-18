#!/bin/bash
set -e

echo "Building frontend..."
cd "$(dirname "$0")/../frontend"
npm ci
npm run build

echo "Syncing to S3..."
aws s3 sync dist/ s3://filterbrr-frontend --delete --region us-east-1

echo "Invalidating CloudFront cache..."
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, 'filterbrr.com')]].Id" \
  --output text)

if [ -n "$DIST_ID" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
  echo "Cache invalidation started for distribution $DIST_ID"
else
  echo "Warning: CloudFront distribution not found — skipping invalidation"
fi

echo "Frontend deployed!"
