// Offline local-tarball proof. No registry publication or registry installation.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, chmod, symlink, readdir, stat, lstat } from 'node:fs/promises';
import { dirname, join, resolve, basename, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { VERSION } from './preview-cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const upstream = 'b3d30f05a33c8fc90f0480e01d3c148ea11988cd';
const name = '@sjh9714/command-demo-preview';
const version = VERSION;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!['--binary', '--tarball', '--npm-cli', '--out'].includes(option) || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('Expected (--binary PATH | --tarball FILE) --npm-cli PATH --out NEWDIR.');
    if (result[option.slice(2)]) throw new Error(`Duplicate ${option}.`);
    result[option.slice(2)] = resolve(argv[index + 1]);
  }
  if (!!result.binary === !!result.tarball || !result['npm-cli'] || !result.out) throw new Error('Exactly one of --binary or --tarball and both --npm-cli and --out are required.');
  if (/\.(cmd|bat)$/i.test(result['npm-cli'])) throw new Error('--npm-cli must identify npm-cli.js, not npm.cmd.');
  return result;
}

// Parse without extracting or executing. Reuse the supplied npm installation's
// own tar dependency, with a bounded in-memory gzip expansion. No npm dependency
// is added to cmdgif or fetched for this probe.
export async function inspectTarball(bytes, npmCli) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 64 * 1024 * 1024) throw new Error('Expected a bounded npm .tgz file.');
  const npmRequire = createRequire(npmCli);
  const { Parser } = npmRequire('tar');
  const tarVersion = npmRequire('tar/package.json').version;
  const expanded = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map(), seen = new Set();
  let problem;
  await new Promise((resolveParse, reject) => {
    const parser = new Parser({ strict: true, onReadEntry(entry) {
      const file = entry.path.startsWith('package/') ? entry.path.slice(8) : '';
      if (entry.type !== 'File' || entry.linkpath || !file || file.length > 512
        || !file.split('/').every(part => /^[A-Za-z0-9_.+-]+$/.test(part) && part !== '.' && part !== '..')
        || seen.has(file.toLowerCase()) || files.size >= 4096 || entry.size < 1 || entry.size > 32 * 1024 * 1024) {
        problem ??= new Error('Tarball contains an unsafe, duplicate, non-file, empty, or oversized entry.');
        entry.resume(); return;
      }
      seen.add(file.toLowerCase());
      const chunks = []; let size = 0;
      entry.on('data', chunk => { size += chunk.length; chunks.push(chunk); });
      entry.on('end', () => {
        if (size !== entry.size) problem ??= new Error('Incomplete tarball entry.');
        files.set(file, Buffer.concat(chunks));
      });
      entry.resume();
    } });
    parser.on('ignoredEntry', () => { problem ??= new Error('Tarball contains an unsupported entry.'); });
    parser.on('error', reject);
    parser.on('end', resolveParse);
    parser.end(expanded);
  });
  if (problem) throw problem;
  return validateFinalPackageFiles(files, tarVersion);
}

