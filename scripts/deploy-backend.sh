#!/bin/bash
set -e

echo "Building backend..."
cd "$(dirname "$0")/../backend"
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../infrastructure/.build
rm -f ../infrastructure/.build/backend.zip
cd dist
cp ../package.json .
npm ci --production --prefix .
zip -rq ../../infrastructure/.build/backend.zip . -x "*.map"
rm -rf node_modules package.json

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-backend \
  --zip-file fileb://../../infrastructure/.build/backend.zip \
  --region us-east-1

echo "Backend deployed!"
