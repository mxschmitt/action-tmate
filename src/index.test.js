jest.mock('@actions/core');
const core = require("@actions/core")

jest.mock('./helpers');
jest.mock("fs");
const fs = require("fs")
const { execShellCommand } = require("./helpers")
const { run } = require(".")

describe('Tmate GitHub integration', () => {
  const originalPlatform = process.platform;

  afterAll(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform
    })
  });

  it('should skip for windows', async () => {
    Object.defineProperty(process, "platform", {
      value: "win32"
    })
    await run()
    expect(core.info).toHaveBeenCalledWith('Windows is not supported by tmate, skipping...');
  });
  it('should be handle the main loop for linux', async () => {
    Object.defineProperty(process, "platform", {
      value: "linux"
    })
    fs.existsSync.mockReturnValue(false);
    const customConnectionString = "foobar"
    execShellCommand.mockReturnValue(Promise.resolve(customConnectionString))
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "sudo apt-get update")
    expect(core.info).toHaveBeenCalledWith('Existing debugging session');
    expect(core.debug).toHaveBeenNthCalledWith(7, `WebURL: ${customConnectionString}`);
    expect(core.debug).toHaveBeenNthCalledWith(8, `SSH: ${customConnectionString}`);
  });
  it('should install tmate via brew for darwin', async () => {
    Object.defineProperty(process, "platform", {
      value: "darwin"
    })
    fs.existsSync.mockReturnValue(false);
    await run()
    expect(execShellCommand).toHaveBeenNthCalledWith(1, "brew install tmate")
  });
});
