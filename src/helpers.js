import { spawn } from 'child_process'

export const execShellCommand = (cmd) => {
  return new Promise((resolve, reject) => {
    const process = global.process.platform !== "win32" ?
      spawn(cmd, [], { shell: true }) :
      spawn("C:\\msys64\\usr\\bin\\bash.exe", [ "-lc", cmd ], {
        env: {
          "CHERE_INVOKING": "1", /* do not `cd` to home */
          "MSYSTEM": "MINGW64", /* include the MINGW programs in C:/msys64/mingw64/bin/ */
        }
      })
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
