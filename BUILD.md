# Source and validation

The JavaScript launcher is in `bin/preview-cli.mjs`; the bounded example is in `bin/preview-demo.mjs`. There are no npm runtime dependencies or lifecycle scripts.

Run the launcher contract tests with Node 24 or newer:

```sh
node --test test/cli.test.mjs
```

These use synthetic engine fixtures. They do not prove native recording. The separate [comparison lab](https://github.com/sjh9714/command-demo-lab) contains native Windows and Mac observations, failure cases, the actual consumer harness and its limits.

The final 0.1.0-beta.1 npm tarball has SHA-256 `81f2fc95efde5bae57c9a7a02f9cb3b493b93dbc9a109985a503ee678e943cf6`. That identical file passed four fresh-consumer checks on macOS arm64 and [Windows Server 2022](https://github.com/sjh9714/command-demo-lab/actions/runs/36073797007): help, the bundled demo, command exit 0 and command exit 7. Each installed 151-file payload matched the tarball. Existing files remained unchanged; a reused output folder was refused without running the fixture. All three generated GIFs on each OS decoded completely. These are local-tarball maintainer checks, not independent-user results.

## Public npm first run, September 25, 2026

The public `cmdgif@0.1.0-beta.1` registry publication time is `2026-09-24T23:41:30.939Z`. A separate fresh macOS arm64 consumer with Node 24.19.0 ran `npx --yes cmdgif@beta --demo` from an empty cache. The selected version, registry URL, SHA-512 integrity and all 151 installed files matched the checked tarball. The `--yes` flag accepts npm's package prompt; it does not change the cmdgif command. Lifecycle scripts were disabled in the isolated npm configuration; cmdgif declares none. Existing project notes and source files remained unchanged.

The same installed package, with npm offline, then recorded the actual command `node --test --test-reporter=spec test/cli.test.mjs` against unchanged copies of this repository's existing tests and launcher. All 13 tests passed. Both this GIF and the bundled-demo GIF decoded through all five frames and were visually checked. The test fixtures still simulate an engine: recording that test run does not turn those unit assertions into native acceptance tests.

![Actual cmdgif recording of its Node test run on macOS](assets/test-run.gif)

The [registry probe](https://github.com/sjh9714/command-demo-lab/blob/codex/windows-recorder-probe/registry-probe.mjs) records the exact setup and readback checks.

A separate [Windows public-registry run](https://github.com/sjh9714/command-demo-lab/actions/runs/36077148811) at `2026-09-25T00:21:45Z` used Windows Server 2022 build 20348, Node 24.19.0 and npm 11.17.0. One fresh-cache `npx --yes cmdgif@beta --demo` selected 0.1.0-beta.1, with the same registry archive, integrity and all 151 installed file hashes. The same installation then recorded the existing test command with npm offline: 12 passed, none failed, and the existing POSIX symlink-entry test skipped Windows. Both commands exited normally with code 0, and project notes and source bytes remained unchanged. The demo's five frames and test recording's six frames decoded; their final images were visually checked.

These public-registry checks invoke npm's `npx-cli.js` and its package command entry, with isolated cache/configuration and lifecycle scripts disabled. They do not establish the interactive PowerShell `npx.ps1` wrapper, retail Windows GUI setup, whole-process-tree cleanup, or independent-user success. The Windows workflow's 11 returned evidence files were length/hash checked after retrieval. No product code, native binary or npm version changed for this additional check.

## Native engine source

The engine is Numan Khan's MIT-licensed [ttysvg](https://github.com/Nuu-maan/ttysvg), not an independent renderer. Use upstream commit `b3d30f05a33c8fc90f0480e01d3c148ea11988cd`, apply this repository's `candidate.patch` to a fresh checkout, then run `cargo build --locked --release --bin ttysvg` with Rust 1.96.1 and the platform's native compiler. The patch propagates the command's exit result after saving its recording.

Expected upstream Cargo.lock SHA-256: `e2769858af1ff66cb4ad2a61bacf87711c52099db0922cf6cbef3b17353b7f1f`.

The Windows x64 asset was built and exercised in [run 36072313428](https://github.com/sjh9714/command-demo-lab/actions/runs/36072313428), source `c2d7389bb6491775073864d12892a814ddd70e36`. The Apple Silicon asset was built from the same locked, patched source with Rust 1.96.1; `--remap-path-prefix` replaced the builder's local home path with `/build`. `UPSTREAM.json` records the exact distributed binary hashes. A rebuild need not be byte-identical across machines.

The resulting native files belong at `bin/ttysvg.exe` on Windows and `bin/ttysvg` on macOS. They are included in npm but excluded from Git. Do not package a source checkout with missing native assets or reuse `UPSTREAM.json` for different binaries.

Third-party notice files are preserved verbatim. `third-party/index.json` is a source-notice superset for both targets and the Rust library copyright, not a binary-linkage or legal-review attestation. The original ttysvg MIT notice is in `LICENSE.ttysvg`.

## What has not been established

The synthetic tests are not an independent user study. Retail Windows setup, arbitrary shells/npm shims, interactive sessions, reliable Ctrl+C behavior, long-running commands and unsupported OS/CPU pairs are not beta support claims. Do not infer a speed advantage from the comparison runs: their preparation and terminal sizes differ.
