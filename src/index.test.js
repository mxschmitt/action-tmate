jest.mock('@actions/core');
import * as core from "@actions/core"
jest.mock('@actions/github');
jest.mock("@actions/tool-cache", () => ({
  downloadTool: async () => "",
  extractTar: async () => ""
}));
jest.mock("fs", () => ({
  mkdirSync: () => true,
  existsSync: () => true,
  unlinkSync: () => true,
  writeFileSync: () => true
}));
jest.mock('./helpers', () => {
  const originalModule = jest.requireActual('./helpers');
  return {
    __esModule: true,
    ...originalModule,
    execShellCommand: jest.fn(() => 'mocked execShellCommand'),
  };
});
import { execShellCommand } from "./helpers"
import { run } from "."

function mockCoreGetInputImplementation(inputs) {
  core.getInput.mockImplementation((input) => inputs[input] || '');
}

const customConnectionString = "mocked execShellCommand"

describe('Tmate GitHub integration', () => {
  const originalPlatform = process.platform;

  afterAll(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform
    })
  });

  it('should handle the main loop for Windows', async () => {
    Object.defineProperty(process, "platform", {
      value: "win32"
    })

    mockCoreGetInputImplementation({"install-dependencies": "true", "limit-access-to-actor": "false", "wait-in-post": "false"});
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "pacman -Sy --noconfirm tmate");
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should handle the main loop for Windows without dependency installation', async () => {
    Object.defineProperty(process, "platform", {
      value: "win32"
    })
    mockCoreGetInputImplementation({"install-dependencies": "false", "limit-access-to-actor": "false", "wait-in-post": "false"});
    await run()
    expect(execShellCommand).not.toHaveBeenNthCalledWith(1, "pacman -Sy --noconfirm tmate");
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should handle the main loop for linux', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    mockCoreGetInputImplementation({"install-dependencies": "true", "limit-access-to-actor": "false", "wait-in-post": "false", "sudo": "true"});
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "sudo apt-get update")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should handle the main loop for linux without sudo', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    mockCoreGetInputImplementation({"install-dependencies": "true", "limit-access-to-actor": "false", "wait-in-post": "false", "sudo": "false"});
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "apt-get update")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should handle the main loop for linux without installing dependencies', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    mockCoreGetInputImplementation({"install-dependencies": "false", "limit-access-to-actor": "false", "wait-in-post": "false"});
    await run()
    expect(execShellCommand).not.toHaveBeenNthCalledWith(1, "apt-get update")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should install tmate via brew for darwin', async () => {
    Object.defineProperty(process, "platform", {
      value: "darwin"
    })
    mockCoreGetInputImplementation({"install-dependencies": "true", "limit-access-to-actor": "false", "wait-in-post": "false"});
    await run()
    expect(core.getInput).toHaveBeenNthCalledWith(1, "install-dependencies")
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "brew install tmate")
  });
  it('should not install dependencies for darwin', async () => {
    Object.defineProperty(process, "platform", {
      value: "darwin"
    })
    mockCoreGetInputImplementation({"install-dependencies": "false", "limit-access-to-actor": "false", "wait-in-post": "false"});
    await run()
    expect(execShellCommand).not.toHaveBeenNthCalledWith(1, "brew install tmate")
  });
  it('should work without any options', async () => {
    core.getInput.mockReturnValue("");

    await run()

    expect(core.setFailed).not.toHaveBeenCalled();
  });
  it('should validate correct tmate options', async () => {
    // Check for the happy path first.
    mockCoreGetInputImplementation({
      "tmate-server-host": "ssh.tmate.io",
      "tmate-server-port": "22",
      "tmate-server-rsa-fingerprint": "SHA256:Hthk2T/M/Ivqfk1YYUn5ijC2Att3+UPzD7Rn72P5VWs",
      "tmate-server-ed25519-fingerprint": "SHA256:jfttvoypkHiQYUqUCwKeqd9d1fJj/ZiQlFOHVl6E9sI"
    })

    await run()

    // Find the command launching tmate with its various options.
    let tmateCmd;
    for (const call of execShellCommand.mock.calls) {
      const cmd = call[0]
      if (cmd.includes("set-option -g")) {
        tmateCmd = cmd
        break
      }
    }

    expect(tmateCmd).toBeDefined();

    const re = /set-option -g tmate-server-host "([^"]+)"/;
    const match = re.exec(tmateCmd);
    expect(match).toBeTruthy();
    expect(match[1]).toEqual("ssh.tmate.io");
  });
  it('should fail to validate wrong tmate options', async () => {
    mockCoreGetInputImplementation({"tmate-server-host": "not/a/valid/hostname"})

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
        Error("Invalid value for 'tmate-server-host': 'not/a/valid/hostname'")
      )
  });
});