export function validateFinalPackageFiles(files, tarParserVersion = 'injected-test-files') {
  const required = ['LICENSE', 'LICENSE.ttysvg', 'README.md', 'UPSTREAM.json', 'candidate.patch', 'package.json',
    'bin/preview-cli.mjs', 'bin/preview-demo.mjs', 'bin/ttysvg', 'bin/ttysvg.exe', 'third-party/index.json'];
  const paths = [...files.keys()].sort();
  if (required.some(file => !files.has(file)) || paths.some(file => !required.includes(file)
    && !/^third-party\/notices\/[a-f0-9]{64}\.txt$/.test(file))) throw new Error('Final package file list does not match the two-asset cmdgif layout.');
  const manifest = JSON.parse(files.get('package.json').toString('utf8'));
  if (manifest.name !== 'cmdgif' || manifest.version !== VERSION || manifest.private === true
    || manifest.bin?.cmdgif !== 'bin/preview-cli.mjs' || manifest.engines?.node !== '>=24'
    || ['scripts', 'dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies'].some(key => Object.hasOwn(manifest, key))) {
    throw new Error('Expected the dependency-free, script-free cmdgif beta manifest.');
  }
  if (!verifyNativeHeader(files.get('bin/ttysvg'), 'darwin', 'arm64')
    || !verifyNativeHeader(files.get('bin/ttysvg.exe'), 'win32', 'x64')) throw new Error('Both supported native architectures must be packaged.');
  const inventory = JSON.parse(files.get('third-party/index.json').toString('utf8'));
  if (inventory.schemaVersion !== 1 || inventory.collectionComplete !== true
    || !Array.isArray(inventory.packages) || inventory.packages.length === 0
    || inventory.packages.some(pkg => !pkg || !Array.isArray(pkg.files) || pkg.files.length === 0)
    || !inventory.rustLibraryCopyright) throw new Error('Missing complete notice inventory.');
  const refs = new Set();
  for (const entry of [...inventory.packages.flatMap(pkg => pkg.files ?? []), inventory.rustLibraryCopyright]) {
    const path = `third-party/${entry.storedPath}`;
    if (!/^third-party\/notices\/[a-f0-9]{64}\.txt$/.test(path) || entry.storedPath !== `notices/${entry.sha256}.txt`
      || !files.has(path) || files.get(path).length !== entry.bytes || sha256(files.get(path)) !== entry.sha256) throw new Error('Packaged notice content does not match its index.');
    refs.add(path);
  }
  if (paths.some(path => path.startsWith('third-party/notices/') && !refs.has(path))) throw new Error('Unexpected unreferenced notice file.');
  return { files, hashes: Object.fromEntries([...files].map(([file, content]) => [file, sha256(content)])), manifest, paths, tarParserVersion };
}

export function verifyNativeHeader(bytes, platform, arch) {
  if (platform === 'win32' && arch === 'x64') {
    if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) return false;
    const pe = bytes.readUInt32LE(0x3c);
    return pe >= 64 && pe + 6 <= bytes.length && bytes.readUInt32LE(pe) === 0x4550 && bytes.readUInt16LE(pe + 4) === 0x8664;
  }
  return platform === 'darwin' && arch === 'arm64' && bytes.length >= 8
    && bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === 0x100000c;
}

export function packageAllowlist(platform) {
  return ['LICENSE', 'LICENSE.ttysvg', 'README.md', 'UPSTREAM.json',
    'bin/preview-cli.mjs', 'bin/preview-demo.mjs', platform === 'win32' ? 'bin/ttysvg.exe' : 'bin/ttysvg',
    'candidate.patch', 'package.json'].sort();
}

