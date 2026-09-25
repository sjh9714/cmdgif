// One public-registry first run, then one real command using that cached package.
// This is a maintainer check on a supported host, not an independent user study.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, delimiter, isAbsolute } from 'node:path';
import { release } from 'node:os';
import { inspectTarball, finalSvgText, runBounded } from './distribution-probe.mjs';

const windows = process.platform === 'win32';
assert.ok((windows && process.arch === 'x64') || (process.platform === 'darwin' && process.arch === 'arm64'));
assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
const [destination, npmPath, sourcePath] = process.argv.slice(2);
assert.ok(destination && npmPath && sourcePath && process.argv.length === 5);
const out = resolve(destination), npmCli = resolve(npmPath), source = resolve(sourcePath);
const npxCli = join(dirname(npmCli), 'npx-cli.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedHash = '81f2fc95efde5bae57c9a7a02f9cb3b493b93dbc9a109985a503ee678e943cf6';
const registry = 'https://registry.npmjs.org/';
const tarballUrl = `${registry}cmdgif/-/cmdgif-0.1.0-beta.1.tgz`;
await mkdir(out); // Never reuse a previous first-run directory or cache.
for (const part of ['cache', 'config', 'temp', 'logs', 'work space']) await mkdir(join(out, part));
for (const name of ['user.npmrc', 'global.npmrc']) await writeFile(join(out, 'config', name), '', { flag: 'wx' });
const cwd = join(out, 'work space');
const sentinel = 'Existing project notes. Leave these unchanged.\n';
await writeFile(join(cwd, 'notes.txt'), sentinel, { flag: 'wx' });
const systemRoot = windows ? process.env.SystemRoot : undefined;
if (windows) assert.ok(systemRoot && isAbsolute(systemRoot), 'Expected the runner Windows directory');
const system32 = windows ? join(systemRoot, 'System32') : undefined;
const env = {
  ...(windows ? { SystemRoot: systemRoot, WINDIR: systemRoot, COMSPEC: join(system32, 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD', APPDATA: join(out, 'config'), LOCALAPPDATA: join(out, 'config') } : {}),
  PATH: (windows ? [dirname(process.execPath), system32] : [dirname(process.execPath), '/usr/bin', '/bin']).join(delimiter),
  TMPDIR: join(out, 'temp'), TMP: join(out, 'temp'), TEMP: join(out, 'temp'),
  npm_config_cache: join(out, 'cache'), npm_config_userconfig: join(out, 'config', 'user.npmrc'),
  npm_config_globalconfig: join(out, 'config', 'global.npmrc'), npm_config_registry: registry,
  npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_update_notifier: 'false', npm_config_script_shell: windows ? join(system32, 'cmd.exe') : '/bin/sh',
  TERM: 'xterm-256color', LANG: 'en_US.UTF-8',
};
const metadataResponse = await fetch(`${registry}cmdgif`, { signal: AbortSignal.timeout(15000) });
assert.ok(metadataResponse.ok);
const metadata = await metadataResponse.json();
assert.equal(metadata['dist-tags'].beta, '0.1.0-beta.1');
const manifest = metadata.versions['0.1.0-beta.1'];
assert.equal(manifest.dist.tarball, tarballUrl);
const archiveResponse = await fetch(tarballUrl, { signal: AbortSignal.timeout(15000) });
assert.ok(archiveResponse.ok);
const archive = Buffer.from(await archiveResponse.arrayBuffer());
assert.equal(hash(archive), expectedHash);
assert.equal(`sha512-${createHash('sha512').update(archive).digest('base64')}`, manifest.dist.integrity);
const inspected = await inspectTarball(archive, npmCli);
assert.equal(inspected.paths.length, 151);
const report = {
  checkedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  osRelease: release(), npm: JSON.parse(await readFile(join(dirname(npmCli), '..', 'package.json'), 'utf8')).version,
  registry, package: manifest.name, version: manifest.version, publishedAt: metadata.time[manifest.version],
  tarballUrl, tarballSha256: hash(archive), integrity: manifest.dist.integrity,
  limit: 'Maintainer public-registry run via npx-cli.js, including its package command shim. Not an interactive shell wrapper, retail GUI, or independent user test. Lifecycle scripts disabled; this package declares none.',
  runs: [],
};
async function run(label, args, expected = 0) {
  const result = await runBounded({ label, file: process.execPath, args: [npxCli, ...args], cwd, env,
    logDir: join(out, 'logs'), timeoutMs: 45000 });
  const { stdout, ...summary } = result;
  report.runs.push({ label, args, ...summary });
  await writeFile(join(out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(result.timedOut, false); assert.equal(result.code, expected);
  assert.equal(result.parentExitConfirmed, true);
  return result;
}
assert.deepEqual(await readdir(join(out, 'cache')), []);
await run('registry-demo', ['--yes', 'cmdgif@beta', '--demo']);
const demoFolders = (await readdir(cwd)).filter(name => name.startsWith('demo-'));
assert.equal(demoFolders.length, 1);
const demoDirectory = join(cwd, demoFolders[0]);
const demoText = finalSvgText(await readFile(join(demoDirectory, 'demo.svg'), 'utf8'));
assert.match(demoText, /Done\. This was actual Node output\./);

const buckets = (await readdir(join(out, 'cache', '_npx'), { withFileTypes: true })).filter(entry => entry.isDirectory());
assert.equal(buckets.length, 1); assert.match(buckets[0].name, /^[a-f0-9]+$/);
const installation = join(out, 'cache', '_npx', buckets[0].name);
const installed = join(installation, 'node_modules', 'cmdgif');
const paths = [];
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink());
    if (entry.isDirectory()) await walk(join(directory, entry.name), relative);
    else { assert.ok(entry.isFile()); paths.push(relative); }
  }
}
await walk(installed);
assert.deepEqual(paths.sort(), inspected.paths);
for (const file of paths) assert.equal(hash(await readFile(join(installed, file))), inspected.hashes[file]);
const lock = JSON.parse(await readFile(join(installation, 'package-lock.json'), 'utf8'));
const entry = lock.packages['node_modules/cmdgif'];
assert.equal(entry.resolved, tarballUrl); assert.equal(entry.integrity, manifest.dist.integrity);
report.installed = { version: entry.version, resolved: entry.resolved, integrity: entry.integrity, identicalFiles: paths.length };
report.demo = { directory: demoDirectory, finalText: demoText, gifSha256: hash(await readFile(join(demoDirectory, 'demo.gif'))) };

// Existing real launcher tests, copied without modification into an owned worktree.
// Their synthetic engine fixtures remain synthetic; the recorded test execution is real.
for (const directory of ['bin', 'test']) await mkdir(join(cwd, directory));
const sourceFiles = ['bin/preview-cli.mjs', 'bin/preview-demo.mjs', 'test/cli.test.mjs'];
report.commandInputs = {};
for (const file of sourceFiles) {
  await copyFile(join(source, file), join(cwd, file));
  report.commandInputs[file] = hash(await readFile(join(source, file)));
}
await run('record-existing-tests', ['--offline', '--yes', 'cmdgif@beta', '--out', 'test-recording', '--',
  'node', '--test', '--test-reporter=spec', 'test/cli.test.mjs']);
const testDirectory = join(cwd, 'test-recording');
const testText = finalSvgText(await readFile(join(testDirectory, 'demo.svg'), 'utf8'));
const expectedPassed = windows ? 12 : 13; // The POSIX symlink-entry test explicitly skips Windows.
assert.match(testText, new RegExp(`pass ${expectedPassed}`)); assert.match(testText, /fail 0/);
assert.match(testText, new RegExp(`skipped ${windows ? 1 : 0}`));
report.actualCommand = { command: 'node --test --test-reporter=spec test/cli.test.mjs', directory: testDirectory,
  finalText: testText, passed: expectedPassed, skipped: windows ? 1 : 0,
  gifSha256: hash(await readFile(join(testDirectory, 'demo.gif'))), independentUse: false };
assert.equal(await readFile(join(cwd, 'notes.txt'), 'utf8'), sentinel);
for (const file of sourceFiles) {
  assert.equal(hash(await readFile(join(source, file))), report.commandInputs[file]);
  assert.equal(hash(await readFile(join(cwd, file))), report.commandInputs[file]);
}
report.originalFilesUnchanged = true;
report.passed = true;
await writeFile(join(out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, version: report.version, identicalFiles: paths.length,
  tarballSha256: report.tarballSha256, demoDirectory, testDirectory,
  runs: report.runs.map(({ label, code, elapsedMs }) => ({ label, code, elapsedMs })) }, null, 2));
