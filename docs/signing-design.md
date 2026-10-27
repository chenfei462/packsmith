# Packsmith Signing Design

Packsmith already gives users local trust evidence through checksums, receipts, lockfiles, install previews, policy gates, and audit. Cryptographic signing is the next trust layer for official packs, but it is not implemented yet.

## Not Implemented Yet

Not implemented yet: Packsmith does not currently verify cryptographic signatures, signed bundles, SLSA-style provenance, or publisher keys.

Do not treat `verified` as a cryptographic signature. In the current release, `verified` means the catalog marks a pack as maintained or reviewed by the Packsmith project. It does not prove who signed a bundle, which workflow built it, or whether a publisher key was still trusted at release time.

Until signing ships, public claims should say:

- checksum-pinned source installs are supported for GitHub archive sources
- installed bundles leave receipts and can be audited for local drift
- official catalog verification is metadata, not cryptographic proof
- signed bundles and verified publisher keys are planned trust work

## Goals

- Make official packs verifiable before install.
- Bind each signed bundle to its pack id, version, source commit, registry entry, target bundle checksum, and publisher identity.
- Let enterprise users enforce publisher allowlists and required signatures through policy.
- Preserve local-first usage: users can inspect signature material without a hosted Packsmith service.
- Keep signing optional for community experimentation, but required for future verified official packs.

## Threat Model

Signing is meant to reduce these risks:

- a catalog entry points to a bundle that was not produced by the claimed publisher
- an official pack is modified after review but before release
- a release artifact does not match the source commit or CI workflow that produced it
- a publisher key is missing, rotated, revoked, or not allowed by team policy
- a stale or mirrored catalog serves unsigned or mismatched pack content

Signing does not replace local policy. A valid signature can still describe a pack whose declared permissions, risk, or target are unacceptable for a team.

## Trust Model

The future verified path has three linked artifacts:

1. **Sigstore/Cosign signed bundle**: the built Packsmith source bundle or target bundle is signed, and the signature is distributed with the registry entry or release artifact.
2. **SLSA-style provenance**: the release records builder identity, source repository, commit, workflow, materials, package version, and output digest.
3. **Verified publisher keys**: Packsmith records which publishers are trusted for official packs, when keys were introduced or rotated, and which policy identities are allowed.

The registry should only mark a pack as cryptographically verified when all three checks pass for the same version and digest.

## Registry Metadata Shape

Future registry entries can add a `signature` object without changing the current source metadata:

```json
{
  "id": "senior-code-reviewer",
  "version": "0.1.0",
  "source": {
    "type": "github-archive",
    "repo": "packsmith/packsmith",
    "path": "official-packs/senior-code-reviewer",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "checksum": "sha256-..."
  },
  "signature": {
    "status": "required-for-official",
    "bundleDigest": "sha256-...",
    "signatureRef": "sigstore://...",
    "provenanceRef": "https://github.com/chenfei462/packsmith/attestations/...",
    "publisher": "packsmith",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:chenfei462/packsmith:ref:refs/tags/v0.1.0"
  }
}
```

Current `registry validate` should not accept or enforce this shape until verification code exists. The design is intentionally documented before implementation so the product story stays honest.

## Verification Flow

Future install and preview flow:

1. Resolve the catalog entry and source.
2. Verify source checksum or commit pinning as Packsmith does today.
3. Build or download the bundle.
4. Verify the bundle digest against the registry entry.
5. Verify the Sigstore/Cosign signed bundle for that digest.
6. Verify SLSA-style provenance ties the digest to the expected source repository, commit, workflow, version, and publisher identity.
7. Apply local policy: publisher allowlist, required signature, allowed targets, max risk, and required-permission gates.
8. Print signature status in Passport, preview, install result, receipt, lockfile, and audit.

## Policy Additions

Future policy fields should be additive:

```json
{
  "requireSignatures": true,
  "allowedPublishers": ["packsmith"],
  "allowedSignatureIssuers": ["https://token.actions.githubusercontent.com"],
  "allowedSignatureSubjects": ["repo:chenfei462/packsmith:ref:refs/tags/*"]
}
```

These fields should fail closed only after signing verification is implemented. Before that, docs and tests must not imply current policy can validate signatures.

## Release Evidence

When signing ships, release evidence should include:

- bundle filename and SHA-256 digest
- signature material or transparency-log reference
- provenance file or attestation URL
- builder workflow URL and commit SHA
- verification command output from a clean environment
- registry entry showing the same pack id, version, digest, publisher, and provenance reference

## Fetching Signature Material

Signature, provenance, and attestation material is fetched over the network, which makes it part of the same untrusted-input surface as pack sources. **All signature-related fetches must go through the shared wrapper in `src/lib/http.mjs`** (`fetchWithTimeout` / `fetchJsonWithTimeout` / `fetchBytesWithTimeout`) and must not call `fetch` directly.

That wrapper is the single place where the transport rules live, and every one of them matters for signature material:

- an `AbortController` timeout, so a black-holed host cannot hang an install
- exponential-backoff retries for `429`/`5xx` and transient network errors
- a response size limit, so a hostile endpoint cannot exhaust memory
- an optional total time budget per operation
- HTTPS enforcement plus the host allowlist (`validateGitHubUrlHost` / `validateGitHubFetchUrl`, extendable per operator through `PACKSMITH_ALLOWED_FETCH_HOSTS`)

Adding a second, hand-rolled fetch path for signatures would reintroduce exactly the class of defect the shared wrapper was written to remove, and it would sit on the most security-sensitive path in the product. A signature fetched without a timeout, size limit, or host check is not a trust improvement.

## Rollout Plan

The staged path from "documented design" to "enforced by default", in priority order:

- **P0 — Schema and honest wording**: freeze the `signature` metadata shape above, keep `registry validate` from accepting it, and keep every public claim stating that `verified` is metadata rather than a signature. No verification code yet.
- **P1 — Read-only verifier prototype**: implement signature verification for one local official-pack fixture, with all signature material fetched through `src/lib/http.mjs`. Report status in `passport`/`preview` output without blocking installs.
- **P2 — CI signing and SLSA provenance**: sign official-pack bundles in the release workflow and record Sigstore/OIDC-backed provenance plus the digest in GitHub Releases and release evidence.
- **P3 — Policy integration**: add `requireSignatures`, `allowedSignatureIssuers`, and `allowedSignatureSubjects` to policy evaluation, failing closed only once P2 produces real signed releases.
- **P4 — Default enforcement**: require signatures for official verified packs, after at least one signed release has proven the end-to-end flow.

Prerequisite for every stage after P0: signature material must be fetched through the shared wrapper described above, never through a new ad-hoc fetch.

## References

- [Sigstore Cosign signing blobs](https://docs.sigstore.dev/cosign/signing/signing_with_blobs/)
- [Sigstore Cosign verifying blobs](https://docs.sigstore.dev/cosign/verifying/verify/)
- [SLSA build provenance](https://slsa.dev/spec/v1.2/build-provenance)
- [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations)
