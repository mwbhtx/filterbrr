#!/bin/bash
set -e

echo "Building filter-generator..."
cd "$(dirname "$0")/../lambdas/filter-generator"
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
rm -f ../../infrastructure/.build/filter-generator.zip
cd dist
cp ../package.json .
npm ci --production --prefix .
zip -rq ../../../infrastructure/.build/filter-generator.zip . -x "*.map"
rm -rf node_modules package.json

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-filter-generator \
  --zip-file fileb://../../../infrastructure/.build/filter-generator.zip \
  --region us-east-1

echo "Filter-generator deployed!"
