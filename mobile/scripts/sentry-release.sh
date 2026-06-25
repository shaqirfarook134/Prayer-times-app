#!/bin/bash
# Creates, finalizes, and deploys a Sentry release for the current app version.
# Run after every production build: npm run sentry:release
#
# Requires SENTRY_AUTH_TOKEN to be set in your environment.
# Add to ~/.zshrc: export SENTRY_AUTH_TOKEN=<your token>

set -e

if [ -z "$SENTRY_AUTH_TOKEN" ]; then
  echo "Error: SENTRY_AUTH_TOKEN is not set."
  echo "Add 'export SENTRY_AUTH_TOKEN=<your token>' to your ~/.zshrc and restart your terminal."
  exit 1
fi

# Read version from app.config.js
VERSION=$(node -e "const c = require('./app.config.js'); console.log(c.expo.version)")
RELEASE="com.shaqirfarook.mymasjid@${VERSION}"

export SENTRY_ORG="scaleup-e6"
export SENTRY_PROJECT="react-native"

echo "Creating Sentry release: $RELEASE"
npx @sentry/cli releases new "$RELEASE"

echo "Finalizing release..."
npx @sentry/cli releases finalize "$RELEASE"

echo "Tagging production deploy..."
npx @sentry/cli releases deploys "$RELEASE" new -e production

echo "Done — $RELEASE is live in Sentry."
