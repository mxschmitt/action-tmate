#!/usr/bin/env node

// Update the `runs-on` options of the `manual-test.yml` workflow file with the
// latest available images from the GitHub Actions runner images README file.

(async () => {
  const fs = require('fs')

  const readme = await (await fetch("https://github.com/actions/runner-images/raw/HEAD/README.md")).text()

  // This will be the first `ubuntu` one.
  let defaultOption = ''

  const choices = readme
    // Get the "Available Images" section
    .split(/\n## Available Images\n/)[1]
    .split(/##\s*[^#]/)[0]
    // Split by lines
    .split('\n')
    .map(line => {
        // The relevant lines are table rows; The first column is the image name,
        // the second one contains a relatively free-form list of the `runs-on`
        // options that we are interested in. Those `runs-on` options are
        // surrounded by backticks.
        const match = line.match(/^\|\s*([^|]+)\s*\|([^|]*)`([^`|]+)`\s*\|/)
        if (!match) return false // Skip e.g. the table header and empty lines
        let runsOn = match[3] // default to the last `runs-on` option
        const alternatives = match[2]
          .split(/`([^`]*)`/) // split by backticks
          .filter((_, i) => (i % 2)) // keep only the text between backticks
          .sort((a, b) => a.length - b.length) // order by length
        if (alternatives.length > 0 && alternatives[0].length < runsOn.length) runsOn = alternatives[0]
        if (!defaultOption && match[3].startsWith('ubuntu-')) defaultOption = runsOn
        return runsOn
    })
    .filter(runsOn => runsOn)

  // The Windows/ARM64 runners are in public preview (and for the time being,
  // not listed in the `runner-images` README file), so we need to add this
  // manually.
  if (!choices.includes('windows-11-arm')) choices.push('windows-11-arm')

  // Now edit the `manual-test` workflow definition
  const ymlPath = `${__dirname}/manual-test.yml`
  const yml = fs.readFileSync(ymlPath, 'utf8')

  // We want to replace the `runs-on` options and the `default` value. This
  // would be easy if there was a built-in YAML parser and renderer in Node.js,
  // but there is none. Therefore, we use a regular expression to find certain
  // "needles" near the beginning of the file: first `workflow_dispatch:`,
  // after that `runs-on:` and then `default:` and `options:`. Then we replace
  // the `default` value and the `options` values with the new ones.
  const [, beforeDefault, beforeOptions, optionsIndent, afterOptions] =
    yml.match(/^([^]*?workflow_dispatch:[^]*?runs-on:[^]*?default:)(?:.*)([^]*?options:)(\n +- )(?:.*)(?:\3.*)*([^]*)/) || []
  if (!beforeDefault) throw new Error(`The 'manual-test.yml' file does not match the expected format!`)
  const newYML =
    `${beforeDefault} ${defaultOption}${[beforeOptions, ...choices].join(optionsIndent)}${afterOptions}`
  fs.writeFileSync(ymlPath, newYML)
})().catch(e => {
  console.error(e)
  process.exitCode = 1
})