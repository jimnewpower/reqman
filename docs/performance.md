# Scale measurements

Raw full-run samples are in benchmark-final.json. The synthetic fixture has 10,000 requirements in 500 documents, 50,000 links and 20,000 durable records; the report records authoritative text bytes, versions, CPU/RAM/OS, storage description, source state and benchmark/lockfile hashes. Nothing is fetched from an adopter repository.

| Measurement | Samples | p95 | SRS budget |
|---|---:|---:|---:|
| Cold inventory plus validation | 20 | 14.69 s | 15 s |
| Indexed text/filter query, first 50 rows including JSON serialization | 100 | 33.75 ms | 300 ms |
| Incremental single-document reindex and complete graph validation | 20 | 340.73 ms | 2 s |
| Two committed endpoints, 1,000 changed requirements | 20 | 13.65 s | 15 s |
| Inventory/validation peak resident memory | Cold workers and warm inventory | 666.12 MiB | 1,024 MiB |

The cumulative benchmark driver reached 1,040.46 MiB while retaining its earlier inventory and running all endpoint comparisons. That separate peak is reported as max_process_rss_bytes; it is not hidden by the inventory measurement. A release memory review should also measure repeated interactive comparisons and history separately. Installed SSD models are recorded, but Windows did not expose the E: volume-to-device mapping; this is local evidence, not certification of a specified reference SSD.

Cold means a fresh Node process without a Reqman parsed/index cache. The OS filesystem cache is retained and explicitly labeled. Indexed-query preparation occurs before the 100 query samples. Warm edits deliver one known changed-document event to Repository.reindexDocument, then parse it, resolve its normative files, recompute fingerprints and validate the complete graph. The resulting view is labeled incremental; it does not claim rediscovery of other external edits. Full refresh, writes, baseline creation and exports recapture authoritative files. Full recapture after an edit remains slower than the incremental index API, as the intermediate benchmark.json records.

Comparisons create a fresh Repository for each sample and read both committed configurations/inputs without checkout. Memory is measured from process.resourceUsage.maxRSS (KiB converted to bytes). p95 uses nearest rank, ceil(0.95 * sample count). Times include parsing/domain work and exclude installation, fixture generation, Git fixture commits and network activity. The final run precedes the last report-provenance/count-only corrections; it measures the same parsing/index paths. Freeze acceptance only after rerunning the exact release source and documenting the reference machine.

Reproduce from the repository with the locked dependencies:

```sh
npm ci
node node_modules/tsx/dist/cli.mjs scripts/benchmark.ts --output docs/benchmark-final.json --storage "ACTUAL SSD MODEL AND FILESYSTEM"
```

The script creates an isolated temporary Git fixture and prints its location in the report; it does not alter project authority. Each normal full run uses 20 cold runs, 100 queries, 20 edits and 20 comparisons. --runs/--queries/--edits can shorten tuning runs, which are explicitly labeled as incomplete sample counts. benchmark-smoke.json retains the initial tuning run (44.29 s cold, 23.70 s full warm recapture), and benchmark.json retains the intermediate full run; neither is an acceptance result.

Analysis/import parsing uses a worker, so CPU parsing cannot block the cancellation endpoint. The HTTP integration test starts a 1,500-requirement capture, cancels it, asserts acknowledgment/result under two seconds, verifies unchanged source bytes and then queries a rebuilt worker. CLI progress stays on stderr and Ctrl+C returns exit 130 outside replacement. Applying a prepared plan stays in the parent; progress identifies the atomic interval and cancellation is deferred until it ends. Limits and explicit local overrides are documented in guide.md and reported by doctor.
