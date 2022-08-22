import { stat, access, constants } from 'node:fs/promises';

/**
 * The function that checks whether a path exists (file or a directory).
 * 
 * @param target The location to test
 * @returns `true` if the `target` exists in the filesystem.
 */
export async function isPath(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Checks whether the path exists and is a directory.
 * 
 * @param target The location of the directory.
 * @returns `true` if the `target` is a directory.
 */
export async function isDirectory(target: string): Promise<boolean> {
  try {
    const stats = await stat(target);
    return stats.isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Checks whether the current user can write to the location.
 * 
 * @param target The location to test.
 */
export async function canWrite(target: string): Promise<boolean> {
  try {
    await access(target, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the current user can read from the location.
 * 
 * @param target The location to test.
 */
export async function canRead(target: string): Promise<boolean> {
  try {
    await access(target, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
