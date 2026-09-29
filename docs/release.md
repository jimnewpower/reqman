# Installation and compatibility

Reqman is a Node package with a bundled React UI and domain worker. Node 22.17+ and Git on PATH are runtime prerequisites. It installs separately from the adopter application; no dependency or hook is added to that application's build. Core use works offline once dependencies are installed.

Build from a pinned source commit:

```sh
git checkout EXACT_SOURCE_COMMIT
npm ci
npm test
npm run package
```

`release-artifacts/` contains `reqman-0.1.0.tgz`, SHA256SUMS, provenance.json, and dependency-inventory.json. The provenance records every tracked source digest, lockfile digest, commit, dirty state, platform and runtime. A distribution must have `dirty: false` and passing checks for the exact source commit. The archive can be installed into an independent tool directory with `npm install /path/to/reqman-0.1.0.tgz`; invoke `node node_modules/reqman/dist/cli.js --version`. Dependencies must be cached for an offline installation. Installation does not automatically start a service. No public npm release or signed installer has been published by this work.

| Platform | Evidence and support |
|---|---|
| Windows 11 x64, Node 22.17.1, Git 2.49 | Local build, integration tests, packaging and browser verification |
| Ubuntu / macOS, Node 22.17.1 | CI matrix checks the same source and archive; exact run results are recorded in the PR |
| Other Node/Git/OS versions | Not accepted by a release support claim |

The independently reported versions are tool 0.1.0-preview, repository format 1, canonicalization rms-c14n-1, machine output 1, and package 0.1.0. `doctor` reports them and the effective limits. The tool remains a preview until the acceptance gates in status.md pass.

Normal reads do not rewrite old repositories. `upgrade` returns a compatibility report. For format 1, `{ "expand_defaults": true }` previews explicit default expansion; apply its saved plan only after reviewing the diff. No older mandatory format has a declared supported conversion. Unsupported mandatory versions fail without rewriting input.

This revision adds policy defaults and stricter exact change/impact records to the preview contract. Expanded policy is part of governance hashing, so approvals from the initial preview may need review. Existing change/impact records lacking exact pairs need explicit migration or replacement. Format 1 and rms-c14n-1 are still preview contracts; this is not a claim of compatibility with a frozen release.

The existing GPL-3.0-only license covers the distributed implementation, documentation, schemas and canonicalization fixtures. Using the data format does not transfer ownership or automatically relicense an adopter's requirements or evidence. Third-party dependencies retain their own licenses, reported in the package inventory. Contributions use the repository license; the repository owner reviews and merges contributions. Changes to mandatory format behavior require schema, conformance and compatibility evidence.

For data exit, keep the Git repository and baseline target objects, export a portable archive, and preserve external artifacts separately. Uninstalling the tool or deleting disposable indexes does not alter those files. A portable archive excludes Git history and recovery journals; restore it into an empty initialized Git working tree and retain a Git bundle for full historical restoration.
