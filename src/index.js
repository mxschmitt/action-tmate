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
      await execShellCommand(optionalSudoPrefix + 'apt-get install -y openssh-client');

      const tmateReleaseTar = await tc.downloadTool(`https://github.com/tmate-io/tmate/releases/download/${TMATE_LINUX_VERSION}/tmate-${TMATE_LINUX_VERSION}-static-linux-amd64.tar.xz`);
      const tmateDir = path.join(os.tmpdir(), "tmate")
      tmateExecutable = path.join(tmateDir, "tmate")
      fs.mkdirSync(tmateDir)
      await execShellCommand(`tar x -C ${tmateDir} -f ${tmateReleaseTar} --strip-components=1`)
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

    core.debug("Creating new session")
    await execShellCommand(`${tmateExecutable} -S /tmp/tmate.sock ${newSessionExtra} new-session -d`);
    await execShellCommand(`${tmateExecutable} -S /tmp/tmate.sock wait tmate-ready`);
    console.debug("Created new session successfully")

    core.debug("Fetching connection strings")
    const tmateSSH = await execShellCommand(`${tmateExecutable} -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
    const tmateWeb = await execShellCommand(`${tmateExecutable} -S /tmp/tmate.sock display -p '#{tmate_web}'`);

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