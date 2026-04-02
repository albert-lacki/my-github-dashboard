#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="dist"
ZIP_NAME="pr-inbox.zip"

echo "→ Cleaning dist..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "→ Copying deploy files..."
cp src/index.html src/app.css src/app.js src/favicon.svg src/favicon-alert.svg "$DIST_DIR/"

echo "→ Packaging $ZIP_NAME..."
cd "$DIST_DIR"
zip -r "../$ZIP_NAME" .
cd ..

echo "✓ Done: $ZIP_NAME ($(du -sh "$ZIP_NAME" | cut -f1))"


