import { Command, CommanderError } from 'commander';
import chalk from 'chalk';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { Sync } from './src/sync.js';

// find the path to the directory of this file (index.js) where the program is installed.
const __dirname = dirname(fileURLToPath(import.meta.url));
// create a path to the program's package.json file using the path computed in the previous line.
const pkgFile = join(__dirname, '..', 'package.json');
// Finally I am using a synchronous file read API to read the contents to the package.json file.
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));

// Initializing the Commander to parse the command line arguments.
const program = new Command();
program.version(pkg.version);

const desc = [
  `This program allows to synchronize filesystem structure from one folder to another.`,
  `The program performs uni-directional synchronization.`,
];
program.description(desc.join('\n'));
program.option(
  '-i, --in [directory path]',
  'The source directory to synchronize with the output directory. It can be an absolute or a relative path.'
);
program.option(
  '-o, --out [directory path]',
  'The target directory where the copy of the filesystem structure of the source directory is kept.'
);

program.action(async (opts) => {
  const instance = new Sync(opts.in, opts.out);
  await instance.run();
});

// For convenience I use the async block here to use async/await.
(async (): Promise<void> => {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const cause = err as CommanderError;
    if (['commander.version', 'commander.helpDisplayed'].includes(cause.code)) {
      return;
    }
    const message = cause.message || 'Unknown error';
    let mainMessage = '';
    if (cause.code) {
      mainMessage += `\n[${cause.code}]: `;
    }
    mainMessage += chalk.red(`${message.trim()}\n`);
    process.stderr.write(Buffer.from(mainMessage));
    const hasDebug = process.argv.includes('--debug');
    const { stack } = cause;
    if (hasDebug && stack) {
      const stackMessage = chalk.blackBright(`\n${stack.trim()}\n`);
      process.stderr.write(Buffer.from(stackMessage));
    }
    process.stderr.write(Buffer.from('\n'));
  }
})();
