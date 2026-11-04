# Phase 11 - Secure Alumni Avatar Storage

## Purpose

IMS Network provides profile pictures for ESITH IMS alumni.

## Storage

- Provider: Vercel Blob
- Access: Private
- Development store: ims-network-avatars-dev
- PostgreSQL stores the current avatar pathname
- Image bytes are not stored in PostgreSQL
- No storage credentials are exposed to browser code

## Upload Security

Endpoint: POST /api/avatar

Requirements:
- Authenticated ACTIVE account
- Server-side session-derived identity
- Same-origin request
- JPEG, PNG or WebP
- Maximum source image size: 2 MiB
- Valid image signature and successful decoding
- Dimension and pixel-count restrictions
- Processed WebP output
- Server-generated random storage pathname

Uploads use a bounded request-body reader.

The profile update checks that the account is ACTIVE
and that the previous avatar has not changed.

## Private Image Delivery

Endpoint: GET /api/avatar/[id]

- Anonymous requests receive HTTP 401
- Inactive viewers are denied
- Only ACTIVE target profiles are visible
- Missing avatars return HTTP 404
- Private Blob paths are not exposed in member responses
- Images use private browser-cache headers

## Replacement and Cleanup

A new avatar is uploaded before the profile database
record is changed.

The database update uses a conditional avatar comparison.

If updating the profile fails, the application attempts
to delete the newly uploaded object.

After a successful update, the previous Blob is deleted.

Cleanup is best-effort. Failed cleanup may leave an
orphaned Blob requiring future maintenance.

## Verification

Manually verified:
- Valid avatar upload and persistence
- Image display in member directory and profile
- Invalid-image rejection
- Oversized-image rejection
- Server-side HTTP 413 response
- Anonymous image access blocked
- Cross-origin upload denied
- Suspended viewer access blocked
- Suspended avatar owner hidden
- Account restoration
- Avatar replacement and old-object cleanup

## Outstanding Work

- Automated security and integration tests
- Orphaned Blob reconciliation
- Production environment configuration
- Legacy avatar migration feasibility review
- Additional concurrency and failure-injection tests

## Cost Awareness

- Store optimized images, not original uploads
- Avoid unnecessary image transformation requests
- Monitor Blob storage and transfer quotas
- Separate development and production storage
