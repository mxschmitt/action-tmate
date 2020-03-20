import { spawn } from 'child_process'

export const execShellCommand = (cmd) => {
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
