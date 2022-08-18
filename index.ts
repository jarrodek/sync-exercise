import { argv } from 'node:process';

const args = argv.slice(2);
let inArg = '';
let syncArg = '';

args.forEach((arg, i) => {
  if (arg === '--in') {
    inArg = args[i + 1];
  } else if (arg === '--sync') {
    syncArg = args[i + 1];
  }
});

if (!inArg) {
  throw new Error('The "--in" argument is required');
}

if (!syncArg) {
  throw new Error('The "--sync" argument is required');
}

// eslint-disable-next-line no-console
console.info(`Syncing ${inArg} with ${syncArg}`);
