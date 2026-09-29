# Security reporting

Do not put sensitive repository content, credentials, session access keys, or an exploitable proof of concept in a public issue.

GitHub private vulnerability reporting is the intended confidential channel. Its repository setting was disabled when checked on 2026-09-29. The maintainer must enable it before public distribution; until then this preview does not advertise a working private submission endpoint. After enabling it, use the repository's Security tab, Report a vulnerability.

Only the current preview is maintained. No released support period or security response SLA is promised. Reports should identify the package version, Node/Git versions, operating system, a minimal synthetic reproduction, and the impact. Dependency audit results and local threat-model checks are documented in docs/operations.md. They do not establish a security certification.

Release archives include source provenance, dependency versions/integrity, and SHA-256 checksums. Verify these against the release source. No update, fetch, package installation, test execution, or external artifact download runs automatically.
