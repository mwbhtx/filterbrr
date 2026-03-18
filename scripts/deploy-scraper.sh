#!/bin/bash
set -e

echo "Building scraper..."
cd "$(dirname "$0")/../lambdas/scraper"
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
rm -f ../../infrastructure/.build/scraper.zip
cd dist
cp ../package.json .
npm ci --production --prefix .
zip -rq ../../../infrastructure/.build/scraper.zip . -x "*.map"
rm -rf node_modules package.json

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-scraper \
  --zip-file fileb://../../../infrastructure/.build/scraper.zip \
  --region us-east-1

echo "Scraper deployed!"
