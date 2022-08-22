import { stat, mkdir, access, constants, readdir, rm, copyFile, utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * A helper class with static methods to perform common filesystem operations
 * related to files synchronization. This is used in both naive and active sync classes.
 */
export class FsHelper {
  /**
   * Copies a single file to the target destination.
   * 
   * @param source The absolute location of the file to copy
   * @param target The absolute location of the target file
   */
  static async copyFile(source: string, target: string): Promise<void> {
    const dir = dirname(target);
    await this.ensureDir(dir);
    const exists = await this.pathExists(target);
    if (exists) {
      // if the file exists, we copy it only if it's different.
      const sourceInfo = await stat(source);
      const targetInfo = await stat(target);
      // when the mtime (modification time) is equal then these files are the same.
      // Note, the modification time in both files may be off by portion of a millisecond so we
      // take a delta between the two times and if rounded value is 0 then these files are equal.
      const delta = Math.abs(Math.round(sourceInfo.mtimeMs - targetInfo.mtimeMs));
      if (delta === 0) {
        // eslint-disable-next-line no-console
        // console.info(`Skipping file ${source}: already synced.`);
        return;
      }
      // things to consider:
      // - should we check for the size of the file as well? (.size property)? I think checking for the modification time is better
      // - is there any other modification to a file we should consider when checking for file equality?
      // - we do not compare contents of the file as this would be very expensive operation (read buffer and compare it). Modification time would be a better indicator of change.
    }
    // console.info('Copying file', source);
    // we copy the file
    await copyFile(source, target, constants.COPYFILE_FICLONE);
    // and then we change the access and modification time
    const sourceInfo = await stat(source);
    await utimes(target, sourceInfo.atime, sourceInfo.mtime);
  }

  /**
   * Copies a directory ans all sub-folders and files in it.
   * 
   * @param source The absolute location of the directory to copy
   * @param target The absolute location of the target name of the directory
   */
  static async copyDirectory(source: string, target: string): Promise<void> {
    await this.ensureDir(target);
    const entries = await readdir(source, { withFileTypes: true, encoding: 'utf8' });
    for (const entry of entries) {
      const srcFile = join(source, entry.name);
      const destFile = join(target, entry.name);
      const srcStat = await stat(srcFile);
      if (srcStat.isDirectory()) {
        await this.copyDirectory(srcFile, destFile);
      } else {
        await this.copyFile(srcFile, destFile);
      }
    }
  }

  /**
   * Checks whether a file exists in the location.
   */
  static async pathExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Ensures the directory exists.
   */
  static async ensureDir(dirPath: string): Promise<void> {
    const readable = await this.canRead(dirPath);
    if (readable) {
      return;
    }
    await mkdir(dirPath, { recursive: true });
  }

  /**
   * Tests a user's permissions for the file or directory specified by filePath.
   * 
   * @param filePath The path to test
   * @returns True when the path can be read by the current user.  
   */
  static async canRead(filePath: string): Promise<boolean> {
    const exists = await this.pathExists(filePath);
    if (!exists) {
      return false;
    }
    try {
      await access(filePath, constants.R_OK);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Tests a user's permissions for the file or directory specified by filePath.
   * 
   * @param filePath The path to test
   * @returns True when the path can be written to by the current user.  
   */
  static async canWrite(filePath: string): Promise<boolean> {
    const exists = await this.pathExists(filePath);
    if (!exists) {
      return false;
    }
    try {
      await access(filePath, constants.W_OK);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Removes contents of the directory, leaving the directory in the filesystem.
   */
  static async emptyDir(dirPath: string): Promise<void> {
    const exists = await this.pathExists(dirPath);
    if (!exists) {
      return;
    }
    const writeable = await this.canWrite(dirPath);
    if (!writeable) {
      throw new Error(`Unable to clear directory: ${dirPath}. Access is denied.`);
    }
    const items = await readdir(dirPath, 'utf8');
    for (const item of items) {
      const file = join(dirPath, item);
      await rm(file, { recursive: true });
    }
  }
}
