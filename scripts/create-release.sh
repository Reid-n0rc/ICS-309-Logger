#!/bin/bash
# Create a stable release from the nightly build
# Usage: ./scripts/create-release.sh [version]
# Example: ./scripts/create-release.sh v0.1.1

set -e

REPO_OWNER="Reid-n0rc"
REPO_NAME="ICS-309-Logger"
VERSION="${1:-v0.1.1}"

echo "📦 Creating release $VERSION from nightly build..."

# Get the latest nightly commit
echo "🔍 Fetching nightly build commit..."
NIGHTLY_COMMIT=$(gh release view nightly --repo "$REPO_OWNER/$REPO_NAME" --json targetCommitish -q '.targetCommitish')

if [ -z "$NIGHTLY_COMMIT" ]; then
    echo "❌ Failed to fetch nightly commit"
    exit 1
fi

echo "✅ Found nightly build at commit: $NIGHTLY_COMMIT"

# Create the release
echo "🚀 Creating release $VERSION..."
gh release create "$VERSION" \
    --repo "$REPO_OWNER/$REPO_NAME" \
    --target "$NIGHTLY_COMMIT" \
    --title "ICS-309 Logger $VERSION" \
    --notes "ICS-309 Communications Logger — portable desktop build.

Download the installer/bundle for your platform from the assets below.
The app needs no installation and can be run from removable media; its
SQLite database is created next to the executable on first run."

echo ""
echo "🎉 Successfully created release $VERSION!"
echo "📍 Release URL: https://github.com/$REPO_OWNER/$REPO_NAME/releases/tag/$VERSION"
