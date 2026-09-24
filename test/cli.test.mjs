import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, runPreview, VERSION } from '../bin/preview-cli.mjs';

async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'command-demo-preview-test-'));
  t.after(() => rm(root, { recursive: true }));
  const enginePath = join(root, 'engine-fixture');
  await writeFile(enginePath, 'synthetic engine asset');
  const cwd = join(root, 'work space'); await mkdir(cwd);
  const output = [], errors = [], calls = [];
  const base = { cwd, enginePath, platform: 'darwin', arch: 'arm64',
    stdout: { write: text => output.push(text) }, stderr: { write: text => errors.push(text) } };
  function engine({ code = 0, files = true, startError = false, extraFile = false } = {}) {
    return (binary, args, options) => {
      calls.push({ binary, args, options, noticeBeforeSpawn: errors.join('') });
      const child = new EventEmitter();
      queueMicrotask(async () => {
        if (startError) { child.emit('error', new Error('synthetic_start_error')); return; }
        if (files) {
          await writeFile(args[2], '<svg>synthetic output</svg>');
          await writeFile(args[4], 'GIF89a-synthetic-output');
        }
        if (extraFile) await writeFile(join(args[2], '..', 'keep-me.txt'), 'fixture-owned data');
        child.emit('close', code, null);
      });
      return child;
    };
  }
  return { root, cwd, base, output, errors, calls, engine };
}

test('parses only the two preview recording forms and preserves command arguments', () => {
  assert.deepEqual(parseArgs(['--demo']), { kind: 'demo' });
  assert.deepEqual(parseArgs(['--out', 'new folder', '--', 'program path', 'a b', '--gif', '']),
    { kind: 'record', out: 'new folder', command: ['program path', 'a b', '--gif', ''] });
  for (const argv of [[], ['record'], ['--'], ['--', ''], ['--demo', '--out', 'x'], ['--out'],
    ['--out', 'x', 'program'], ['--help', '--', 'x'], ['--', 'x', '\0']]) assert.throws(() => parseArgs(argv));
});

test('help and version work on unsupported platforms without asset access, spawn, or writes', async t => {
  const c = await context(t);
  for (const argv of [['--help'], ['--version']]) {
    assert.equal(await runPreview({ ...c.base, argv, platform: 'linux', arch: 'x64', enginePath: '/missing',
      spawnProcess: () => assert.fail('must not spawn') }), 0);
  }
  assert.match(c.output.join(''), /Long-running or interactive sessions/);
  assert.match(c.output.join(''), new RegExp(VERSION.replaceAll('.', '\\.')));
  assert.deepEqual(await readdir(c.cwd), []);
});

test('invalid command syntax and unsupported platform create no outputs or command process', async t => {
  const c = await context(t);
  for (const argv of [[], ['--'], ['--out', 'new', '--']]) {
    assert.equal(await runPreview({ ...c.base, argv, spawnProcess: () => assert.fail('must not spawn') }), 1);
  }
  assert.equal(await runPreview({ ...c.base, argv: ['--', 'anything'], platform: 'linux',
    spawnProcess: () => assert.fail('must not spawn') }), 1);
  assert.deepEqual(await readdir(c.cwd), []);
});

test('missing engine creates no output directory', async t => {
  const c = await context(t);
  assert.equal(await runPreview({ ...c.base, enginePath: join(c.root, 'missing'), argv: ['--demo'],
    spawnProcess: () => assert.fail('must not spawn') }), 1);
  assert.deepEqual(await readdir(c.cwd), []);
});

test('creates unique default directories and preserves cwd, argv and inherited process behavior', async t => {
  const c = await context(t);
  const argv = ['--', 'C:/a program/node.exe', 'file with spaces.mjs', 'literal;not-shell', '--flag', ''];
  for (let i = 0; i < 2; i++) assert.equal(await runPreview({ ...c.base, argv, spawnProcess: c.engine() }), 0);
  const entries = await readdir(c.cwd);
  assert.equal(entries.length, 2); assert.ok(entries.every(name => name.startsWith('demo-')));
  for (const call of c.calls) {
    assert.deepEqual(call.args.slice(6), argv.slice(1));
    assert.deepEqual(call.args.slice(0, 2), ['record', '--out']);
    assert.equal(call.args[3], '--gif'); assert.equal(call.args[5], '--');
    assert.equal(call.options.cwd, c.cwd); assert.equal(call.options.shell, false);
    assert.equal(call.options.stdio, 'inherit'); assert.equal(Object.hasOwn(call.options, 'env'), false);
    assert.match(call.noticeBeforeSpawn, /output may contain secrets/);
    assert.match(call.noticeBeforeSpawn, /command exits/);
  }
  for (const entry of entries) assert.deepEqual((await readdir(join(c.cwd, entry))).sort(), ['demo.gif', 'demo.svg']);
});

