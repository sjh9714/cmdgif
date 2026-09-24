# cmdgif

Run a command. Get a GIF for your README or bug report.

cmdgif packages the [ttysvg](https://github.com/Nuu-maan/ttysvg) recorder with a small Node launcher. You do not need to build Rust or install a separate video converter. It records real terminal output, not your desktop screen.

![Actual bundled cmdgif demo recorded on Windows](https://raw.githubusercontent.com/sjh9714/cmdgif/main/assets/demo.gif)

Actual output of the bundled demo on Windows Server 2022, not a desktop screen capture.

## Try the beta

Requires Node.js 24 or newer on Windows x64 or Apple Silicon macOS. The public package is a beta for short commands that exit on their own. Linux, Intel Macs and Windows ARM are not included in this version.

```sh
npx cmdgif@beta --demo
```

This runs a short, bundled Node example and saves `demo.gif` and `demo.svg` in a new `demo-...` folder. Nothing is uploaded.

## Record your command

Put the command after `--`:

```sh
npx cmdgif@beta -- node --version
```

To name the new output folder:

```sh
npx cmdgif@beta --out my-demo -- node --version
```

The folder must not already exist. cmdgif does not replace existing output files. Your command keeps its current working directory, arguments, environment and permissions. The GIF and SVG are saved when the command exits. A failing command can still produce a useful recording; its nonzero exit code is preserved.

On Windows, shell syntax such as pipes and redirects needs an explicit shell. A simple batch file worked in our Windows test, but that does not establish every npm shim or quoting combination. General interactive sessions, long-running servers and Ctrl+C are not supported claims in this beta.

## Before sharing

Check both files for secrets and personal information. cmdgif does not automatically redact them or sandbox the recorded command. The recorder does not upload recordings, but the command you run can access files and the network with your permissions.

For a README, copy the GIF into your repository and reference it:

```markdown
![CLI demo](docs/demo.gif)
```

## What is different from ttysvg?

The capture and rendering engine is ttysvg, not a new encoder. cmdgif adds a bundled one-command npm entry point, a short demo, fresh output folders, and a small patch that returns the recorded command's exit status after saving.

Use ttysvg directly for its wizard, tape scripts, themes and other export options. cmdgif intentionally exposes fewer choices for a first recording. It does not claim to be faster or more capable than ttysvg.

The [comparison lab](https://github.com/sjh9714/command-demo-lab) includes a working PowerSession + agg Windows alternative and the exact limits of our synthetic checks. CI success is not independent user validation.

## Credits and licenses

The modified ttysvg engine is based on commit `b3d30f05a33c8fc90f0480e01d3c148ea11988cd`, copyright Numan Khan, under MIT. Its notice and our exact patch are included as `LICENSE.ttysvg` and `candidate.patch`. The launcher is MIT. `UPSTREAM.json` identifies the inputs and native asset hashes; third-party notices are included separately. These binaries are our builds, not official ttysvg releases.

If cmdgif helps you share your work, a GitHub star is welcome. Recording never stars repositories or changes your GitHub account.
