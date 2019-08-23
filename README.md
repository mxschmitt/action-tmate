# Debug your GitHub Actions by using tmate

This GitHub Action offers you a direct way to interact with the host system on which the actual scripts (Actions) will run.

## Getting Started

By using this minimal example a [tmate](https://tmate.io) session will be created.

```
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - name: Setup tmate session
      uses: mxschmitt/action-tmate@v1
```

To get the connection string, just open the `Checks` tab and scroll to the bottom. There you can connect either directly per SSH or via a web based interface.

![alt text](./docs/checks-tab.png "Logo Title Text 1")
