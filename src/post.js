import { waitUntilDebuggingSessionExit } from "./helpers";
import * as core from "@actions/core";

if (core.getInput("wait-in-post") !== "false") {
  waitUntilDebuggingSessionExit();
}