test('explicit fresh directory works and normal nonzero exit 7 preserves outputs and status', async t => {
  const c = await context(t);
  assert.equal(await runPreview({ ...c.base, argv: ['--out', 'my demo', '--', 'node', 'exit7.mjs'],
    spawnProcess: c.engine({ code: 7 }) }), 7);
  assert.match(c.output.join(''), /Saved GIF:/); assert.match(c.errors.join(''), /code 7/);
  assert.equal(await readFile(join(c.cwd, 'my demo', 'demo.gif'), 'utf8'), 'GIF89a-synthetic-output');
});

test('existing directory and file are rejected without changing their bytes', async t => {
  const c = await context(t);
  await mkdir(join(c.cwd, 'existing'));
  await writeFile(join(c.cwd, 'existing', 'demo.svg'), 'original svg bytes');
  await writeFile(join(c.cwd, 'existing-file'), 'original file bytes');
  for (const name of ['existing', 'existing-file', '.']) {
    assert.equal(await runPreview({ ...c.base, argv: ['--out', name, '--', 'anything'],
      spawnProcess: () => assert.fail('must not spawn') }), 1);
  }
  assert.equal(await readFile(join(c.cwd, 'existing', 'demo.svg'), 'utf8'), 'original svg bytes');
  assert.equal(await readFile(join(c.cwd, 'existing-file'), 'utf8'), 'original file bytes');
  assert.deepEqual((await readdir(c.cwd)).sort(), ['existing', 'existing-file']);
});

test('existing directory symlink is rejected and its target is unchanged', async t => {
  const c = await context(t);
  const target = join(c.root, 'target'); await mkdir(target); await writeFile(join(target, 'keep'), 'original bytes');
  const link = join(c.cwd, 'link');
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await runPreview({ ...c.base, argv: ['--out', 'link', '--', 'anything'],
    spawnProcess: () => assert.fail('must not spawn') }), 1);
  assert.equal(await readFile(join(target, 'keep'), 'utf8'), 'original bytes');
  assert.deepEqual(await readdir(target), ['keep']);
});

test('demo invokes the bundled source script through the actual Node executable', async t => {
  const c = await context(t);
  assert.equal(await runPreview({ ...c.base, argv: ['--demo'], nodeExecutable: '/test/node executable',
    spawnProcess: c.engine() }), 0);
  assert.deepEqual(c.calls[0].args.slice(5, -2), ['--cols', '54', '--rows', '8', '--window', '--title', 'cmdgif', '--']);
  assert.equal(c.calls[0].args.at(-2), '/test/node executable');
  assert.match(c.calls[0].args.at(-1), /preview-demo\.mjs$/);
  assert.equal(c.calls[0].args.length, 15);
});

test('start failure or invalid executable result removes only its empty output directory', async t => {
  const c = await context(t);
  for (const settings of [{ startError: true }, { code: 1, files: false }]) {
    assert.equal(await runPreview({ ...c.base, argv: ['--', 'missing-command'], spawnProcess: c.engine(settings) }), 1);
    assert.deepEqual(await readdir(c.cwd), []);
  }
});

test('missing results are not success and unrelated partial files are retained', async t => {
  const c = await context(t);
  assert.equal(await runPreview({ ...c.base, argv: ['--out', 'partial', '--', 'node'],
    spawnProcess: c.engine({ code: 0, files: false, extraFile: true }) }), 1);
  assert.equal(await readFile(join(c.cwd, 'partial', 'keep-me.txt'), 'utf8'), 'fixture-owned data');
});

test('npm-style symlink entry executes offline help', { skip: process.platform === 'win32' }, async t => {
  const c = await context(t);
  const link = join(c.root, 'command-demo');
  await symlink(fileURLToPath(new URL('../bin/preview-cli.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, '--help'], { cwd: c.cwd, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.deepEqual(await readdir(c.cwd), []);
});

test('demo source produces real bounded Node output without creating files', async t => {
  const c = await context(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/preview-demo.mjs', import.meta.url))],
    { cwd: c.cwd, env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\x1b\[36mcmdgif demo/);
  assert.match(result.stdout, /Done\. This was actual Node output\./);
  assert.deepEqual(await readdir(c.cwd), []);
});
