jest.mock('@actions/core');
import * as core from "@actions/core"
jest.mock('@actions/github');
jest.mock("@actions/tool-cache", () => ({
  downloadTool: async () => "",
  extractTar: async () => ""
}));
jest.mock("fs", () => ({
  mkdirSync: () => true,
  existsSync: () => true
}));
jest.mock('./helpers');
import { execShellCommand } from "./helpers"
import { run } from "."

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
    core.getInput.mockReturnValueOnce("true").mockReturnValue("false")
    const customConnectionString = "foobar"
    execShellCommand.mockReturnValue(Promise.resolve(customConnectionString))
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "pacman -Sy --noconfirm tmate")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should be handle the main loop for linux', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    core.getInput.mockReturnValueOnce("true").mockReturnValue("false")
    const customConnectionString = "foobar"
    execShellCommand.mockReturnValue(Promise.resolve(customConnectionString))
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "sudo apt-get update")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should be handle the main loop for linux without sudo', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    core.getInput.mockReturnValue("false")
    const customConnectionString = "foobar"
    execShellCommand.mockReturnValue(Promise.resolve(customConnectionString))
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "apt-get update")
    expect(core.info).toHaveBeenNthCalledWith(1, `Web shell: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(2, `SSH: ${customConnectionString}`);
    expect(core.info).toHaveBeenNthCalledWith(3, "Exiting debugging session because the continue file was created");
  });
  it('should install tmate via brew for darwin', async () => {
    Object.defineProperty(process, "platform", {
      value: "darwin"
    })
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "brew install tmate")
  });
});