// This is an extraction from this engine's SVG, not a browser rendering check.
export function finalSvgText(svg) {
  const animated = svg.includes('class="s"');
  const start = animated ? svg.lastIndexOf('<g transform="translate(0,') : svg.indexOf('<text');
  if (start < 0) throw new Error('Could not locate the final SVG frame.');
  return svg.slice(start).replace(/<\/text>/g, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}

// Exported for fake-process unit checks; no product binary is needed to test deadlines.
export async function runBounded({ label, file, args, cwd, env, logDir, timeoutMs = 45000,
  platform = process.platform, spawnProcess = spawn, killProcess = process.kill.bind(process) }) {
  const started = Date.now();
  const child = spawnProcess(file, args, { cwd, env, shell: false, detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false, exited = false, closed = false;
  let code = null, signal = null, error = null, killer, killerClosed = false, killerExit = null;
  let killerError = null, timer, hardTimer, deadline, done = false;
  const cap = 1024 * 1024;
  child.stdout.on('data', chunk => { stdout += chunk.toString().slice(0, Math.max(0, cap - stdout.length)); });
  child.stderr.on('data', chunk => { stderr += chunk.toString().slice(0, Math.max(0, cap - stderr.length)); });
  const absentGroup = () => {
    if (!Number.isSafeInteger(child.pid)) return false;
    try { killProcess(-child.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
  };
  const result = await new Promise(resolveResult => {
    const finish = settlement => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(hardTimer); clearTimeout(deadline);
      const cleanupConfirmed = timedOut && closed && exited
        && (platform === 'win32' ? killerClosed && killerExit === 0 : absentGroup());
      if (!closed) { child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
      if (killer && !killerClosed) { try { killer.kill('SIGKILL'); } catch {} killer.unref(); }
      resolveResult({ code, signal, error, timedOut, parentExitConfirmed: exited,
        cleanupConfirmed, settlement, taskkill: platform === 'win32' && timedOut ? { exitCode: killerExit, error: killerError } : null });
    };
    const maybeFinish = () => {
      if (!closed) return;
      if (!timedOut) return finish('closed');
      if (platform === 'win32' && killerClosed) return finish('closed-after-taskkill');
      if (platform !== 'win32' && absentGroup()) return finish('owned-group-absent');
    };
    const killParent = () => { if (!exited && Number.isSafeInteger(child.pid)) try { child.kill('SIGKILL'); } catch {} };
    child.once('error', e => { error = e.message; finish('spawn-error'); });
    child.once('exit', (c, s) => { exited = true; code = c; signal = s; });
    child.once('close', (c, s) => { closed = true; code = c; signal = s; maybeFinish(); });
    timer = setTimeout(() => {
      timedOut = true;
      deadline = setTimeout(() => { killParent(); finish('settle-deadline'); }, 5000);
      if (platform !== 'win32') {
        if (Number.isSafeInteger(child.pid)) {
          try { killProcess(-child.pid, 'SIGTERM'); } catch {}
          hardTimer = setTimeout(() => { try { killProcess(-child.pid, 'SIGKILL'); } catch {} maybeFinish(); }, 2000);
        }
      } else if (!exited && Number.isSafeInteger(child.pid)) {
        const taskkill = join(env.SystemRoot, 'System32', 'taskkill.exe');
        killer = spawnProcess(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
        killer.once('error', e => { killerError = e.message; killerClosed = true; killParent(); maybeFinish(); });
        killer.once('close', (c, s) => {
          killerClosed = true; killerExit = c;
          if (c !== 0) { killerError ??= `taskkill exit=${c} signal=${s}`; killParent(); }
          maybeFinish();
        });
      } else {
        killerClosed = true; killerError = 'Recorder already exited; no potentially reused PID targeted.'; maybeFinish();
      }
    }, timeoutMs);
  });
  const stdoutLog = `${label}.stdout.log`, stderrLog = `${label}.stderr.log`;
  await writeFile(join(logDir, stdoutLog), stdout, { flag: 'wx' });
  await writeFile(join(logDir, stderrLog), stderr, { flag: 'wx' });
  return { ...result, pid: child.pid ?? null, elapsedMs: Date.now() - started, stdout, logs: [stdoutLog, stderrLog] };
}

async function isolatedEnvironment(context, toolBin, windows) {
  for (const part of ['home', 'config', 'npm cache', 'temp']) await mkdir(join(context, part), { recursive: true });
  await writeFile(join(context, 'user.npmrc'), '# empty probe-owned user config\n', { flag: 'wx' });
  await writeFile(join(context, 'global.npmrc'), '# empty probe-owned global config\n', { flag: 'wx' });
  const systemRoot = windows ? process.env.SystemRoot ?? process.env.WINDIR : undefined;
  if (windows && (!systemRoot || !isAbsolute(systemRoot))) throw new Error('Windows SystemRoot is required; no guessed system path.');
  const system32 = windows ? join(systemRoot, 'System32') : undefined;
  return {
    ...(windows ? { SystemRoot: systemRoot, WINDIR: systemRoot, COMSPEC: join(system32, 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD' } : {}),
    PATH: windows ? [toolBin, system32].join(delimiter) : toolBin,
    HOME: join(context, 'home'), USERPROFILE: join(context, 'home'),
    APPDATA: join(context, 'config'), LOCALAPPDATA: join(context, 'config'), XDG_CONFIG_HOME: join(context, 'config'),
    TEMP: join(context, 'temp'), TMP: join(context, 'temp'), TMPDIR: join(context, 'temp'),
    npm_config_cache: join(context, 'npm cache'), npm_config_userconfig: join(context, 'user.npmrc'),
    npm_config_globalconfig: join(context, 'global.npmrc'), npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_ignore_scripts: 'true', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_update_notifier: 'false', npm_config_script_shell: windows ? join(system32, 'cmd.exe') : '/bin/sh',
    TERM: 'xterm-256color', LANG: 'en_US.UTF-8',
  };
}

const summary = result => { const { stdout, ...rest } = result; return rest; };
export async function installedPackage(context, hashes, finalPackage = false) {
  let installed;
  if (finalPackage) installed = join(context, 'work space', 'node_modules', 'cmdgif');
  else {
    const npx = join(context, 'npm cache', '_npx');
    const entries = await readdir(npx, { withFileTypes: true });
    const buckets = entries.filter(entry => entry.isDirectory() && /^[a-f0-9]+$/i.test(entry.name));
    if (buckets.length !== 1) throw new Error('Expected one fresh npm exec installation bucket.');
    installed = join(npx, buckets[0].name, 'node_modules', '@sjh9714', 'command-demo-preview');
  }
  const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  const actualPaths = [];
  async function walk(directory, prefix = '') {
    if (prefix.split('/').length > 16) throw new Error('Installed package exceeds inspection limits.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Installed package contains an unexpected symlink.');
      if (entry.isDirectory()) await walk(join(directory, entry.name), path);
      else if (entry.isFile()) actualPaths.push(path);
      else throw new Error('Installed package contains a non-regular entry.');
      if (actualPaths.length > 4096) throw new Error('Installed package exceeds inspection limits.');
    }
  }
  await walk(installed);
  const fileListMatches = JSON.stringify(actualPaths.sort()) === JSON.stringify(Object.keys(hashes).sort());
  const matched = {};
  for (const [file, hash] of Object.entries(hashes)) {
    try { matched[file] = sha256(await readFile(join(installed, file))) === hash; } catch { matched[file] = false; }
  }
  return { name: metadata.name, version: metadata.version, private: metadata.private,
    platform: metadata.os, arch: metadata.cpu, fileCount: actualPaths.length, fileListMatches, fileHashesMatch: matched,
    identical: metadata.name === (finalPackage ? 'cmdgif' : name) && metadata.version === version
      && (finalPackage ? metadata.private !== true : metadata.private === true) && fileListMatches && Object.values(matched).every(Boolean) };
}

async function fixtureReceipt(path, token) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    const validReceipt = value.token === token && Number.isSafeInteger(value.pid) && value.pid > 0
      && value.pid !== process.pid && Number.isSafeInteger(value.ppid) && value.ppid > 0;
    if (!validReceipt) return { observed: true, validReceipt: false, exactPidAbsent: false };
    let absent = false;
    try { process.kill(value.pid, 0); } catch (e) { absent = e.code === 'ESRCH'; }
    // The checked fixture alone writes this unique, non-overwriting receipt.
    // No PID-name matching or unrelated process enumeration/termination.
    return { observed: true, validReceipt, pid: value.pid, parentPid: value.ppid, exactPidAbsent: absent,
      fixtureExitDirectlyObserved: false, limit: 'The original fixture PID is absent after npm closes; the expected exit is checked separately through the recorder and npm.' };
  } catch { return { observed: false, validReceipt: false, exactPidAbsent: false }; }
}

export async function main(options) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node 24 or newer for this probe.');
  const windows = process.platform === 'win32';
  if (!((windows && process.arch === 'x64') || (process.platform === 'darwin' && process.arch === 'arm64'))) throw new Error('Only Windows x64 and Mac arm64 are supported.');
  const { binary, out } = options, npmCli = options['npm-cli'];
  const finalPackage = !!options.tarball;
  if (!(await stat(npmCli)).isFile()) throw new Error('npm CLI must be a readable file.');
  if (finalPackage) {
    const info = await lstat(options.tarball);
    if (!info.isFile() || info.size < 1 || info.size > 64 * 1024 * 1024) throw new Error('Tarball must be a bounded regular, non-symlink file.');
  }
  const tarballInput = finalPackage ? await readFile(options.tarball) : undefined;
  const inspected = finalPackage ? await inspectTarball(tarballInput, npmCli) : undefined;
  const inputs = {
    binary: finalPackage ? inspected.files.get(windows ? 'bin/ttysvg.exe' : 'bin/ttysvg') : await readFile(binary), license: await readFile(join(here, 'LICENSE.ttysvg')), wrapperLicense: await readFile(join(here, 'LICENSE')),
    patch: await readFile(join(here, 'candidate.patch')), fixture: await readFile(join(here, 'baseline-fixture.mjs')),
    preview: await readFile(join(here, 'preview-cli.mjs')), demo: await readFile(join(here, 'preview-demo.mjs')),
  };
  if (!verifyNativeHeader(inputs.binary, process.platform, process.arch)) throw new Error('Input native binary does not match the current target architecture.');
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // Deliberately fail if this output already exists; no overwrite/retry.
  const evidence = join(out, 'evidence'); await mkdir(evidence);
  const report = { schemaVersion: 1, kind: finalPackage ? 'offline-final-cmdgif-tarball-distribution' : 'offline-local-npm-tarball-distribution', comparisonRecorded: false,
    mechanicsGatePassed: false, validGif: false, decoderStatus: 'pending separate full decoder',
    platform: process.platform, arch: process.arch, node: process.version,
    npmPublished: false, registryInstall: false, independentUserTest: false, desktopCapture: false,
    cancellationVerified: false, overwriteSafetyVerified: false, results: [] };
  const started = Date.now();
  try {
    const toolBin = join(out, 'node only tools'); await mkdir(toolBin);
    const nodePath = join(toolBin, windows ? 'node.exe' : 'node');
    if (windows) await copyFile(process.execPath, nodePath); else await symlink(process.execPath, nodePath);
    report.nodeCopyMatches = sha256(await readFile(nodePath)) === sha256(await readFile(process.execPath));
    report.configuredPath = windows ? ['<output>/node only tools', '<SystemRoot>/System32'] : ['<output>/node only tools'];
    report.consumerToolchain = 'Node and npm plus OS shell; no inherited Rust/ffmpeg/browser installation paths. npm adds its own execution-bin paths.';
    const packWork = join(out, 'pack output'); await mkdir(packWork);
    const packEnv = await isolatedEnvironment(packWork, toolBin, windows);
    const npmVersion = await runBounded({ label: 'npm-version', file: nodePath, args: [npmCli, '--version'], cwd: packWork, env: packEnv, logDir: evidence, timeoutMs: 10000 });
    report.npmVersion = npmVersion.stdout.trim(); report.npmVersionProbe = summary(npmVersion);
    if (npmVersion.code !== 0 || npmVersion.timedOut) throw new Error('Could not confirm the npm version.');
    let tarball, hashes;
    if (finalPackage) {
      // Install the identical supplied bytes in every consumer; never re-pack.
      tarball = join(packWork, 'cmdgif-final-input.tgz');
      await writeFile(tarball, tarballInput, { flag: 'wx' });
      hashes = inspected.hashes;
      report.packFilesAllowed = true;
      report.tarball = { file: basename(options.tarball), bytes: tarballInput.length, sha256: sha256(tarballInput),
        integrity: `sha512-${createHash('sha512').update(tarballInput).digest('base64')}`, files: inspected.paths,
        reusedWithoutRepacking: true, tarParserVersion: inspected.tarParserVersion };
      report.provenance = { fixtureSha256: sha256(inputs.fixture), fixturePackaged: false,
        source: 'Exact caller-supplied two-asset npm tarball, not the generated nine-file private harness.',
        packagedUpstream: JSON.parse(inspected.files.get('UPSTREAM.json').toString('utf8')),
        limit: 'File identities and package mechanics only. This does not attest compilation, legal compliance, registry installation, or independent-user experience.' };
    } else {
    const packageDir = join(out, 'package with spaces');
    await mkdir(join(packageDir, 'bin'), { recursive: true });
    const engineName = windows ? 'ttysvg.exe' : 'ttysvg';
    const files = {
      'LICENSE': inputs.wrapperLicense, 'LICENSE.ttysvg': inputs.license, 'candidate.patch': inputs.patch,
      'bin/preview-cli.mjs': inputs.preview, 'bin/preview-demo.mjs': inputs.demo, [`bin/${engineName}`]: inputs.binary,
    };
    report.provenance = {
      repository: 'https://github.com/Nuu-maan/ttysvg', upstreamBaseCommit: upstream, modifiedCandidate: true,
      license: 'MIT', licenseSha256: sha256(inputs.license), wrapperLicenseSha256: sha256(inputs.wrapperLicense), candidatePatchSha256: sha256(inputs.patch),
      fixtureSha256: sha256(inputs.fixture), fixturePackaged: false, previewSha256: sha256(inputs.preview), demoSha256: sha256(inputs.demo),
      binarySha256: sha256(inputs.binary), binaryBytes: inputs.binary.length,
      limit: 'Binary supplied by the build stage; base commit alone is not a source-to-binary attestation.',
    };
    const manifest = { name, version, private: true, license: 'MIT', type: 'module',
      description: 'Unpublished local modified-ttysvg distribution probe', os: [process.platform], cpu: [process.arch],
      bin: { cmdgif: 'bin/preview-cli.mjs' },
      files: ['bin/', 'LICENSE', 'LICENSE.ttysvg', 'candidate.patch', 'UPSTREAM.json', 'README.md'] };
    files['package.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    files['UPSTREAM.json'] = Buffer.from(JSON.stringify(report.provenance, null, 2) + '\n');
    files['README.md'] = Buffer.from('# Unpublished cmdgif source preview\n\nModified Nuu-maan/ttysvg, not an upstream release. Original and wrapper MIT notices and exact patch/binary hashes are included. Try `cmdgif --demo` or `cmdgif --out NEW_DIR -- COMMAND ARG...`. The adapter creates a new directory containing demo.gif and demo.svg. Existing output paths are rejected. Review both files before sharing: command output may contain secrets. The recorder does not upload files, but your command retains your permissions and may use the network. No cancellation, registry-install or independent-user validation claim. This local packaging experiment is not a public binary release; dependency notice review remains separate.\n');
    hashes = {};
    for (const [file, bytes] of Object.entries(files)) {
      await writeFile(join(packageDir, file), bytes, { flag: 'wx' }); hashes[file] = sha256(bytes);
    }
    await chmod(join(packageDir, 'bin', engineName), 0o755);
    await chmod(join(packageDir, 'bin', 'preview-cli.mjs'), 0o755);
    const pack = await runBounded({ label: 'pack', file: nodePath,
      args: [npmCli, 'pack', packageDir, '--pack-destination', packWork, '--offline', '--ignore-scripts', '--json'],
      cwd: packWork, env: packEnv, logDir: evidence });
    report.pack = summary(pack);
    if (pack.code !== 0 || pack.timedOut) throw new Error('Offline local npm pack failed.');
    const metadata = JSON.parse(pack.stdout)[0];
    const entries = metadata.files.map(file => file.path).sort();
    const allowlist = packageAllowlist(process.platform);
    report.packFilesAllowed = JSON.stringify(entries) === JSON.stringify(allowlist);
    if (!report.packFilesAllowed) throw new Error('Tarball contains unexpected or missing files.');
    if (basename(metadata.filename) !== metadata.filename) throw new Error('Unexpected pack filename.');
    tarball = join(packWork, metadata.filename);
    const tarBytes = await readFile(tarball);
    const actualIntegrity = `sha512-${createHash('sha512').update(tarBytes).digest('base64')}`;
    report.tarball = { file: metadata.filename, bytes: tarBytes.length, sha256: sha256(tarBytes), integrity: actualIntegrity, files: entries };
    if (actualIntegrity !== metadata.integrity) throw new Error('Tarball integrity does not match npm pack metadata.');
    }
    for (const testCase of finalPackage ? [0, 7, null, 'help'] : [0, 7, null]) {
      const isDemo = testCase === null, isHelp = testCase === 'help', runsFixture = !isDemo && !isHelp;
      const expectedFixtureExit = runsFixture ? testCase : null;
      const caseName = isHelp ? 'help' : isDemo ? 'demo' : `exit${expectedFixtureExit}`, token = randomUUID();
      const expectedExit = expectedFixtureExit ?? 0;
      const context = join(out, `consumer ${caseName} with spaces`), work = join(context, 'work space');
      await mkdir(work, { recursive: true });
      const env = await isolatedEnvironment(context, toolBin, windows);
      const copiedFixture = join(work, 'fixture command.mjs');
      if (runsFixture) await copyFile(join(here, 'baseline-fixture.mjs'), copiedFixture);
      const pidFile = join(work, 'fixture receipt.json');
      if (runsFixture) { env.BASELINE_RUN_TOKEN = token; env.BASELINE_PID_FILE = pidFile; }
      const preservedFile = join(work, 'existing user notes.txt'), preservedBytes = Buffer.from('Probe-owned pre-existing user content.\n');
      await writeFile(preservedFile, preservedBytes, { flag: 'wx' });
      const record = { case: caseName, expectedFixtureExit, expectedExit, passed: false, validGif: false,
        decoderStatus: isHelp ? 'not applicable: no recording requested' : 'pending separate full decoder', offlineExecInvocations: 1,
        pathsWithSpaces: true, cancellationVerified: false, logs: [], artifacts: {} };
      let completion;
      try {
        if (finalPackage) {
          const project = Buffer.from(JSON.stringify({ name: `cmdgif-probe-${caseName}`, version: '1.0.0', private: true }) + '\n');
          await writeFile(join(work, 'package.json'), project, { flag: 'wx' });
          const install = await runBounded({ label: `${caseName}-install`, file: nodePath,
            args: [npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--save=false', tarball],
            cwd: work, env, logDir: evidence });
          record.install = summary(install);
          record.projectManifestUnchanged = sha256(await readFile(join(work, 'package.json'))) === sha256(project);
          if (install.code !== 0 || install.timedOut || !install.parentExitConfirmed) throw new Error('Final tarball offline install failed.');
        }
        const args = [npmCli, 'exec', '--offline', '--yes', '--ignore-scripts', ...(finalPackage ? [] : ['--package', tarball]), '--',
          'cmdgif', ...(isHelp ? ['--help'] : isDemo ? ['--demo'] : ['--out', 'recorded output with spaces', '--', 'node', 'fixture command.mjs', String(expectedFixtureExit)])];
        completion = await runBounded({ label: caseName, file: nodePath, args, cwd: work, env, logDir: evidence });
        Object.assign(record, summary(completion));
        record.normalExitPropagated = completion.code === expectedExit && !completion.signal;
      } catch (error) { record.error = String(error.message).split(out).join('<output>'); }
      // Collect checks independently so a failed package check does not hide a partial GIF.
      record.fixture = !runsFixture ? { applicable: false, reason: 'No harness fixture requested; only npm close and exit are observed.' } : await fixtureReceipt(pidFile, token);
      try { record.installedPackage = await installedPackage(context, hashes, finalPackage); }
      catch (error) { record.packageError = String(error.message).split(out).join('<output>'); }
      try { record.fixtureUnchanged = !runsFixture || sha256(await readFile(copiedFixture)) === report.provenance.fixtureSha256; }
      catch { record.fixtureUnchanged = false; }
      try { record.preExistingFileUnchanged = sha256(await readFile(preservedFile)) === sha256(preservedBytes); }
      catch { record.preExistingFileUnchanged = false; }
      if (isHelp) {
        record.helpMatches = ['cmdgif', VERSION, 'Usage:', '--demo', '--out NEW_DIR', 'Output may contain secrets', 'Node.js 24+'].every(marker => completion?.stdout.includes(marker));
        record.noRecordingDirectory = !(await readdir(work)).some(path => path.startsWith('demo-') || path === 'recorded output with spaces');
      } else {
      try {
        let output = join(work, 'recorded output with spaces');
        if (isDemo) {
          const generated = (await readdir(work, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith('demo-'));
          if (generated.length !== 1) throw new Error('Expected one automatically created demo directory.');
          output = join(work, generated[0].name);
        }
        for (const extension of ['gif', 'svg']) {
          try {
            const bytes = await readFile(join(output, `demo.${extension}`));
            record.artifacts[extension] = { bytes: bytes.length, sha256: sha256(bytes) };
            if (extension === 'gif') {
              record.artifacts.gif.file = `${caseName}.gif`;
              await writeFile(join(evidence, `${caseName}.gif`), bytes, { flag: 'wx' });
              record.gifHeaderPresent = bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
            } else {
              const last = finalSvgText(bytes.toString('utf8'));
              const markers = isDemo ? ['cmdgif demo', '1. Run a real command', '2. Save its terminal output as GIF and SVG', 'Done. This was actual Node output.']
                : ['BASELINE_START', '한국어 테스트', 'Unicode café', `BASELINE_END exit=${expectedFixtureExit}`];
              record.markers = Object.fromEntries(markers.map(marker => [marker, last.includes(marker)]));
              await writeFile(join(evidence, `${caseName}.txt`), last + '\n', { flag: 'wx' });
              record.artifacts.extractedText = { file: `${caseName}.txt`, source: 'Text extracted from final SVG frame, not CLI --txt output or visual validation.' };
            }
          } catch (error) { record[`${extension}Error`] = String(error.message).split(out).join('<output>'); }
        }
      } catch (error) { record.artifactError = String(error.message).split(out).join('<output>'); }
      }
      if (finalPackage && testCase === 0 && record.artifacts.gif && record.artifacts.svg) {
        const safetyReceipt = join(work, 'must not run receipt.json');
        const refusal = await runBounded({ label: 'existing-output-refusal', file: nodePath,
          args: [npmCli, 'exec', '--offline', '--yes', '--ignore-scripts', '--', 'cmdgif', '--out', 'recorded output with spaces', '--', 'node', 'fixture command.mjs', '0'],
          cwd: work, env: { ...env, BASELINE_PID_FILE: safetyReceipt, BASELINE_RUN_TOKEN: randomUUID() }, logDir: evidence });
        record.existingOutputRefusal = summary(refusal);
        record.offlineExecInvocations += 1;
        let fixtureNotRun = false;
        try { await lstat(safetyReceipt); } catch (error) { fixtureNotRun = error.code === 'ENOENT'; }
        const output = join(work, 'recorded output with spaces');
        const outputsUnchanged = (await Promise.all(['gif', 'svg'].map(async ext =>
          sha256(await readFile(join(output, `demo.${ext}`))) === record.artifacts[ext].sha256))).every(Boolean);
        record.overwriteSafetyVerified = refusal.code !== 0 && refusal.code !== null && !refusal.timedOut
          && refusal.parentExitConfirmed && fixtureNotRun && outputsUnchanged;
        record.fixtureNotRunOnExistingOutput = fixtureNotRun;
        record.outputsUnchangedAfterRefusal = outputsUnchanged;
      }
      record.passed = !!completion && !completion.timedOut && completion.parentExitConfirmed && record.normalExitPropagated
        && (!runsFixture || (record.fixture.validReceipt && record.fixture.exactPidAbsent))
        && !!record.installedPackage?.identical && record.fixtureUnchanged && record.preExistingFileUnchanged
        && (!finalPackage || record.projectManifestUnchanged)
        && (isHelp ? record.helpMatches && record.noRecordingDirectory : !!record.markers && Object.values(record.markers).every(Boolean) && !!record.gifHeaderPresent)
        && (!finalPackage || testCase !== 0 || record.overwriteSafetyVerified);
      report.results.push(record);
    }
    report.originalInputsUnchanged = finalPackage
      ? sha256(await readFile(options.tarball)) === report.tarball.sha256 && sha256(await readFile(tarball)) === report.tarball.sha256
        && sha256(await readFile(join(here, 'baseline-fixture.mjs'))) === report.provenance.fixtureSha256
      : sha256(await readFile(binary)) === report.provenance.binarySha256
      && sha256(await readFile(join(here, 'baseline-fixture.mjs'))) === report.provenance.fixtureSha256
      && sha256(await readFile(join(here, 'candidate.patch'))) === report.provenance.candidatePatchSha256
      && sha256(await readFile(join(here, 'LICENSE.ttysvg'))) === report.provenance.licenseSha256
      && sha256(await readFile(join(here, 'LICENSE'))) === report.provenance.wrapperLicenseSha256
      && sha256(await readFile(join(here, 'preview-cli.mjs'))) === report.provenance.previewSha256
      && sha256(await readFile(join(here, 'preview-demo.mjs'))) === report.provenance.demoSha256;
    report.comparisonRecorded = true;
    report.overwriteSafetyVerified = finalPackage && report.results.find(result => result.case === 'exit0')?.overwriteSafetyVerified === true;
    report.mechanicsGatePassed = report.nodeCopyMatches && report.packFilesAllowed && report.originalInputsUnchanged
      && report.results.length === (finalPackage ? 4 : 3) && report.results.every(result => result.passed);
  } catch (error) { report.error = String(error.message).split(out).join('<output>'); }
  report.elapsedMs = Date.now() - started;
  report.evidenceScope = 'Only summary, synthetic logs and generated images/text; raw npm contexts/caches and package tarball are not copied into evidence.';
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(evidence, 'results.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  return report.mechanicsGatePassed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(parseArguments(process.argv.slice(2))); }
  catch (error) { console.error(`distribution-probe: ${error.message}`); process.exitCode = 1; }
}
