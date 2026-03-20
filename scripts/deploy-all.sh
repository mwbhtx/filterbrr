#!/bin/bash
set -e

DIR="$(dirname "$0")"

echo "=== Deploying all components ==="
echo ""

"$DIR/deploy-backend.sh"
echo ""

"$DIR/deploy-torrent-scraper.sh"
echo ""

"$DIR/deploy-filter-generator.sh"
echo ""

"$DIR/deploy-frontend.sh"
echo ""

echo "=== All components deployed! ==="
