import * as core from '@actions/core';
import { exec } from 'child_process'

/**
 * Executes a shell command and return it as a Promise.
 */
function execShellCommand(cmd: string): Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr))
      }
      resolve([stdout, stderr]);
    });
  });
}

async function run() {
  try {
    await execShellCommand('apt-get install -y locales tmate openssh-client');
    await execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
    await execShellCommand('tmate -S /tmp/tmate.sock new-session -d');
    await execShellCommand('tmate -S /tmp/tmate.sock wait tmate-ready');
    const [tmateSSH] = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
    const [tmateWeb] = await execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_web}'`);
    await execShellCommand(`tmate -S /tmp/tmate.sock attach`)
    core.debug(`WebURL: ${tmateWeb}`);
    core.debug(`SSH: ${tmateSSH}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
