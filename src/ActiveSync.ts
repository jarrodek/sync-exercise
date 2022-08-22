import { FSWatcher, watch } from 'chokidar';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FsHelper } from './FsHelper.js';

/**
 * A class that registers an event listener on the source directory and when something inside change
 * it propagate the change to the source.
 */
export class ActiveSync {
  /**
   * The flag determining that the "ready" event was dispatched by the "chokidar" library.
   * All events dispatched before the "ready" even are ignored.
   * 
   * This property is "protected" so it cannot be set from the outside of the class.
   */
  protected ready = false;

  /**
   * The instance of the "FSWatcher" object used to cancel observers.
   */
  protected watcher?: FSWatcher;

  /**
   * @param inPath The source folder. The folder must already exist and be readable.
   * @param outPath The destination folder. The folder must already exist and be writeable.
   * @param signal The abort signal to use when the program was terminated.
   */
  constructor(protected inPath: string, protected outPath: string, protected signal: AbortSignal) {
    this._addHandler = this._addHandler.bind(this);
    this._addDirHandler = this._addDirHandler.bind(this);
    this._changeHandler = this._changeHandler.bind(this);
    this._unlinkHandler = this._unlinkHandler.bind(this);
    this._unlinkDirHandler = this._unlinkDirHandler.bind(this);
    this._readyHandler = this._readyHandler.bind(this);
    this._abortHandler = this._abortHandler.bind(this);

    // Uncomment when maintainers of NodeJS typings fix the `AbortSignal` types definition.
    // signal.addEventListener('abort', this._abortHandler, { once: true });
  }

  /**
   * Registers an event listener on the source directory.
   */
  run(): void {
    // recursive: true, signal: this.signal
    const watcher = watch(this.inPath, { 
      persistent: true, 
      ignorePermissionErrors: true,
    });
    watcher.addListener('add', this._addHandler);
    watcher.addListener('addDir', this._addDirHandler);
    watcher.addListener('change', this._changeHandler);
    watcher.addListener('unlink', this._unlinkHandler);
    watcher.addListener('unlinkDir', this._unlinkDirHandler);
    watcher.addListener('ready', this._readyHandler);
    this.watcher = watcher;
  }

  /**
   * Aborts the watcher, if any and cleans up.
   */
  abort(): void {
    const { watcher } = this;
    if (!watcher) {
      return;
    }

    watcher.close();
    watcher.removeListener('add', this._addHandler);
    watcher.removeListener('addDir', this._addDirHandler);
    watcher.removeListener('change', this._changeHandler);
    watcher.removeListener('unlink', this._unlinkHandler);
    watcher.removeListener('unlinkDir', this._unlinkDirHandler);
  }

  /**
   * Resolves the given path to the relative file path to the source directory.
   * 
   * @param path The path to resolve.
   * @returns The relative to the source path of the file.
   */
  resolveSource(path: string): string {
    const { inPath } = this;
    // the `path` is the absolute path of the created file. We need to learn what is 
    // the path to the created file relative to the `inPath`.
    let result = path.replace(inPath, '');
    // if (result.startsWith('/')) {
    //   // we remove any "/" at the beginning to avoid double separators
    //   result = result.substring(1);
    // }
    return result;
  }

  /**
   * Resolves the path of the source file to the absolute path of the target file.
   * 
   * @param path The absolute path of the source file
   * @returns The absolute path to the target file
   */
  resolveTarget(path: string): string {
    const { outPath } = this;
    const relativeSourcePath = this.resolveSource(path);
    return join(outPath, relativeSourcePath);
  }

  /**
   * A handler for the "add" event representing the add file event.
   * 
   * @param path The path at which the file was added
   */
  protected async _addHandler(path: string): Promise<void> {
    if (!this.ready) {
      return;
    }
    const readable = await FsHelper.canRead(path);
    if (!readable) {
      // we can't do anything about that....
      return;
    }
    const destFile = this.resolveTarget(path);
    await FsHelper.copyFile(path, destFile);
  }

  /**
   * A handler for the "addDir" event representing the add directory event.
   * 
   * @param path The path at which the directory was added
   */
  protected async _addDirHandler(path: string): Promise<void> {
    if (!this.ready) {
      return;
    }
    const readable = await FsHelper.canRead(path);
    if (!readable) {
      // we can't do anything about that....
      return;
    }
    const destFile = this.resolveTarget(path);
    await FsHelper.copyDirectory(path, destFile);
  }

  /**
   * A handler for the event dispatched when a file has changed.
   * 
   * @param path The path to the changed file.
   */
  protected async _changeHandler(path: string): Promise<void> {
    if (!this.ready) {
      return;
    }
    const readable = await FsHelper.canRead(path);
    if (!readable) {
      // we can't do anything about that....
      return;
    }
    const destFile = this.resolveTarget(path);
    // the copy file function has checks to only copy a file that actually changed.
    await FsHelper.copyFile(path, destFile);
  }

  /**
   * A handler for an event dispatched when a file was deleted (unlinked from the filesystem).
   * @param path The location of the file that has been removed from the filesystem.
   */
  protected async _unlinkHandler(path: string): Promise<void> {
    if (!this.ready) {
      return;
    }
    const destFile = this.resolveTarget(path);
    const exists = await FsHelper.pathExists(destFile);
    if (!exists) {
      // file does not exist, we can ignore it.
      return;
    }
    const writeable = await FsHelper.canWrite(destFile);
    if (!writeable) {
      // we can't really do much about that...
      return;
    }
    await rm(destFile);
  }

  /**
   * A handler for an event dispatched when a directory was deleted (unlinked from the filesystem).
   * Note, the "chokidar" library will dispatch file unlink events for files inside this directory.
   * 
   * @param path The location of the directory that has been removed from the filesystem.
   */
  protected async _unlinkDirHandler(path: string): Promise<void> {
    if (!this.ready) {
      return;
    }
    const destFile = this.resolveTarget(path);
    const exists = await FsHelper.pathExists(destFile);
    if (!exists) {
      // file does not exist, we can ignore it.
      return;
    }
    const writeable = await FsHelper.canWrite(destFile);
    if (!writeable) {
      // we can't really do much about that...
      return;
    }
    // we use node's `rm` function with the `recursive` flag.
    await rm(destFile, { recursive: true });
  }
  
  /**
   * A handler for the event dispatched when the "chokidar" library is ready (discovered all files).
   * This sets the "ready" flag.
   */
  protected _readyHandler(): void {
    this.ready = true;
    this.watcher?.removeListener('ready', this._readyHandler);
  }

  /**
   * A handler for the "abort" event dispatched by the AbortSignal instance passed to the constructor.
   */
  protected _abortHandler(): void {
    this.abort();
  }
}
