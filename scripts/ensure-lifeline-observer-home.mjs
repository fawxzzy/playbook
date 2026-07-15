import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const requestedRoot = args[0];

if (args.length !== 1 || !requestedRoot || path.isAbsolute(requestedRoot)) {
  console.error('ensure-lifeline-observer-home: expected one portable relative runtime-home path');
  process.exitCode = 1;
} else {
  try {
    fs.mkdirSync(path.resolve(process.cwd(), requestedRoot), { recursive: true });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(`ensure-lifeline-observer-home: failed to create ${requestedRoot} (${code})`);
    process.exitCode = 1;
  }
}
