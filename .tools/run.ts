import childProcess from "child_process";
import sysPath from "path";
import meta from "./meta";

const FLASHPLAYER_PATH = "flashplayerdebugger";
const PROJECT_ROOT = sysPath.resolve(meta.dirname, "..");

interface ExecFileError extends Error {
  code: number;
  killed: boolean;
}

export async function runSwf(absPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    childProcess.execFile(
      FLASHPLAYER_PATH,
      [absPath],
      {cwd: PROJECT_ROOT, timeout: 20000},
      (internalErr: Error | null, stdout: string | Buffer, stderr: string | Buffer): void => {
        const err: ExecFileError | null = internalErr as any;
        if (err === null || err.code === 1) {
          resolve();
          return;
        }
        if (err.killed) {
          reject(new Error(`Spawned flashplayer timed-out: ${absPath}`));
        } else {
          reject(new Error(`Unexpected result for spawned flashplayer: ${absPath}: ${err}`));
        }
      },
    );
  });
}
