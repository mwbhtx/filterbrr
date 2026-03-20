#!/bin/bash
set -e

echo "Building torrent-scraper..."
cd "$(dirname "$0")/../lambdas/torrent-scraper"
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
rm -f ../../infrastructure/.build/torrent-scraper.zip
cd dist
cp ../package.json .
npm ci --production --prefix .
zip -rq ../../../infrastructure/.build/torrent-scraper.zip . -x "*.map"
rm -rf node_modules package.json

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-torrent-scraper \
  --zip-file fileb://../../../infrastructure/.build/torrent-scraper.zip \
  --region us-east-1

echo "Torrent-scraper deployed!"
