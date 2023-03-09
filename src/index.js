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
        } else if (distro === "fedora") {
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
    if (core.getInput("limit-access-to-actor") === "true") {
      const { actor, apiUrl } = github.context
      const auth = core.getInput('github-token')
      const octokit = new Octokit({ auth, baseUrl: apiUrl })

      const keys = await octokit.users.listPublicKeysForUser({
        username: actor
      })
      if (keys.data.length === 0) {
        throw new Error(`No public SSH keys registered with ${actor}'s GitHub profile`)
      }
      const sshPath = path.join(os.homedir(), ".ssh")
      await fs.promises.mkdir(sshPath, { recursive: true })
      const authorizedKeysPath = path.join(sshPath, "authorized_keys")
      await fs.promises.writeFile(authorizedKeysPath, keys.data.map(e => e.key).join('\n'))
      newSessionExtra = `-a "${authorizedKeysPath}"`
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

    core.debug("Entering main loop")
    while (true) {
      if (tmateWeb) {
        core.info(`Web shell: ${tmateWeb}`);
      }
      core.info(`SSH: ${tmateSSH}`);

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
