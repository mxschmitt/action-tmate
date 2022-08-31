import { waitUntilDebuggingSessionExit } from "./helpers";

if (core.getInput("wait-in-post") !== "false") {
  waitUntilDebuggingSessionExit();
}
