# Architecture decision: TypeScript, Node.js, and React

Accepted 2026-09-29 by the product owner. This supersedes the initial untested Java scaffold.

Reqman is a local tool. TypeScript domain services are shared by the command line and a loopback HTTP service. React supplies the browser interface. Markdown/YAML files and Git objects remain authoritative. No application database, hosted service, runtime adopter integration, or desktop wrapper is required.

The core owns parsing, versioned canonicalization, validation, immutable snapshot interpretation, decision projections, and write plans. CLI and HTTP handlers are adapters. File writes use optimistic digests and a recovery journal. Git is invoked through argument arrays for object reads, never a shell and never automatic repository mutations. The browser treats all repository content as untrusted.

Node 22.17+ is the initial development runtime. Dependencies are locked. Initial distribution is source plus npm install/build; standalone executable packaging and supported-platform release evidence are separate release gates. The original SRS remains the full target. Preview implementation does not imply V1 acceptance.

The existing GPLv3 license is retained. Confirm the intended `only` versus `or-later` designation and separate data-format/documentation terms before public packaging.
