# Contributing

Use Node 22.17+ and the lockfile. Run npm ci, npm run typecheck, npm test, and npm run build. Changes to format semantics require intentional schema/golden-vector updates and compatibility notes. Do not regenerate hashes merely to hide a regression.

Keep domain behavior in src/core and share it between CLI/server. Preserve independent definition, approval, implementation, verification and currency semantics. Reads must remain non-mutating; records stay append-only through product interfaces. Imports use explicit mappings and preserve uncertainty.

Tests use synthetic temporary repositories. Never commit session keys, adopter proprietary data or unlicensed fixtures. Add focused tests for semantic/data-preservation changes and audit dependency updates.

Contributions are under the existing GPL-3.0-only repository license. The repository owner reviews and merges changes. This is a preview; use SECURITY.md for reporting guidance and docs/status.md for release acceptance gates. No contribution agreement or public support SLA has been established.
