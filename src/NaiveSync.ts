import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FsHelper } from './FsHelper.js';

/**
 * A class that performs synchronization from one folder to another
 * keeping the target's filesystem structure a reflection of the source.
 * 
 * We call it a "naive" because it only perform the sync at the time 
 * when the class is executed and is unaware of any changes happening to the structure during and after the sync.
 */
export class NaiveSync {
  /**
   * Whether the sync process was aborted.
   */
  aborted = false;

  /**
   * @param inPath The source folder. The folder must already exist and be readable.
   * @param outPath The destination folder. The folder must already exist and be writeable.
   * @param signal The abort signal to use when the program was terminated.
   */
  constructor(protected inPath: string, protected outPath: string, protected signal: AbortSignal) {
    this._abortHandler = this._abortHandler.bind(this);

    // Uncomment when maintainers of NodeJS typings fix the `AbortSignal` types definition.
    // signal.addEventListener('abort', this._abortHandler, { once: true });
  }

  /**
   * Performs the one time synchronization of the files.
   */
  async run(): Promise<void> {
    // first we remove all items that are in the outPath that are not in the inPath.
    await this._cleanupOutPath();
    const files = await readdir(this.inPath, { withFileTypes: true });
    for (const file of files) {
      const src = join(this.inPath, file.name);
      const target = join(this.outPath, file.name);
      if (file.isDirectory()) {
        await FsHelper.copyDirectory(src, target);
      } else if (file.isFile()) {
        await FsHelper.copyFile(src, target);
      }
      // for the purpose of this exercise we ignore other types of files.
    }
  }

  /**
   * Aborts the current process.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * A handler for the "abort" event dispatched by the AbortSignal instance passed to the constructor.
   */
  protected _abortHandler(): void {
    this.abort();
  }

  /**
   * Removes any remaining files from the out path that does not exist in the in path anymore.
   * 
   * @param outDir The out directory to scan.
   */
  protected async _cleanupOutPath(outDir = this.outPath): Promise<void> {
    const files = await readdir(outDir, { withFileTypes: true });
    let inDir = '';
    if (outDir === this.outPath) {
      inDir = this.inPath;
    } else {
      const relative = outDir.replace(this.outPath, '');
      inDir = join(this.inPath, relative);
    }
    for (const file of files) {
      const src = join(inDir, file.name);
      const target = join(outDir, file.name);
      const sourceExists = await FsHelper.pathExists(src);
      if (sourceExists && file.isFile()) {
        // when the source path with the same relative path exists
        // then we skip to the next file.
        continue;
      }
      if (sourceExists && file.isDirectory()) {
        // in a case of a directory we have to repeat the whole process
        await this._cleanupOutPath(target);
        continue;
      }
      // otherwise we delete the file in the destination.
      if (file.isDirectory()) {
        await rm(target, { recursive: true });
      } else if (file.isFile()) {
        await rm(target);
      }
    }
  }
}
