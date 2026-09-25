# Why this beta exists

Checked September 25, 2026. This is a narrow first-recording comparison, not a speed benchmark or a claim that Windows recording is new.

The intended user already has Node installed and wants a short GIF for a CLI README or a bug report. They should not have to compile a recorder or manage a capture file and a separate converter just to try it.

| Route | First-use preparation | What we observed |
| --- | --- | --- |
| [ttysvg](https://github.com/Nuu-maan/ttysvg/tree/b3d30f05a33c8fc90f0480e01d3c148ea11988cd) | Documented Rust/source installation. Direct GIF recording already exists. | Its original engine produced correct GIFs on Windows and Mac. The tested version returned 0 when the recorded command returned 7. |
| [PowerSession](https://github.com/Watfaq-legacy/PowerSession-rs) + [agg](https://github.com/asciinema/agg) | Obtain two tools, capture a session, then convert it. | PowerSession 0.1.16 + agg 1.9.0 produced readable Windows GIFs. This is a working alternative, not a failed baseline. The recorded failure did not propagate through PowerSession in our test. |
| [Termless](https://github.com/beorn/termless/tree/cf0afd1358f6cbc1339fd3f4cb9042ab87b58f4d) | Version 0.9.1 already offers direct command-to-GIF recording. | Our Node installation hit a peer dependency conflict. The Bun installation then failed on an `isTtyPath` import before recording began. This is a package-path result, not proof of a broken terminal or slow renderer. |
| cmdgif beta | Node 24+ and one `npx` invocation. Native assets are included in the npm package. | A small launcher around modified ttysvg: new output folders, a bundled demo, and exit-status propagation after saving. No new rendering engine. |

The actual Windows comparison was run `36066962836`. Its [preserved results, source identifiers, exact versions, image checks and limitations](evidence/2026-09-25/README.md#windows-comparison) remain public in this repository; the original research lab is private. Different terminal sizes and preparation prevent an honest speed ranking. The run's red overall status comes from the Termless package path, not from all recorders failing.

Use ttysvg directly if you want its wizard, tapes, themes or broader export controls. Keep PowerSession + agg if that workflow already suits you. cmdgif's proposed advantage is a simpler first result for a Node user, not more features.

## What gets simpler, and by how much?

For a short command that exits by itself, these are the differences we can substantiate. This assumes the cmdgif user already has Node 24+ on a supported OS. Tool acquisition is separate from the number of recording/conversion calls; combining commands on one shell line does not change that count.

| Requirement | cmdgif beta | Reviewed ttysvg source route | PowerSession 0.1.16 + agg 1.9.0 binary route |
| --- | --- | --- | --- |
| Recorder acquisition | One npm package with native assets included | One recorder built from source with Rust | Two prebuilt tools; no source build required |
| Recorder/converter CLI invocations for one GIF, after acquisition | 1 | 1 | 2: record a cast, then convert it |
| Separate converter | None | None | agg |
| Result when our recorded test command exits 7 | 7, after saving the recording | 0, despite the command failing | PowerSession returned 0; agg still made the GIF |

The two-call route produced valid GIFs in the comparison. PowerSession also [documents Winget and Scoop installation](https://github.com/Watfaq-legacy/PowerSession-rs/blob/v0.1.16/README.md), so manual binary download is not its only option; those package-manager routes were not executed here. ttysvg already records directly to GIF, so the one-call workflow is not a cmdgif invention. These distinctions come from the pinned source and executed cases above, not a new timing experiment or a user preference study.

For an existing Node user, cmdgif removes a separate conversion call compared with the tested PowerSession + agg route, and avoids the Rust/source setup documented by ttysvg. It does not demonstrate a speed multiplier, a better renderer, or easier installation for someone who first needs to install Node 24. Users who already have either alternative configured may gain little.

## What would change our mind?

An independent first-use test should ask a Windows CLI maker to produce the same short README GIF with their current method and cmdgif, without coaching them through hidden setup. Record the required preparation, where they get stuck, whether the result is usable, and which route they would use again. Node 24 itself may be an extra burden.

CI and maintainer checks are not that user study. If users find no useful reduction in setup, or upstream offers an equally simple supported distribution, contributing the packaging and exit-status improvements upstream makes more sense than growing a separate product.

GitHub stars and views indicate attention, not successful installation, repeat use or demand. There is no automatic starring or voting in this package.
