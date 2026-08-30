#!/bin/sh
set -eu

# Bump package.json on main using semver, merge main into the release branch
# with a merge commit, tag that merge commit, push both branches, and create
# a GitHub release. Publishing to npm happens off the release branch via a
# GitHub Actions workflow triggered by that release.
#
# Usage:
#   scripts/release.sh [OPTIONS] [major|minor|patch|<version>]
#
# Arguments:
#   major|minor|patch|<version>  Which part of the current semver version to
#                                bump, or an explicit version to use instead.
#                                Defaults to "patch".
#
# Options:
#   --sha <commit>       Main commit to merge (default: HEAD). Only used
#                        with --no-bump; a version bump always merges the
#                        fresh bump commit on the current branch tip.
#   --no-bump            Do not update package.json or create a bump commit.
#   --no-release         Push the tag but do not create a GitHub release.
#   --release-only [tag] Skip tagging entirely; create a GitHub release for
#                        an existing tag (default: most recent tag).
#   --dry-run            Print the tag without doing anything.
#   -h, --help           Show this help.

usage() {
  sed -n '4,23p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

bump_semver() {
  version="$1"
  bump_type="$2"
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)
  patch=$(echo "$version" | cut -d. -f3)
  case "$bump_type" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) echo "$bump_type" ;;
  esac
}

SHA=""
NEWVERSION="patch"
RELEASE_TAG=""
BUMP=1
CREATE_RELEASE=1
RELEASE_ONLY=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --sha)
      SHA="$2"
      shift 2
      ;;
    --no-bump)
      BUMP=0
      shift
      ;;
    --no-release)
      CREATE_RELEASE=0
      shift
      ;;
    --release-only)
      RELEASE_ONLY=1
      # Optional positional tag argument.
      if [ $# -ge 2 ] && [ "${2#--}" = "$2" ]; then
        RELEASE_TAG="$2"
        shift 2
      else
        shift
      fi
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      NEWVERSION="$1"
      shift
      ;;
  esac
done

if [ "$RELEASE_ONLY" -eq 1 ] && [ "$CREATE_RELEASE" -eq 0 ]; then
  echo "Error: --release-only and --no-release are contradictory." >&2
  exit 1
fi

# Ensure we have the latest tags from origin.
git fetch --tags origin

if [ "$RELEASE_ONLY" -eq 1 ]; then
  # Resolve which tag to release: explicit argument or the most recent tag.
  if [ -z "$RELEASE_TAG" ]; then
    RELEASE_TAG=$(git tag --sort=-version:refname | head -n 1)
  fi
  if [ -z "$RELEASE_TAG" ]; then
    echo "Error: no tags found to release." >&2
    exit 1
  fi
  if ! git rev-parse -q --verify "refs/tags/$RELEASE_TAG" >/dev/null; then
    echo "Error: tag not found locally: $RELEASE_TAG" >&2
    exit 1
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "$RELEASE_TAG"
    exit 0
  fi
  # The tag must exist on the remote before a release can be created for it.
  if ! git ls-remote --exit-code --tags origin "refs/tags/$RELEASE_TAG" >/dev/null 2>&1; then
    git push origin "$RELEASE_TAG"
  fi
  gh release create "$RELEASE_TAG" --title "Release $RELEASE_TAG" --generate-notes
  echo "GitHub release created: $RELEASE_TAG"
  exit 0
fi

if [ "$DRY_RUN" -eq 0 ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Error: release must be run from main (currently on $CURRENT_BRANCH)." >&2
    exit 1
  fi
  if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree is not clean." >&2
    exit 1
  fi
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")

if [ "$BUMP" -eq 1 ]; then
  NEW_VERSION=$(bump_semver "$CURRENT_VERSION" "$NEWVERSION")
else
  NEW_VERSION="$CURRENT_VERSION"
fi
TAG="v${NEW_VERSION}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "$TAG"
  exit 0
fi

echo "Running checks before release..."
npm run typecheck
npm run lint
npm run format:check
npm run build

# Default to HEAD when no SHA is provided.
if [ -z "$SHA" ]; then
  SHA=$(git rev-parse HEAD)
fi

if [ "$BUMP" -eq 1 ]; then
  # Write the new version into package.json / package-lock.json and commit
  # the bump on main, without letting npm create its own commit/tag — the
  # tag needs to live on the release branch's merge commit instead.
  npm version --no-git-tag-version "$NEW_VERSION" >/dev/null
  git add package.json package-lock.json
  git commit -m "Bump version to ${NEW_VERSION}"
  MAIN_COMMIT=$(git rev-parse HEAD)
else
  MAIN_COMMIT="$SHA"
fi

git push origin main

# Bring the release branch in sync with origin, then merge main into it
# with an explicit merge commit (npm publish happens off this branch).
git checkout release 2>/dev/null || git checkout -b release origin/release
git merge origin/release --ff-only
git merge --no-ff -m "Release ${NEW_VERSION}" "$MAIN_COMMIT"
MERGE_COMMIT=$(git rev-parse HEAD)

# Tag the merge commit and push both branches plus the tag.
git tag -a "$TAG" -m "Release $TAG" "$MERGE_COMMIT"
git push origin release
git push origin "$TAG"

git checkout main

# Create a GitHub release to trigger the npm publish workflow.
if [ "$CREATE_RELEASE" -eq 1 ]; then
  gh release create "$TAG" --title "Release $TAG" --generate-notes
  echo "GitHub release created: $TAG"
fi

echo "Created and pushed tag: $TAG (commit $MERGE_COMMIT on release, main at $MAIN_COMMIT)"
