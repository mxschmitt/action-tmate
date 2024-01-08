// @ts-check
import { spawn } from 'child_process'
import * as core from "@actions/core"
import fs from 'fs'
import os from 'os'
import process from "process"

/**
 * @returns {boolean}
 */
export const useSudoPrefix = () => {
  const input = core.getInput("sudo");
  return input === "auto" ? os.userInfo().uid !== 0 : input === "true";
}

/**
 * @param {string} cmd
 * @param {{quiet: boolean} | undefined} [options]
 * @returns {Promise<string>}
 */
export const execShellCommand = (cmd, options) => {
  core.debug(`Executing shell command: [${cmd}]`)
  return new Promise((resolve, reject) => {
    const proc = process.platform !== "win32" ?
      spawn(cmd, [], {
        shell: true,
        env: {
          ...process.env,
          HOMEBREW_GITHUB_API_TOKEN: core.getInput('github-token') || undefined
        }
      }) :
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
      if (!options || !options.quiet) process.stdout.write(data);
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
 * @param {string} key
 * @param {RegExp} re regex to use for validation
 * @return {string|undefined} {undefined} or throws an error if input doesn't match regex
 */
export const getValidatedEnvVars = (key, re) => {
  const value = process.env[key.toUpperCase()] || ""
  if (value !== undefined && !re.test(value)) {
    throw new Error(`Invalid value for '${key}': '${value}'`);
  }
  return value;
}


/**
 * @return {Promise<string>}
 */
export const getLinuxDistro = async () => {
  try {
    const osRelease = await fs.promises.readFile("/etc/os-release")
    const match = osRelease.toString().match(/^ID=(.*)$/m)
    return match ? match[1] : "(unknown)"
  } catch (e) {
    return "(unknown)"
  }
}
