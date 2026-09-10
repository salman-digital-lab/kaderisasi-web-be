# Profile image storage

The public profile-picture endpoint keeps its existing request and response contract. JPEG/PNG inputs still have a 2 MB upload limit. The backend decodes valid images, applies their orientation, fits them inside 512 × 512 without cropping or enlarging them, strips metadata, and encodes WebP at quality 82. Invalid, animated, or excessive-pixel inputs are rejected.

New keys use `profile/<userId>/<uuid>.webp`. A new object is stored before a transaction locks and updates the profile. After commit, the previous object is removed only if no profile still references it. A failed upload or database save preserves the previous image; cleanup checks references before deleting the newly generated key, including when a commit acknowledgement may have been lost. Failed cleanup is logged for a later storage audit.

`sharp` is a production dependency. Deploy the backend with the updated package manifest and lockfile and install optional platform packages normally. A source edit alone does not update the running production service.

## Existing pictures

The frontend stores profile-picture URLs in cookies. Existing pictures therefore retain their keys and JPEG/PNG formats during optimization. This avoids stale-cookie failures and preserves external links. JPEG is encoded at quality 82; PNG uses lossless compression after resizing. An existing object is replaced only when the optimized file is smaller.

The operational script runs from this source checkout on Node 24. It reads the explicitly selected `docs/.env.<environment>.be` and `.web-fe` files without replacing application environment files. Database connections are read-only. It targets only images currently referenced in `public.profiles.picture`.

```sh
# First check conditional writes and public access using an owned test object.
node scripts/optimize-profile-images.mjs --environment=test --mode=probe --directory=/absolute/private/probe

# Download originals and generate a review plan. This does not modify production.
node scripts/optimize-profile-images.mjs --environment=prod --mode=prepare --directory=/absolute/private/profile-backup

# Review plan.json, original/optimized byte totals, and skipped entries.
# Apply a small pilot, then resume to process the remaining candidates.
node scripts/optimize-profile-images.mjs --environment=prod --mode=apply --limit=5 --directory=/absolute/private/profile-backup
node scripts/optimize-profile-images.mjs --environment=prod --mode=apply --directory=/absolute/private/profile-backup

# Verify every migrated object through the frontend's public image base URL.
node scripts/optimize-profile-images.mjs --environment=prod --mode=verify --directory=/absolute/private/profile-backup

# Restore originals only where current object bytes still match this migration.
node scripts/optimize-profile-images.mjs --environment=prod --mode=rollback --directory=/absolute/private/profile-backup
```

Every candidate has a local original, an optimized copy, SHA-256 checksums, original S3 metadata, access policy, tags, profile references, and an ETag. Conditional writes reject changed objects. Each write is journaled before execution, then verified by anonymously fetching, hashing, and fully decoding the public image. No database references change. Metadata marks successfully optimized objects so future preparation skips them. Cached images may keep showing their original bytes until their existing cache entries expire; their URLs continue to work.

Preparation skips unsupported access policies, external URLs, unreadable images, and files without size savings. Apply stops at the first failure; inspect the per-object journal before resuming or rolling back. Keep the private backup directory outside Git until the migration is accepted. Do not run rollback blindly after later user uploads.

## Validation

```sh
npm run lint
npm run typecheck
npm run build
node scripts/test-profile-images.mjs
```

The test runner creates a uniquely owned schema in the configured test database, with an explicit search path and no `public` fallback. Tests cover image transformation, upload/database failures, shared references, concurrent replacements, and actual public image access through the test storage bucket. The runner drops its schema; the storage test records and removes its own UUID-keyed object.
