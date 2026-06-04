#!/bin/bash
# Script to promote the nightly build to a stable release
# Usage: ./scripts/promote-nightly.sh [version] [token]
# Example: ./scripts/promote-nightly.sh v0.1.1 $GITHUB_TOKEN

set -e

REPO_OWNER="Reid-n0rc"
REPO_NAME="ICS-309-Logger"
NIGHTLY_TAG="nightly"
VERSION="${1:-v0.1.1}"
GITHUB_TOKEN="${2:-$GITHUB_TOKEN}"

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN not provided"
    echo "Usage: $0 [version] [token]"
    echo "Example: $0 v0.1.1 \$GITHUB_TOKEN"
    exit 1
fi

echo "📦 Promoting nightly build to $VERSION..."

# Get nightly release data
echo "🔍 Fetching nightly release data..."
NIGHTLY_DATA=$(curl -s \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/tags/$NIGHTLY_TAG")

COMMIT=$(echo "$NIGHTLY_DATA" | grep -o '"target_commitish":"[^"]*' | cut -d'"' -f4)
DESCRIPTION=$(echo "$NIGHTLY_DATA" | grep -o '"body":"[^"]*' | head -1 | cut -d'"' -f4 | sed 's/\\n/\n/g')

if [ -z "$COMMIT" ]; then
    echo "❌ Failed to fetch nightly release"
    exit 1
fi

echo "✅ Found nightly build at commit: $COMMIT"

# Create release description
RELEASE_BODY=$(cat <<EOF
ICS-309 Communications Logger — portable desktop build.

Download the installer/bundle for your platform from the assets below.
The app needs no installation and can be run from removable media; its
SQLite database is created next to the executable on first run.
EOF
)

# Create new release
echo "🚀 Creating release $VERSION..."
CREATE_RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    -d "{
        \"tag_name\": \"$VERSION\",
        \"target_commitish\": \"$COMMIT\",
        \"name\": \"ICS-309 Logger $VERSION\",
        \"body\": \"$RELEASE_BODY\",
        \"draft\": false,
        \"prerelease\": false
    }" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases")

RELEASE_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$RELEASE_ID" ]; then
    echo "❌ Failed to create release"
    echo "$CREATE_RESPONSE"
    exit 1
fi

echo "✅ Release created with ID: $RELEASE_ID"

# Get nightly release assets
echo "📥 Fetching nightly assets..."
ASSETS=$(curl -s \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/$NIGHTLY_TAG/assets")

# Download and re-upload each asset
ASSET_IDS=$(echo "$ASSETS" | grep -o '"id":[0-9]*' | cut -d':' -f2)

for ASSET_ID in $ASSET_IDS; do
    ASSET_NAME=$(echo "$ASSETS" | grep -A5 "\"id\": $ASSET_ID" | grep -o '"name":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -z "$ASSET_NAME" ]; then
        continue
    fi
    
    echo "📦 Uploading asset: $ASSET_NAME"
    
    # Download asset from nightly
    curl -s -L \
        -H "Authorization: token $GITHUB_TOKEN" \
        -o "/tmp/$ASSET_NAME" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/assets/$ASSET_ID"
    
    # Upload to new release
    curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "Content-Type: application/octet-stream" \
        --data-binary @"/tmp/$ASSET_NAME" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/$RELEASE_ID/assets?name=$ASSET_NAME" > /dev/null
    
    rm "/tmp/$ASSET_NAME"
    echo "✅ Uploaded: $ASSET_NAME"
done

echo ""
echo "🎉 Successfully promoted nightly to $VERSION!"
echo "📍 Release URL: https://github.com/$REPO_OWNER/$REPO_NAME/releases/tag/$VERSION"
