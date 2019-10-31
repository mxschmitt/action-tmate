"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const child_process_1 = require("child_process");
/**
 * Executes a shell command and return it as a Promise.
 */
function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        const process = child_process_1.spawn(cmd, [], { shell: true });
        let stdout = "";
        process.stdout.on('data', (data) => {
            console.log(data.toString());
            stdout += data.toString();
        });
        process.stderr.on('data', (data) => {
            console.error(data.toString());
        });
        process.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(code ? code.toString() : undefined));
            }
            resolve(stdout);
        });
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.debug("Installing dependencies");
            if (process.platform === 'darwin') {
                yield execShellCommand('sudo brew install tmate');
            }
            else {
                yield execShellCommand('sudo apt-get install -y tmate openssh-client');
            }
            core.debug("Installed dependencies successfully");
            try {
                yield execShellCommand(`echo -e 'y\n'|ssh-keygen -q -t rsa -N "" -f ~/.ssh/id_rsa`);
            }
            catch (_a) { }
            core.debug("Generated SSH-Key successfully");
            core.debug("Creating new session...");
            yield execShellCommand('tmate -S /tmp/tmate.sock new-session -d');
            yield execShellCommand('tmate -S /tmp/tmate.sock wait tmate-ready');
            const tmateSSH = yield execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'`);
            core.debug(`SSH: ${tmateSSH}`);
            const tmateWeb = yield execShellCommand(`tmate -S /tmp/tmate.sock display -p '#{tmate_web}'`);
            core.debug(`WebURL: ${tmateWeb}`);
            while (true) {
                yield new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
