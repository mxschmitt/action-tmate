import * as core from '@actions/core';
import { spawn } from 'child_process'

/**
 * Executes a shell command and return it as a Promise.
 */
function execShellCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, [], { shell: true })
    let stdout = ""
    process.stdout.on('data', (data) => {
      console.log(data.toString());
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    process.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(code ? code.toString() : undefined))
      }
      resolve(stdout)
    });
  });
}

async function run() {
  try {
    core.debug("Installing dependencies")
    if (process.platform === 'darwin') {
      await execShellCommand('brew install tmate');
    } else {
      await execShellCommand('sudo apt-get install -y tmate openssh-client');
    }
    core.debug("Installed dependencies successfully");
    try {
      await execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
    } catch { }
    core.debug("Generated SSH-Key successfully")
    core.debug("Creating new session...")
    await execShellCommand('tmate -S /tmp/tmate.sock new-session -d');
    await execShellCommand('tmate -S /tmp/tmate.sock wait tmate-ready');
    const tmateSSH = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
    core.debug(`SSH: ${tmateSSH}`);
    const tmateWeb = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_web}'`);
    core.debug(`WebURL: ${tmateWeb}`);
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
