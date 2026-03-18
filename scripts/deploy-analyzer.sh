#!/bin/bash
set -e

echo "Building analyzer..."
cd "$(dirname "$0")/../lambdas/analyzer"
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
rm -f ../../infrastructure/.build/analyzer.zip
cd dist
cp ../package.json .
npm ci --production --prefix .
zip -rq ../../../infrastructure/.build/analyzer.zip . -x "*.map"
rm -rf node_modules package.json

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-analyzer \
  --zip-file fileb://../../../infrastructure/.build/analyzer.zip \
  --region us-east-1

echo "Analyzer deployed!"
