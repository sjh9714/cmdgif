# Source and validation

The JavaScript launcher is in `bin/preview-cli.mjs`; the bounded example is in `bin/preview-demo.mjs`. There are no npm runtime dependencies or lifecycle scripts.

Run the launcher contract tests with Node 24 or newer:

```sh
node --test test/cli.test.mjs
```

These use synthetic engine fixtures. They do not prove native recording. The separate [comparison lab](https://github.com/sjh9714/command-demo-lab) contains native Windows and Mac observations, failure cases, the actual consumer harness and its limits.

The final 0.1.0-beta.1 npm tarball has SHA-256 `81f2fc95efde5bae57c9a7a02f9cb3b493b93dbc9a109985a503ee678e943cf6`. That identical file passed four fresh-consumer checks on macOS arm64 and [Windows Server 2022](https://github.com/sjh9714/command-demo-lab/actions/runs/36073797007): help, the bundled demo, command exit 0 and command exit 7. Each installed 151-file payload matched the tarball. Existing files remained unchanged; a reused output folder was refused without running the fixture. All three generated GIFs on each OS decoded completely. These are local-tarball maintainer checks, not npm registry downloads or independent-user results.

## Native engine source

The engine is Numan Khan's MIT-licensed [ttysvg](https://github.com/Nuu-maan/ttysvg), not an independent renderer. Use upstream commit `b3d30f05a33c8fc90f0480e01d3c148ea11988cd`, apply this repository's `candidate.patch` to a fresh checkout, then run `cargo build --locked --release --bin ttysvg` with Rust 1.96.1 and the platform's native compiler. The patch propagates the command's exit result after saving its recording.

Expected upstream Cargo.lock SHA-256: `e2769858af1ff66cb4ad2a61bacf87711c52099db0922cf6cbef3b17353b7f1f`.

The Windows x64 asset was built and exercised in [run 36072313428](https://github.com/sjh9714/command-demo-lab/actions/runs/36072313428), source `c2d7389bb6491775073864d12892a814ddd70e36`. The Apple Silicon asset was built from the same locked, patched source with Rust 1.96.1; `--remap-path-prefix` replaced the builder's local home path with `/build`. `UPSTREAM.json` records the exact distributed binary hashes. A rebuild need not be byte-identical across machines.

The resulting native files belong at `bin/ttysvg.exe` on Windows and `bin/ttysvg` on macOS. They are included in npm but excluded from Git. Do not package a source checkout with missing native assets or reuse `UPSTREAM.json` for different binaries.

Third-party notice files are preserved verbatim. `third-party/index.json` is a source-notice superset for both targets and the Rust library copyright, not a binary-linkage or legal-review attestation. The original ttysvg MIT notice is in `LICENSE.ttysvg`.

## What has not been established

The synthetic tests are not an independent user study. Retail Windows setup, arbitrary shells/npm shims, interactive sessions, reliable Ctrl+C behavior, long-running commands and unsupported OS/CPU pairs are not beta support claims. Do not infer a speed advantage from the comparison runs: their preparation and terminal sizes differ.
