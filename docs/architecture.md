# Architecture decision: TypeScript, Node.js, and React

Accepted 2026-09-29 by the product owner. This supersedes the initial untested Java scaffold.

Reqman is a local tool. TypeScript domain services are shared by the command line and a loopback HTTP service. React supplies the browser interface. Markdown/YAML files and Git objects remain authoritative. No application database, hosted service, runtime adopter integration, or desktop wrapper is required.

The core owns parsing, versioned canonicalization, validation, immutable snapshot interpretation, decision projections, and write plans. CLI and HTTP handlers are adapters. File writes use optimistic digests and a recovery journal. Git is invoked through argument arrays for object reads, never a shell and never automatic repository mutations. The browser treats all repository content as untrusted.

Optional local password logins are configured in `requirements.yml`. The HTTP adapter validates credentials, holds expiring sessions in memory, and passes a trusted identity separately from browser request JSON to the analysis worker. The service binds new decision actors and requirement change records to that identity. Previews and operation cancellation belong to the creating session. CLI/direct-file edits remain outside this login boundary; existing/imported claims retain their provenance. See [operations](operations.md#user-logins).

Node 22.17+ is the initial development runtime. Dependencies are locked. Distribution is a pinned Node archive built from source, with bundled UI/worker, integrity checksums, source provenance and dependency inventory. Platform acceptance evidence is tracked separately. The original SRS remains the full target. Preview implementation does not imply V1 acceptance.

The existing GPLv3 license is retained. The package declares GPL-3.0-only for source, docs and schemas; this preserves the existing license rather than introducing new terms. Adopter data ownership is independent of the format.

Analysis and import parsing run in a dedicated worker so the HTTP/CLI adapters can acknowledge cancellation during CPU-heavy parsing. Worker indexes are disposable; cancellation terminates and recreates them. Applying a validated plan remains in the parent with optimistic guards and recovery journaling. Full captures read/verify selected bytes; explicit incremental document events reuse the previous labeled captured view and revalidate the graph. Writes, baseline creation and exports request full captures.
