import os from "os"
import fs from "fs"
import path from "path"
import * as core from "@actions/core"

import { execShellCommand } from "./helpers"

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function run() {
  const optionalSudoPrefix = core.getInput('sudo') === "true" ? "sudo " : "";
  try {
    core.debug("Installing dependencies")
    if (process.platform === "darwin") {
      await execShellCommand('brew install tmate');
    } else if (process.platform === "win32") {
      await execShellCommand('pacman -Sy --noconfirm tmate');
    } else {
      await execShellCommand(optionalSudoPrefix + 'apt-get update');
      await execShellCommand(optionalSudoPrefix + 'apt-get install -y tmate openssh-client');
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

    core.debug("Creating new session")
    await execShellCommand('tmate -S /tmp/tmate.sock new-session -d');
    await execShellCommand('tmate -S /tmp/tmate.sock wait tmate-ready');
    console.debug("Created new session successfully")

    core.debug("Fetching connection strings")
    const tmateSSH = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
    const tmateWeb = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_web}'`);

    console.debug("Entering main loop")
    const continuePath = process.platform !== "win32" ? "/continue" : "C:/msys64/continue"
    while (true) {
      core.info(`WebURL: ${tmateWeb}`);
      core.info(`SSH: ${tmateSSH}`);

      const skip = fs.existsSync(continuePath) || fs.existsSync(path.join(process.env.GITHUB_WORKSPACE, "continue"))
      if (skip) {
        core.info("Existing debugging session because '/continue' file was created")
        break
      }
      await sleep(5000)
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
