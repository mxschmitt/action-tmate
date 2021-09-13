// @ts-check
import { spawn } from 'child_process'

/**
 * @param {string} cmd
 * @returns {Promise<string>}
 */
export const execShellCommand = (cmd) => {
  return new Promise((resolve, reject) => {
    const proc = process.platform !== "win32" ?
      spawn(cmd, [], { shell: true }) :
      spawn("C:\\msys64\\usr\\bin\\bash.exe", ["-lc", cmd], {
        env: {
          ...process.env,
          "MSYS2_PATH_TYPE": "inherit", /* Inherit previous path */
          "CHERE_INVOKING": "1", /* do not `cd` to home */
          "MSYSTEM": "MINGW64", /* include the MINGW programs in C:/msys64/mingw64/bin/ */
        }
      })
    let stdout = ""
    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data)
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(code ? code.toString() : undefined))
      }
      resolve(stdout.trim())
    });
  });
}

/**
 * @param {string} host
 * @param {string} port
 * @param {string} rsaFingerprint
 * @param {string} ed25519Fingerprint
 * @return {Promise<string>}
 */
const isValidInputOwnServer = (host, port, rsaFingerprint, ed25519Fingerprint) => {
  return new Promise((resolve, reject) => {
    if (!host && !port && !rsaFingerprint && !ed25519Fingerprint) {
      return resolve()
    };

    // validate port
    const parsedPort = parseInt(port, 10)
    if (isNaN(parsedPort)) {
      return reject(new Error("tmate-server-port is not a valid integer"))
    } else if (parsedPort < 1 || 65535 < parsedPort) {
      return reject(new Error("tmate-server-port does not contain a valid range"))
    };

    // validate fingerprint
    const validFingerprintPrefix = "SHA256:"
    if (!rsaFingerprint.startsWith(validFingerprintPrefix)) {
      return reject(new Error("tmate-server-rsa-fingerprint has no prefix SHA256:"))
    };
    if (!ed25519Fingerprint.startsWith(validFingerprintPrefix)) {
      return reject(new Error("tmate-server-ed25519-fingerprint has no prefix SHA256:"))
    };

    return resolve()
  });
}
