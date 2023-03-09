// @ts-check
import { spawn } from 'child_process'
import * as core from "@actions/core"
import * as helpers from './helpers'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * @returns {boolean}
 */
export const useSudoPrefix = () => {
  const input = core.getInput("sudo");
  return input === "auto" ? os.userInfo().uid !== 0 : input === "true";
}

/**
 * @param {string} cmd
 * @returns {Promise<string>}
 */
export const execShellCommand = (cmd) => {
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
 * @param {string} key
 * @param {RegExp} re regex to use for validation
 * @return {string} {undefined} or throws an error if input doesn't match regex
 */
export const getValidatedInput = (key, re) => {
  const value = core.getInput(key);
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

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @return {string} */
export function getTmateExecutablePath() {
  if (process.platform === 'win32') {
    return 'CHERE_INVOKING=1 tmate'
  } else if (
    core.getInput('install-dependencies') !== 'false' &&
    process.platform !== 'darwin'
  ) {
    return path.join(path.join(os.tmpdir(), 'tmate'), 'tmate')
  } else {
    return 'tmate'
  }
}

/** @return {string} */
function getTmateSocketPath() {
  return process.platform === 'win32'
    ? 'C:/msys64/tmp/tmate.sock'
    : '/tmp/tmate.sock'
}

/** @return {string} */
export function getTmate() {
  return `${getTmateExecutablePath()} -S ${getTmateSocketPath()}`
}

export async function waitUntilDebuggingSessionExit() {
  const [tmateSSH, tmateWeb] = await getTmateConnectionStrings()

  core.debug('Entering main loop')
  while (true) {
    showTmateConnectionStrings(tmateSSH, tmateWeb)

    if (continueFileExists()) {
      core.info(
        'Exiting debugging session because the continue file was created'
      )
      break
    }

    if (didTmateQuit()) {
      core.info("Exiting debugging session 'tmate' quit")
      break
    }

    await sleep(parseInt(core.getInput('wait-interval')))

    if (
      core.getInput('check-num-clients') !== 'false' &&
      !(await doesTmateHaveConnectedClients())
    ) {
      core.info("Exiting debugging session because 'tmate' has no clients")
      break
    }
  }
}

export function showTmateConnectionStrings(tmateSSH, tmateWeb) {
  if (tmateWeb) {
    core.info(`Web shell: ${tmateWeb}`)
  }
  core.info(`SSH: ${tmateSSH}`)
}

/** @return {Promise<[string, string]>} */
export async function getTmateConnectionStrings() {
  const tmate = getTmate()

  core.debug('Fetching connection strings')
  const tmateSSH = await helpers.execShellCommand(
    `${tmate} display -p '#{tmate_ssh}'`
  )
  const tmateWeb = await helpers.execShellCommand(
    `${tmate} display -p '#{tmate_web}'`
  )

  return [tmateSSH, tmateWeb]
}

/** @return {Promise<boolean>} */
async function doesTmateHaveConnectedClients() {
  const tmate = getTmate()
  const tmateNumClients = await helpers.execShellCommand(
    `${tmate} display -p '#{tmate_num_clients}' || echo '0'`
  )
  return tmateNumClients !== '0'
}

/**  @return {boolean} */
function didTmateQuit() {
  return !fs.existsSync(getTmateSocketPath())
}

/** @return {boolean} */
function continueFileExists() {
  const continuePath =
    process.platform === 'win32' ? 'C:/msys64/continue' : '/continue'
  return (
    fs.existsSync(continuePath) ||
    fs.existsSync(path.join(process.env.GITHUB_WORKSPACE, 'continue'))
  )
}
