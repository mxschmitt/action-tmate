# Debug your [GitHub Actions](https://github.com/features/actions) by using tmate

This GitHub Action uses tmate.io to notify you within seconds of a build failure in Slack and provides a secret SSH url to connect to the runner to debug what happened. You can further protect it using your public ssh authorized_keys.

**Note: tmate.io appears to have an initial connect timeout and a inactivity timeout. If either of those preclude this option, you can alos hose your own tmate ssh server.**

## Features

- Debug your GitHub Actions using SSH
- Near instant notification of build failure via Slack webhook
- Secure the connection with your authorized_keys

## Supported Operating Systems

- `Linux`
- `macOS`
- (`Window` is **not** supported. It will be skipped so that the Pipeline does not fail)

## Getting Started

By using this minimal example a [tmate.io](https://tmate.io) session will be created. A Slack [webhook](https://api.slack.com/messaging/webhooks) url is required. A public url to your public authorized_keys file is not, but then anyone who received the slack msg (if posted to a channel) will be able to access it.

```yaml
name: CI
on: [push]
env:
  SLACK_WEBHOOK_URL_FOR_TMATE_FROM_GITHUB_WORKFLOW: ${{ secrets.SLACK_WEBHOOK_URL_FOR_TMATE_FROM_GITHUB_WORKFLOW }}
  TMATE_AUTHORIZED_KEYS_URL: ${{ secrets.TMATE_AUTHORIZED_KEYS_URL }}
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os:
          - ubuntu-latest
          - macos-latest
    steps:
    - run: |
          exit 1
    - name: keepalive to debug
      if: ${{ failure() }}
      uses: PMET-public/action-tmate@master
```

When done debugging, simply kill the sleep process keeping it alive (`pkill sleep`), or cancel the workflow in the GitHub UI.
