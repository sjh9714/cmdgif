// Synthetic data only. The only file write is the harness-owned PID receipt.
import { writeFile } from 'node:fs/promises';
if (process.env.BASELINE_PID_FILE && process.env.BASELINE_RUN_TOKEN) {
  await writeFile(process.env.BASELINE_PID_FILE, JSON.stringify({ pid: process.pid, ppid: process.ppid, token: process.env.BASELINE_RUN_TOKEN }), { flag: 'wx' });
}
const requestedExit = process.argv[2] ?? '7';
if (!['0', '7'].includes(requestedExit)) throw new Error('Expected fixture exit 0 or 7');
setTimeout(() => process.exit(8), 3000).unref();
process.stdout.write('\x1b[32mBASELINE_START green\x1b[0m\r\n');
await new Promise(resolve => setTimeout(resolve, 400));
process.stdout.write('한국어 테스트 / Unicode café\r\n');
await new Promise(resolve => setTimeout(resolve, 400));
process.stdout.write(`BASELINE_END exit=${requestedExit}\r\n`);
await new Promise(resolve => setTimeout(resolve, 200));
process.exitCode = Number(requestedExit);
