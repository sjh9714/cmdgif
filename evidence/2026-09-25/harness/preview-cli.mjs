#!/usr/bin/env node
// Unpublished preview adapter. Rendering remains the MIT-licensed ttysvg engine.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, rmdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0-beta.1';
const HELP = `cmdgif ${VERSION} (beta)

Usage:
  cmdgif --demo
  cmdgif [--out NEW_DIR] -- COMMAND ARG...
  cmdgif --help
  cmdgif --version

Records a real command and saves demo.gif and demo.svg in a new directory.
Without --out, a new demo- directory is created in the current directory.
Existing directories, files, and symlinks are never accepted as --out.
The command keeps your current directory, arguments, environment, and permissions.
Output may contain secrets. Review both files before sharing.
The recorder does not upload files; your command can still use the network.
Files are saved after the command exits. Start with a short command.
Long-running or interactive sessions are not guaranteed by this preview.
Supported bundled assets: Windows x64 and macOS arm64. Node.js 24+ is required.
Uses a modified MIT-licensed ttysvg engine; see LICENSE.ttysvg and UPSTREAM.json.
`;

export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { kind: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { kind: 'version' };
  if (argv.length === 1 && argv[0] === '--demo') return { kind: 'demo' };
  let offset = 0;
  let out;
  if (argv[0] === '--out') {
    out = argv[1];
    if (!out || out === '--' || out.includes('\0')) throw new Error('Use --out NEW_DIR before -- COMMAND.');
    offset = 2;
  }
  const command = argv.slice(offset + 1);
  if (argv[offset] !== '--' || !command[0] || command.some(arg => arg.includes('\0'))) {
    throw new Error('Use --demo or [--out NEW_DIR] -- COMMAND ARG... .');
  }
  return { kind: 'record', command, out };
}

function childStatus(spawnProcess, binary, args, cwd) {
  return new Promise(resolveStatus => {
    let child;
    try { child = spawnProcess(binary, args, { cwd, shell: false, stdio: 'inherit' }); }
    catch { resolveStatus({ code: 1, startError: true }); return; }
    child.once('error', () => resolveStatus({ code: 1, startError: true }));
    child.once('close', (code, signal) => resolveStatus({ code: code ?? 1, signal }));
  });
}

async function regularNonempty(path) {
  try { const info = await lstat(path); return info.isFile() && info.size > 0; }
  catch { return false; }
}

// Dependency injection is for local tests, not a hidden CLI/environment option.
export async function runPreview({
  argv = process.argv.slice(2), cwd = process.cwd(), platform = process.platform,
  arch = process.arch, nodeExecutable = process.execPath, spawnProcess = spawn,
  stdout = process.stdout, stderr = process.stderr, enginePath,
} = {}) {
  let parsed;
  try { parsed = parseArgs(argv); }
  catch (error) { stderr.write(`${error.message}\nRun cmdgif --help for usage.\n`); return 1; }
  if (parsed.kind === 'help') { stdout.write(HELP); return 0; }
  if (parsed.kind === 'version') { stdout.write(`${VERSION}\n`); return 0; }
  if (!((platform === 'win32' && arch === 'x64') || (platform === 'darwin' && arch === 'arm64'))) {
    stderr.write('This preview supports Windows x64 and macOS arm64 only. No command was run.\n');
    return 1;
  }
  const binary = enginePath ?? fileURLToPath(new URL(platform === 'win32' ? './ttysvg.exe' : './ttysvg', import.meta.url));
  try { if (!(await stat(binary)).isFile()) throw new Error('missing_asset'); }
  catch { stderr.write('The bundled recorder is missing. No command was run and no output directory was created.\n'); return 1; }
  const command = parsed.kind === 'demo'
    ? [nodeExecutable, fileURLToPath(new URL('./preview-demo.mjs', import.meta.url))]
    : parsed.command;
  let directory;
  try {
    if (parsed.out !== undefined) {
      directory = resolve(cwd, parsed.out);
      await mkdir(directory, { recursive: false });
    } else {
      directory = await mkdtemp(join(resolve(cwd), 'demo-'));
    }
  } catch {
    stderr.write('Could not create a new output directory. --out must name a new directory with an existing parent; existing paths are not overwritten. No command was run.\n');
    return 1;
  }
  const svg = join(directory, 'demo.svg');
  const gif = join(directory, 'demo.gif');
  // The bundled four-line example has a known size. Do not resize or crop a
  // user's command: its terminal dimensions and output remain the engine default.
  const presentation = parsed.kind === 'demo'
    ? ['--cols', '54', '--rows', '8', '--window', '--title', 'cmdgif'] : [];
  stderr.write('Runs your command with your current permissions; output may contain secrets. Review files before sharing.\n');
  stderr.write('Files are saved when the command exits. This recorder does not upload them; your command can still use the network.\n');
  stderr.write(`Output directory: ${directory}\n`);
  const status = await childStatus(spawnProcess, binary,
    ['record', '--out', svg, '--gif', gif, ...presentation, '--', ...command], cwd);
  const outputs = await Promise.all([regularNonempty(svg), regularNonempty(gif)]);
  if (outputs.every(Boolean)) {
    stdout.write(`Saved GIF: ${gif}\nSaved SVG: ${svg}\n`);
    if (status.code !== 0) stderr.write(`Recorder/command exited with code ${status.code}; review the saved files.\n`);
    return status.code;
  }
  // Remove only the empty directory created above. Never remove partial outputs
  // or anything the recorded command wrote, including on a failed command.
  try { await rmdir(directory); } catch {}
  if (status.startError) stderr.write('Could not start the bundled recorder. No command was run.\n');
  else stderr.write('The recorder did not produce both output files. Any partial files were kept.\n');
  return status.code === 0 ? 1 : status.code;
}

let isEntryPoint = false;
try { isEntryPoint = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
catch {}
if (isEntryPoint) {
  process.exitCode = await runPreview();
}
