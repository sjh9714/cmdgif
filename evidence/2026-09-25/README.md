# Preserved beta validation evidence

These are selected maintainer measurements from September 25, 2026 (Korea time), retained publicly when `sjh9714/command-demo-lab` was made private. Moving them here did not rerun a recorder, installation or Windows job. The original repository is research infrastructure, not a cmdgif runtime dependency.

[manifest.json](manifest.json) identifies the original Actions runs, source commits, source-file hashes and stored-file hashes. Reports are historical observations, not results for later tool versions. Files were normalized to LF where necessary; the Mac task directory was replaced with `<task-directory>`. Those transformations are listed per file. Original run URLs inside JSON are provenance, not publicly accessible evidence links.

This is a selected record, not an archive of every GIF, full job log or the original Git history. The original records remain in the private lab. The already-published npm tarball is unchanged, so its bundled README may still refer to the formerly public lab; this page is the public evidence entry point.

## Windows comparison

Original run `36066962836`, source `09f4226bdae4473cf562275c84151351429bf6c9`, used Windows Server 2022 build 20348, image `20260913.307.1`, Node 24.19.0, and one bounded synthetic command per 0/7 exit case. The command printed ANSI colors, Korean, Unicode and an ending marker, with no descendant processes. These are rendered terminal outputs, not desktop recordings.

| Path | Preserved observations | Decoder / gate evidence |
| --- | --- | --- |
| ttysvg at `b3d30f05a33c8fc90f0480e01d3c148ea11988cd`, original and exit-only patch | [Results](comparison/ttysvg-results.json), [build inputs](comparison/ttysvg-build.json). Both made GIFs; original returned 0 for the exit-7 command, patched returned 7. | Original [exit 0](comparison/upstream-exit-0-decode.json) / [exit 7](comparison/upstream-exit-7-decode.json); patched [exit 0](comparison/candidate-exit-0-decode.json) / [exit 7](comparison/candidate-exit-7-decode.json). |
| PowerSession 0.1.16 + agg 1.9.0 | [Results](comparison/powersession-results.json). Both cases produced GIFs; the recorder did not propagate exit 7. | [Gate](comparison/powersession-gate.json), [exit 0 decoder](comparison/powersession-exit0-decode.json), [exit 7 decoder](comparison/powersession-exit7-decode.json). |
| Termless CLI 0.9.1 | [npm install](comparison/termless-npm-install.json), [Bun install](comparison/termless-bun-install.json), [recording attempts](comparison/termless-results.json), [import error](comparison/termless-import.stderr.log). npm dependency resolution failed; the Bun-installed graph lacked the imported `isTtyPath` export. No fixture/GIF started. | [Failed gate](comparison/termless-gate.json). This is an installation/import result, not a measured renderer or ConPTY failure. |

The whole run failed because the Termless path produced no GIF. PowerSession + agg is a working alternative, not a failed baseline. Its initial `validGif: false` predates separate decoding; use the decoder files and gate for the later result. The candidate and PowerSession final images were visually inspected at the time, separately from machine decoding.

ttysvg used an 80x16 grid and PowerSession its 120x30 console default. The latter required a separate hidden console supplied by the test harness. ttysvg was built on the same build-equipped VM used for its consumer checks, not obtained as an official prebuilt release. Package installation used isolated configuration with lifecycle scripts disabled; this is not an unrestricted default install. Different setup, terminal sizes and rendering caches prevent a fair speed ranking. See the [product comparison](../../COMPARISON.md) for the narrower packaging claim.

## Windows binary and final local tarball

Original run `36072313428`, source `c2d7389bb6491775073864d12892a814ddd70e36`, built the Windows x64 asset. [The build report](windows-build.json) records the upstream commit, Cargo.lock, patch and executable hashes. This repository's [UPSTREAM.json](../../UPSTREAM.json), [patch](../../candidate.patch) and [MIT notice](../../LICENSE.ttysvg) remain the distribution provenance.

Original run `36073797007`, source `85ec1d11c10c4ed3c2a8eeedcc0c7e7fa55eb4be`, tested the final `cmdgif@0.1.0-beta.1` local tarball with SHA-256 `81f2fc95efde5bae57c9a7a02f9cb3b493b93dbc9a109985a503ee678e943cf6`. [The full report](windows-package/results.json) preserves help, demo, exit-0, exit-7, all 151 installed-file comparisons and existing-output refusal. Its decoder-pending flags are preserved, not rewritten: later [exit-0](windows-package/exit0-decode.json), [exit-7](windows-package/exit7-decode.json) and [demo](windows-package/demo-decode.json) reports establish complete decoding.

Earlier run `36073638656` stopped before installation because a read-only token could not read the staging draft release. It is not a recorder failure or a successful package test. The later run corrected that staging permission; no failure is being counted as a successful native measurement.

## Public npm first run

- Windows Server 2022, Node 24.19.0, npm 11.17.0: original run `36077148811`, source `2a4e997adf6c83b19da7a5f97c1907c255e4390c`. [Results](windows-registry/results.json), [demo decoder](windows-registry/demo-decode.json), [test-run decoder](windows-registry/test-run-decode.json).
- macOS arm64, Node 24.19.0: a separate local maintainer run. [Results](mac-registry/results.json), [demo decoder](mac-registry/demo-decode.json), [test-run decoder](mac-registry/test-run-decode.json). Only the local task-directory prefix is redacted.

Each used one fresh-cache `npx --yes cmdgif@beta --demo` and matched the actual version, registry source, SHA-512 integrity and all 151 installed files. Each then recorded the existing launcher tests using that installation with npm offline. Mac passed 13 tests; Windows passed 12 and skipped the existing POSIX symlink-entry test. Recording synthetic unit tests does not turn their assertions into native acceptance. Both command parents exited normally and source/notes bytes remained unchanged.

The [original registry probe](harness/registry-probe.mjs), its [helper](harness/distribution-probe.mjs), [launcher snapshot](harness/preview-cli.mjs), [demo](harness/preview-demo.mjs), [fixture](harness/baseline-fixture.mjs) and [decoder](harness/inspect-gif.py) are retained for inspection at the exact source above. They are historical instrumentation, not a second product entry point, part of the published package, or an automatic CI workflow. The probe is fixed to this beta and its tarball hash. Do not use it as an unversioned latest-release acceptance test.

## Boundaries

No independent-user study, retail Windows GUI setup, arbitrary shell/npm shim coverage, interactive Ctrl+C guarantee, whole-descendant-tree cleanup, long-running command support or speed superiority follows from these measurements. `cleanupConfirmed: false` is not rewritten to true when only normal parent exit or a specific fixture PID was observed. Decoder success is not OCR or visual validation. No additional Windows execution or installation was performed while preserving this evidence.
