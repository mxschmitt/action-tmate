# Debug your [GitHub Actions](https://github.com/features/actions) by using [tmate](https://tmate.io)

[![GitHub Actions](https://github.com/mxschmitt/action-tmate/workflows/Node.js%20CI/badge.svg)](https://github.com/mxschmitt/action-tmate/actions)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub-Marketplace-green)](https://github.com/marketplace/actions/debugging-with-tmate)

This GitHub Action offers you a direct way to interact with the host system on which the actual scripts (Actions) will run.

## Features

- Debug your GitHub Actions by using SSH or Web shell
- Continue your Workflows afterwards

## Supported Operating Systems

- Linux
- macOS
- Windows

## Getting Started

By using this minimal example a [tmate](https://tmate.io) session will be created.

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
```

To get the connection string, just open the `Checks` tab in your Pull Request and scroll to the bottom. There you can connect either directly per SSH or via a web based terminal.

![GitHub Checks tab](./docs/checks-tab.png "GitHub Checks tab")

## Manually triggered debug

Instead of having to add/remove, or uncomment the required config and push commits each time you want to run your workflow with debug, you can make the debug step conditional on an optional parameter that you provide through a [`workflow_dispatch`](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#workflow_dispatch) "manual event".

Add the following to the `on` events of your workflow:

```yaml
on:
  workflow_dispatch:
    inputs:
      debug_enabled:
        type: boolean
        description: 'Run the build with tmate debugging enabled (https://github.com/marketplace/actions/debugging-with-tmate)'
        required: false
        default: false
```

Then add an [`if`](https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions) condition to the debug step:

<!--
{% raw %}
-->
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # Enable tmate debugging of manually-triggered workflows if the input option was provided
      - name: Setup tmate session
        uses: mxschmitt/action-tmate@v3
        if: ${{ github.event_name == 'workflow_dispatch' && inputs.debug_enabled }}
```
<!--
{% endraw %}
-->

You can then [manually run a workflow](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) on the desired branch and set `debug_enabled` to true to get a debug session.

## Detached mode

By default, this Action starts a `tmate` session and waits for the session to be done (typically by way of a user connecting and exiting the shell after debugging). In detached mode, this Action will start the `tmate` session, print the connection details, and continue with the next step(s) of the workflow's job. At the end of the job, the Action will wait for the session to exit.

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
      with:
        detached: true
```

By default, this mode will wait at the end of the job for a user to connect and then to terminate the tmate session. If no user has connected within 10 minutes after the post-job step started, it will terminate the `tmate` session and quit gracefully.

## Without sudo

By default we run installation commands using sudo on Linux. If you get `sudo: not found` you can use the parameter below to execute the commands directly.

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
      with:
        sudo: false
```

## Timeout

By default the tmate session will remain open until the workflow times out. You can [specify your own timeout](https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepstimeout-minutes) in minutes if you wish to reduce GitHub Actions usage.

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
      timeout-minutes: 15
```

## Only on failure
By default a failed step will cause all following steps to be skipped. You can specify that the tmate session only starts if a previous step [failed](https://docs.github.com/en/actions/learn-github-actions/expressions#failure).

<!--
{% raw %}
-->
```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      if: ${{ failure() }}
      uses: mxschmitt/action-tmate@v3
```
<!--
{% endraw %}
-->

## Use registered public SSH key(s)

If [you have registered one or more public SSH keys with your GitHub profile](https://docs.github.com/en/github/authenticating-to-github/adding-a-new-ssh-key-to-your-github-account), tmate will be started such that only those keys are authorized to connect, otherwise anybody can connect to the tmate session. If you want to require a public SSH key to be installed with the tmate session, no matter whether the user who started the workflow has registered any in their GitHub profile, you will need to configure the setting `limit-access-to-actor` to `true`, like so:

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
      with:
        limit-access-to-actor: true
```

If the registered public SSH key is not your default private SSH key, you will need to specify the path manually, like so: `ssh -i <path-to-key> <tmate-connection-string>`.

## Use your own tmate servers

By default the tmate session uses `ssh.tmate.io`. You can use your own tmate servers. [tmate-ssh-server](https://github.com/tmate-io/tmate-ssh-server) is the server side part of tmate.

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v3
      with:
        tmate-server-host: ssh.tmate.io
        tmate-server-port: 22
        tmate-server-rsa-fingerprint: SHA256:Hthk2T/M/Ivqfk1YYUn5ijC2Att3+UPzD7Rn72P5VWs
        tmate-server-ed25519-fingerprint: SHA256:jfttvoypkHiQYUqUCwKeqd9d1fJj/ZiQlFOHVl6E9sI
```

## Skip installing tmate

By default, tmate and its dependencies are installed in a platform-dependent manner. When using self-hosted agents, this can become unnecessary or can even break. You can skip installing tmate and its dependencies using `install-dependencies`:

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: [self-hosted, linux]
    steps:
    - uses: mxschmitt/action-tmate@v3
      with:
        install-dependencies: false
```

## Continue a workflow

If you want to continue a workflow and you are inside a tmate session, just create a empty file with the name `continue` either in the root directory or in the project directory by running `touch continue` or `sudo touch /continue` (on Linux).

## Connection string / URL is not visible

The connection string will be written in the logs every 5 seconds. For more information checkout issue [#1](https://github.com/mxschmitt/action-tmate/issues/1).
