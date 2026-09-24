// Real local Node output used by --demo. No files, descendants, or network.
import { setTimeout } from 'node:timers/promises';
console.log('\x1b[36mcmdgif demo\x1b[0m');
await setTimeout(150);
console.log('\x1b[32m1. Run a real command\x1b[0m');
await setTimeout(150);
console.log('2. Save its terminal output as GIF and SVG');
await setTimeout(150);
console.log('\x1b[32mDone. This was actual Node output.\x1b[0m');
