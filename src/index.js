const { promisify } = require("util")
const fs = require("fs")

const fsExists = promisify(fs.exists)

const core = require("@actions/core")

const { execShellCommand } = require("./helpers")

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  try {
    if (process.platform === "win32") {
      core.info("Windows is not supported by tmate, skipping...")
      return
    }

    core.debug("Installing dependencies")
    if (process.platform === "darwin") {
      await execShellCommand('brew install tmate');
    } else {
      await execShellCommand('sudo apt-get update');
      await execShellCommand('sudo apt-get install -y tmate openssh-client');
    }
    core.debug("Installed dependencies successfully");

    core.debug("Generating SSH keys")
    try {
      await execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
    } catch { }
    core.debug("Generated SSH-Key successfully")

    core.debug("Creating new session")
    await execShellCommand('tmate -S /tmp/tmate.sock new-session -d');
    await execShellCommand('tmate -S /tmp/tmate.sock wait tmate-ready');
    console.debug("Created new session successfully")

    core.debug("Fetching connection strings")
    const tmateSSH = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
    const tmateWeb = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_web}'`);

    console.debug("Entering main loop")
    while (true) {
      core.debug(`WebURL: ${tmateWeb}`);
      core.debug(`SSH: ${tmateSSH}`);

      const skip = fsExists("/continue")
      if (skip) {
        core.info("Existing debugging session")
        break
      }
      await sleep(5000)
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = {
  run
}