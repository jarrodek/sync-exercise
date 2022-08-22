import { CommanderError } from 'commander';
import { normalize, isAbsolute, join } from 'node:path';
import { cwd, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';
import chalk from 'chalk';
import * as Validators from './Validators.js';
import { NaiveSync } from './NaiveSync.js';
import { ActiveSync } from './ActiveSync.js';

/**
 * A class responsible for synchronizing files from one folder to another.
 * 
 * Our program uses two classes to perform the synchronization.
 * The NaiveSync performs a synchronization as is without observing files.
 * This makes sure the files located in the "in" directory are copied to the target location
 * and files located in the target and not located in the source are deleted.
 * 
 * After that we do ActiveSync by using the "chokidar" library to observe files change.
 * This could be done using native fs.* functions but NodeJS' support for file change observers
 * is less than ideal. This library fixes the differences between platforms for us.
 * The `ActiveSync` class makes changes in the target location when anything change in the source folder.
 */
export class Sync {
  ctrl: AbortController;

  /**
   * A reference to the `ActiveSync` class so it can be aborted when requested.
   * 
   * Note, this should be done by the `AbortController` (the `ctrl` field) but someone fucked up
   * the types definition for node 18 and according to these definitions the `AbortController` does not
   * extend the `EventTarget` interface so TypeScript won't allow me to add "abort" event listener
   * on the `AbortSignal` instance...
   */
  active?: ActiveSync;

  /**
   * A reference to the `NaiveSync` class so it can be aborted when requested.
   */
  naive?: NaiveSync;

  /**
   * Whether the sync process was aborted.
   */
  aborted = false;

  /**
   * @param inArg The source folder. If the folder does not exist or the current user has no read access to it the program throws an error.
   * @param outArg The destination folder. If the folder exists all contents will be removed. If the folder does not exists it will be created.
   */
  constructor(protected inArg: string, protected outArg: string) {
    this.ctrl = new AbortController();
  }

  /**
   * Runs the program.
   * It makes sure the program can read from the source and can write at the destination.
   * Then it synchronizes the list of files and finally attaches an event listener to the source folder
   * that dispatches an event when a file in the destination change.
   */
  async run(): Promise<void> {
    const { inArg, outArg } = this;
    const inPath = this.normalizePath(inArg);
    const outPath = this.normalizePath(outArg);
    await this.assertSource(inPath);
    await this.assertTarget(outPath);

    stdout.write(chalk.gray('\nSynchronizing the source with the destination. Please wait...\n'));

    // a handler for the "ctrl + c" keys to terminate the process.
    process.once('SIGINT', () => {
      this.abort();
    });

    const naiveSync = new NaiveSync(inPath, outPath, this.ctrl.signal);
    this.naive = naiveSync;
    await naiveSync.run();
    // after this point the "naive" class is done and we can clean up.
    this.naive = undefined;

    if (this.aborted) {
      return;
    }

    stdout.write(chalk.gray('Observing changes to the source directory.\n'));

    const activeSync = new ActiveSync(inPath, outPath, this.ctrl.signal);
    // since the active class runs in the background we do not clear the reference to it.
    this.active = activeSync;
    activeSync.run();
  }

  /**
   * Aborts the current process.
   * It sets the `aborted` flag so no new operation is started and informs the running processes to 
   * stop.
   */
  abort(): void {
    stdout.write('\n');
    this.aborted = true;
    this.ctrl.abort();

    // these two lines are to be removed when typings for `AbortSignal` are fixed.
    this.naive?.abort();
    this.active?.abort();
  }

  /**
   * Normalizes the input path to an absolute path.
   * 
   * @param input The user path input.
   * @returns the absolute value of the path. Note, it does not check whether the path exists or references a file of a folder.
   */
  protected normalizePath(input: string): string {
    const result = normalize(input); // the normalize function takes care of the special case of `~/xxx` which leads to home directory.
    if (isAbsolute(result)) {
      return result;
    }
    // the path is not absolute so we resolve it to an absolute path. We take a current working directory and add the path to it.
    return join(cwd(), result);
  }

  /**
   * A function that makes sure the source is a valid readable folder.
   * 
   * This function throws an error specific for the commander library so it is properly handled in the main file.
   * 
   * @param src The absolute location of the source directory.
   */
  protected async assertSource(src: string): Promise<void> {
    const isDir = await Validators.isDirectory(src);
    if (!isDir) {
      throw new CommanderError(-1, 'E_IN_DIR_ERROR', 'The source directory does not exist or the current user has no read access to it.')
    }
    const canRead = await Validators.canRead(src);
    if (!canRead) {
      throw new CommanderError(-1, 'E_IN_DIR_ACCESS', 'The current user has no read access to the source directory.')
    }
  }

  /**
   * This function is more complex than the `assertSource()` function as the target may not exist at the time of calling the program.
   * When the folder exists we check the wrote access only. When the folder does not exist we try to create it in the passed location or die trying.
   * 
   * This function throws an error specific for the commander library so it is properly handled in the main file.
   * 
   * @param src The absolute location of the target directory.
   */
  protected async assertTarget(src: string): Promise<void> {
    if (!await Validators.isPath(src)) {
      await this.createTargetPath(src);
      return;
    }
    if (!await Validators.isDirectory(src)) {
      throw new CommanderError(-1, 'E_OUT_MISMATCH', 'The output path exists but it is not a directory. Correct you path to point to a directory instead.')
    }
    if (!await Validators.canWrite(src)) {
      throw new CommanderError(-1, 'E_OUT_DIR_ACCESS', 'Unable to write to the output directory. Update permissions to the output directory or point to a different place.')
    }
  }

  /**
   * Creates a target directory.
   * @param target The location where to create a target directory.
   */
  protected async createTargetPath(target: string): Promise<void> {
    try {
      await mkdir(target, { recursive: true });
    } catch (_) {
      throw new CommanderError(-1, 'E_OUT_DIR_ACCESS', 'Unable to create the target directory. Perhaps the location is missing the write access?')
    }
  }
}
