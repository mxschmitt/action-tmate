// @ts-check
import os from "os"
import fs from "fs"
import path from "path"
import * as core from "@actions/core"
import * as github from "@actions/github"
import * as tc from "@actions/tool-cache"
import { Octokit } from "@octokit/rest"

import { execShellCommand } from "./helpers"

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
  const optionalSudoPrefix = core.getInput('sudo') === "true" ? "sudo " : "";
  try {
    core.debug("Installing dependencies")
    let tmateExecutable = "tmate"
    if (process.platform === "darwin") {
      await execShellCommand('brew install tmate');
    } else if (process.platform === "win32") {
      await execShellCommand('pacman -Sy --noconfirm tmate');
      tmateExecutable = 'CHERE_INVOKING=1 tmate'
    } else {
      await execShellCommand(optionalSudoPrefix + 'apt-get update');
      await execShellCommand(optionalSudoPrefix + 'apt-get install -y openssh-client xz-utils');

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

    if (process.platform !== "win32") {
      core.debug("Generating SSH keys")
      fs.mkdirSync(path.join(os.homedir(), ".ssh"), { recursive: true })
      try {
        await execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
      } catch { }
      core.debug("Generated SSH-Key successfully")
    }

    let newSessionExtra = ""
    if (core.getInput("limit-access-to-actor") === "true") {
      const { actor } = github.context
      const octokit = new Octokit()

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
    const setDefaultCommand = `set-option -g default-command "bash --rcfile /tmp/tmate.bashrc" \\;`;

    const tmateConfPath = path.join(os.homedir(), ".tmate.conf")
    if (core.getInput("tmate-server-host") !== "") {
      core.debug("Configure your tmate server")
      await execShellCommand(`echo 'set -g tmate-server-host ${core.getInput("tmate-server-host")}' >> ${tmateConfPath}`)
      await execShellCommand(`echo 'set -g tmate-server-port ${core.getInput("tmate-server-port")}' >> ${tmateConfPath}`)
      await execShellCommand(`echo 'set -g tmate-server-rsa-fingerprint ${core.getInput("tmate-server-rsa-fingerprint")}' >> ${tmateConfPath}`)
      await execShellCommand(`echo 'set -g tmate-server-ed25519-fingerprint ${core.getInput("tmate-server-ed25519-fingerprint")}' >> ${tmateConfPath}`)
    }

    core.debug("Creating new session")
    await execShellCommand(`${tmate} ${newSessionExtra} ${setDefaultCommand} new-session -d`);
    await execShellCommand(`${tmate} wait tmate-ready`);
    console.debug("Created new session successfully")

    core.debug("Fetching connection strings")
    const tmateSSH = await execShellCommand(`${tmate} display -p '#{tmate_ssh}'`);
    const tmateWeb = await execShellCommand(`${tmate} display -p '#{tmate_web}'`);

    console.debug("Entering main loop")
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
