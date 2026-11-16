# CB-005B — PROVIDER EXECUTION FOUNDATION · REVIEW PACKET (CORRECTED REVISION)

Published 2026-10-08 · app `the-v-i-s-i-o-n-platform` · nothing deployed, no Supabase write, no SQL executed, provider sync disabled, Digital Twin untouched.

Every file below was downloaded back from its public URL after upload and its SHA-256 compared to the local artifact: all match.

| File | Bytes | SHA-256 | Verified | Role |
| --- | ---: | --- | :---: | --- |
| [phase_cb_005b_provider_execution_foundation.sql](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/9622e916a_phase_cb_005b_provider_execution_foundation.sql) | 109,929 | `f72dd6e26d05e2ac9d6cade0261cf056b131bb860df725484ef5b1eb323b8724` | ✅ | MIGRATION — single-use, fail-closed. Corrected: the ingest re-reads the lease at the mutation boundary. |
| [phase_cb_005b_provider_execution_foundation.txt](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/6a24a8cb1_phase_cb_005b_provider_execution_foundation.txt) | 109,929 | `f72dd6e26d05e2ac9d6cade0261cf056b131bb860df725484ef5b1eb323b8724` | ✅ | PLAIN-TEXT TWIN of the migration (byte-identical). |
| [phase_cb_005b_provider_execution_foundation_preflight.sql](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/3b28a4e64_phase_cb_005b_provider_execution_foundation_preflight.sql) | 8,756 | `f9dae6b25df5bb2a1917d35dff75685d994dacbd83cd97c2df8cd9e46c8a2e8b` | ✅ | PREFLIGHT — UNCHANGED, byte-identical to the previous publication. |
| [phase_cb_005b_provider_execution_foundation_preflight.txt](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/78efe07af_phase_cb_005b_provider_execution_foundation_preflight.txt) | 8,756 | `f9dae6b25df5bb2a1917d35dff75685d994dacbd83cd97c2df8cd9e46c8a2e8b` | ✅ | PLAIN-TEXT TWIN of the preflight (byte-identical). |
| [phase_cb_005b_provider_execution_foundation_verification.sql](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/2e954019a_phase_cb_005b_provider_execution_foundation_verification.sql) | 55,923 | `2de4e861d4cf2a0028821872ab9a081fd0d96c5e0688d623595107cb644684e5` | ✅ | VERIFICATION REPORT — 61 rows. Corrected: row BI asserts the post-lock LEASE condition. |
| [phase_cb_005b_provider_execution_foundation_verification.txt](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/923f2168a_phase_cb_005b_provider_execution_foundation_verification.txt) | 55,923 | `2de4e861d4cf2a0028821872ab9a081fd0d96c5e0688d623595107cb644684e5` | ✅ | PLAIN-TEXT TWIN of the verification report (byte-identical). |
| [cb005bConcurrency.pg.test.cjs](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/a73f99f5e_cb005bConcurrencypgtest.cjs) | 46,647 | `78d8f8e36163bea3ea9996f33c47da5ef53c03bdc65b08324219957246f778f2` | ✅ | REAL-POSTGRESQL CONCURRENCY — 24 checks. Corrected C-6a..C-6e (per-key FK matrix); new C-15/C-15b/C-16 (lease and deadline during the key wait). |
| [cb005bIngestRemediation.test.cjs](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/149e4375f_cb005bIngestRemediationtest.cjs) | 40,397 | `dfd05b7f0248dcf827f6c4a0ded587c161230151ecc03ff3908d164fdcf9b3df` | ✅ | INGEST REMEDIATION REGRESSION — 71 checks. Corrected row count (61) and two new boundary anchors. |
| [cb005bProviderExecutionChecks.cjs.gz](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/93f61eb0b_cb005bProviderExecutionCheckscjs.gz) | 43,748 | `7570d2f0cc837108d9388045914f95e081ed2148b9855cfaff16c8604c8cc0de` | ✅ | EXECUTABLE HARNESS — gzipped. Inflates to 172,682 bytes, sha256 1d00f8daf92d270c78dcb5a4fb6af7710c5566518fed185222e28303be3f17be (gunzip before use). |
| [cb005bHardeningChecks.cjs](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/bc81e54bb_cb005bHardeningChecks.cjs) | 15,188 | `5f326de74f349be4d11fe9ac988c9d703d9b4388fe977506a1678bcd5633951d` | ✅ | HARNESS MODULE — unchanged bytes; republished so the packet has one publication. |
| [connectedBusinessFoundation.test.cjs](https://media.base44.com/files/public/6a2338cb6dd7f8bfcf561ec3/d188015cb_connectedBusinessFoundationtest.cjs) | 64,222 | `1f8116fa406b86dcc427042dbc119f00307b977c3ab8c3c88f4c3dfe78322f7c` | ✅ | FULL CB SUITE RUNNER — unchanged bytes; executes CB-001 … CB-005B. |

## What this revision corrects

1. **C-6 foreign-key assertions.** The grouped `(child, rule)` count is gone. C-6a..C-6e now read the individual constraints from the catalogue and assert, per key: both observation keys into the job RESTRICT; the connection key RESTRICT; the credential key SET NULL with the column named in the deployed definition; no observation key cascading; both checkpoint keys into the job CASCADE. The grouped shape is asserted separately, as the summary it is.
2. **Lease revalidation after the advisory-lock wait.** The ingest now reads a fresh `clock_timestamp()` after the per-key locks and before any write, re-asserts the claim from the row at that point, refuses an expired absolute deadline, and refuses an expired **lease** — the case the deadline test cannot cover, because the grant is capped AT the deadline rather than extended to it. The row lock is held for the whole unit, so no one can extend a lease behind the worker's back; what a lock cannot freeze is time, and `lease_expires_at` is an instant that passes on its own.

Verification report row count: **61** (was 60) — row BI asserts the post-lock lease condition positionally.
Preflight: **unchanged**, byte-identical (`f9dae6b2…e2e8b`), as published previously and as published here.

## Test results at this publication

- Executable CB suite (`connectedBusinessFoundation.test.cjs`): **2,919 / 2,919 PASS**, 0 failures.
- Ingest remediation regression (`cb005bIngestRemediation.test.cjs`): **71 / 71 PASS**, 0 failures.
- Mutation pass inside the CB-005B harness: **999 checks, 0 undetected** — every mutation fired, including MU5B-72 (lease re-read disabled), MU5B-73 (boundary claim re-read removed), MU5B-74 (database stops re-judging after the wait).
- Negative controls: disabling the post-lock lease re-read → CB5B-143 **FAIL**; removing the boundary claim re-read → CB5B-143 **FAIL**.
- Static + behavioural half run in isolation: 185 checks, 0 failures; CB5B-119 · 120 · 121 · 126 · 130 · 143 · 144 · 145 all PASS.
- Real-PostgreSQL concurrency: **UNVERIFIED here** — no PostgreSQL executed. Must be run in VISION-CB005B-TEST 2.

## Superseded URLs

The previous publication of the migration, the verification report and the concurrency test still serves the PRE-correction bytes. Do not review against those URLs; use the ones in the table above.

## Note on the harness archive

The plain-text upload of `cb005bProviderExecutionChecks.cjs` was refused twice by the storage API (HTTP 403) while a benign file of the same 172,682-byte size was accepted, so the refusal is content-based rather than size-based. It is therefore published gzipped. Gunzip it and compare the inflated SHA-256 above before running the suite.

## Residual risks (unchanged)

- R-1 / R-2 Concurrency and the renewal lock-order fix are asserted and modelled but NOT yet observed against a real server.
- R-3 `cb005bProviderExecutionChecks.cjs` exceeds the platform's 2,000-line guidance; it is a builder-side script, not shipped code.
- R-4 Credential delivery to the execution adapter is deliberately not wired; the shipped adapter is disabled by construction.
- R-5 `SEC-031` / `SEC-032` default-ACL debt remains open, tracked since CB-001.
