// @ts-check
import os from "os"
import fs from "fs"
import path from "path"
import * as core from "@actions/core"
import * as github from "@actions/github"
import * as tc from "@actions/tool-cache"
import { Octokit } from "@octokit/rest"

import { execShellCommand, getValidatedInput, getLinuxDistro, useSudoPrefix } from "./helpers"

const TMATE_LINUX_VERSION = "2.4.0"

// Map os.arch() values to the architectures in tmate release binary filenames.
// Possible os.arch() values documented here:
// https://nodejs.org/api/os.html#os_os_arch
// Available tmate binaries listed here:
// https://github.com/tmate-io/tmate/releases/
const TMATE_ARCH_MAP = {
  arm64: 'arm64v8',
  x64: 'amd64',
};

/** @param {number} ms */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function run() {
  try {
    /*  Indicates whether the POST action is running */
    if (!!core.getState('isPost')) {
      const message = core.getState('message')
      const tmate = core.getState('tmate')
      if (tmate && message) {
        const shutdown = async () => {
          core.error('Got signal')
          await execShellCommand(`${tmate} kill-session`)
          process.exit(1)
        }
        // This is needed to fully support canceling the post-job Action, for details see
        // https://docs.github.com/en/actions/managing-workflow-runs/canceling-a-workflow#steps-github-takes-to-cancel-a-workflow-run
        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
        core.debug("Waiting")
        const hasAnyoneConnectedYet = (() => {
          let result = false
          return async () => {
            return result ||=
              !didTmateQuit()
              && '0' !== await execShellCommand(`${tmate} display -p '#{tmate_num_clients}'`, { quiet: true })
          }
        })()

        let connectTimeoutSeconds = parseInt(core.getInput("connect-timeout-seconds"))
        if (Number.isNaN(connectTimeoutSeconds) || connectTimeoutSeconds <= 0) {
          connectTimeoutSeconds = 10 * 60
        }

        for (let seconds = connectTimeoutSeconds; seconds > 0; ) {
          console.log(`${
            await hasAnyoneConnectedYet()
            ? 'Waiting for session to end'
            : `Waiting for client to connect (at most ${seconds} more second(s))`
          }\n${message}`)

          if (continueFileExists()) {
            core.info("Exiting debugging session because the continue file was created")
            break
          }

          if (didTmateQuit()) {
            core.info("Exiting debugging session 'tmate' quit")
            break
          }

          await sleep(5000)
          if (!await hasAnyoneConnectedYet()) seconds -= 5
        }
      }
      return
    }

    let tmateExecutable = "tmate"
    if (core.getInput("install-dependencies") !== "false") {
      core.debug("Installing dependencies")
      if (process.platform === "darwin") {
        await execShellCommand('brew install tmate');
      } else if (process.platform === "win32") {
        await execShellCommand('pacman -S --noconfirm tmate');
      } else {
        const optionalSudoPrefix = useSudoPrefix() ? "sudo " : "";
        const distro = await getLinuxDistro();
        core.debug("linux distro: [" + distro + "]");
        if (distro === "alpine") {
          // for set -e workaround, we need to install bash because alpine doesn't have it
          await execShellCommand(optionalSudoPrefix + 'apk add openssh-client xz bash');
        } else if (distro === "arch") {
          // partial upgrades are not supported so also upgrade everything
          await execShellCommand(optionalSudoPrefix + 'pacman -Syu --noconfirm xz openssh');
        } else if (distro === "fedora" || distro === "centos" || distro === "rhel" || distro === "almalinux") {
          await execShellCommand(optionalSudoPrefix + 'dnf install -y xz openssh');
        } else {
          await execShellCommand(optionalSudoPrefix + 'apt-get update');
          await execShellCommand(optionalSudoPrefix + 'apt-get install -y openssh-client xz-utils');
        }

        const tmateArch = TMATE_ARCH_MAP[os.arch()];
        if (!tmateArch) {
          throw new Error(`Unsupported architecture: ${os.arch()}`)
        }
        const tmateReleaseTar = await tc.downloadTool(`https://github.com/tmate-io/tmate/releases/download/${TMATE_LINUX_VERSION}/tmate-${TMATE_LINUX_VERSION}-static-linux-${tmateArch}.tar.xz`);
        const tmateDir = path.join(os.tmpdir(), "tmate")
        tmateExecutable = path.join(tmateDir, "tmate")

        if (fs.existsSync(tmateExecutable))
          fs.unlinkSync(tmateExecutable)
        fs.mkdirSync(tmateDir, { recursive: true })
        await execShellCommand(`tar x -C ${tmateDir} -f ${tmateReleaseTar} --strip-components=1`)
        fs.unlinkSync(tmateReleaseTar)
      }
      core.debug("Installed dependencies successfully");
    }

    if (process.platform === "win32") {
      tmateExecutable = 'CHERE_INVOKING=1 tmate'
    } else {
      core.debug("Generating SSH keys")
      fs.mkdirSync(path.join(os.homedir(), ".ssh"), { recursive: true })
      try {
        await execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
      } catch { }
      core.debug("Generated SSH-Key successfully")
    }

    let newSessionExtra = ""
    let tmateSSHDashI = ""
    let publicSSHKeysWarning = ""
    const limitAccessToActor = core.getInput("limit-access-to-actor")
    if (limitAccessToActor === "true" || limitAccessToActor === "auto") {
      const { actor, apiUrl } = github.context
      const auth = core.getInput('github-token')
      const octokit = new Octokit({ auth, baseUrl: apiUrl, request: { fetch }});

      const keys = await octokit.users.listPublicKeysForUser({
        username: actor
      })
      if (keys.data.length === 0) {
        if (limitAccessToActor === "auto") publicSSHKeysWarning = `No public SSH keys found for ${actor}; continuing without them even if it is less secure (please consider adding an SSH key, see https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)`
        else throw new Error(`No public SSH keys registered with ${actor}'s GitHub profile`)
      } else {
        const sshPath = path.join(os.homedir(), ".ssh")
        await fs.promises.mkdir(sshPath, { recursive: true })
        const authorizedKeysPath = path.join(sshPath, "authorized_keys")
        await fs.promises.writeFile(authorizedKeysPath, keys.data.map(e => e.key).join('\n'))
        newSessionExtra = `-a "${authorizedKeysPath}"`
        tmateSSHDashI = "ssh -i <path-to-private-SSH-key>"
      }
    }

    const tmate = `${tmateExecutable} -S /tmp/tmate.sock`;

    // Work around potential `set -e` commands in `~/.profile` (looking at you, `setup-miniconda`!)
    await execShellCommand(`echo 'set +e' >/tmp/tmate.bashrc`);
    let setDefaultCommand = `set-option -g default-command "bash --rcfile /tmp/tmate.bashrc" \\;`;

    // The regexes used here for validation are lenient, i.e. may accept
    // values that are not, strictly speaking, valid, but should be good
    // enough for detecting obvious errors, which is all we want here.
    const options = {
      "tmate-server-host": /^[a-z\d\-]+(\.[a-z\d\-]+)*$/i,
      "tmate-server-port": /^\d{1,5}$/,
      "tmate-server-rsa-fingerprint": /./,
      "tmate-server-ed25519-fingerprint": /./,
    }

    for (const [key, option] of Object.entries(options)) {
      if (core.getInput(key) === '')
        continue;
      const value = getValidatedInput(key, option);
      if (value !== undefined) {
        setDefaultCommand = `${setDefaultCommand} set-option -g ${key} "${value}" \\;`;
      }
    }

    core.debug("Creating new session")
    await execShellCommand(`${tmate} ${newSessionExtra} ${setDefaultCommand} new-session -d`);
    await execShellCommand(`${tmate} wait tmate-ready`);
    core.debug("Created new session successfully")

    core.debug("Fetching connection strings")
    const tmateSSH = await execShellCommand(`${tmate} display -p '#{tmate_ssh}'`);
    const tmateWeb = await execShellCommand(`${tmate} display -p '#{tmate_web}'`);

    /*
      * Publish a variable so that when the POST action runs, it can determine
      * it should run the appropriate logic. This is necessary since we don't
      * have a separate entry point.
      *
      * Inspired by https://github.com/actions/checkout/blob/v3.1.0/src/state-helper.ts#L56-L60
      */
    core.saveState('isPost', 'true')

    const detached = core.getInput("detached")
    if (detached === "true") {
      core.debug("Entering detached mode")

      let message = ''
      if (publicSSHKeysWarning) {
        message += `::warning::${publicSSHKeysWarning}\n`
      }
      if (tmateWeb) {
        message += `::notice::Web shell: ${tmateWeb}\n`
      }
      message += `::notice::SSH: ${tmateSSH}\n`
      if (tmateSSHDashI) {
        message += `::notice::or: ${tmateSSH.replace(/^ssh/, tmateSSHDashI)}\n`
      }
      core.saveState('message', message)
      core.saveState('tmate', tmate)
      console.log(message)
      return
    }

    core.debug("Entering main loop")
    while (true) {
      if (publicSSHKeysWarning) {
        core.warning(publicSSHKeysWarning)
      }
      if (tmateWeb) {
        core.info(`Web shell: ${tmateWeb}`);
      }
      core.info(`SSH: ${tmateSSH}`);
      if (tmateSSHDashI) {
        core.info(`or: ${tmateSSH.replace(/^ssh/, tmateSSHDashI)}`)
      }

      if (continueFileExists()) {
        core.info("Exiting debugging session because the continue file was created")
        break
      }

      if (didTmateQuit()) {
        core.info("Exiting debugging session 'tmate' quit")
        break
      }

      await sleep(5000)
    }

  } catch (error) {
    core.setFailed(error);
  }
}

function didTmateQuit() {
  const tmateSocketPath = process.platform === "win32" ? "C:/msys64/tmp/tmate.sock" : "/tmp/tmate.sock"
  return !fs.existsSync(tmateSocketPath)
}

function continueFileExists() {
  const continuePath = process.platform === "win32" ? "C:/msys64/continue" : "/continue"
  return fs.existsSync(continuePath) || fs.existsSync(path.join(process.env.GITHUB_WORKSPACE, "continue"))
}
