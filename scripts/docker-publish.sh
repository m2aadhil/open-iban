#!/bin/bash
set -e

# Docker Hub repository (change to your Docker Hub username)
DOCKER_USERNAME="${DOCKER_USERNAME:-m2aadhil}"
IMAGE_NAME="open-iban"
REPO="${DOCKER_USERNAME}/${IMAGE_NAME}"

# Get version from package.json or use git tag
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.1.0")
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo "Building ${REPO}:${VERSION} (${GIT_SHA})"

# Build multi-platform image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "${REPO}:${VERSION}" \
  --tag "${REPO}:latest" \
  --label "org.opencontainers.image.revision=${GIT_SHA}" \
  --label "org.opencontainers.image.version=${VERSION}" \
  --label "org.opencontainers.image.created=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --push \
  .

echo "✓ Pushed to Docker Hub: ${REPO}:${VERSION}"
echo "✓ Tagged as: ${REPO}:latest"
echo ""
echo "Pull with: docker pull ${REPO}:${VERSION}"
echo "Run with:  docker run -p 3000:3000 -e JWT_SECRET=\$(openssl rand -hex 32) ${REPO}:latest"
