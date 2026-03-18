#!/bin/bash
set -e

DIR="$(dirname "$0")"

echo "=== Deploying all components ==="
echo ""

"$DIR/deploy-backend.sh"
echo ""

"$DIR/deploy-scraper.sh"
echo ""

"$DIR/deploy-analyzer.sh"
echo ""

"$DIR/deploy-frontend.sh"
echo ""

echo "=== All components deployed! ==="
