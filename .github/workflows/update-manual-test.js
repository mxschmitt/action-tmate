#!/usr/bin/env node

// Update the `runs-on` options of the `manual-test.yml` workflow file with the
// latest available images from the GitHub Actions runner images README file.

(async () => {
  const fs = require('fs')

  const readme = await (await fetch("https://github.com/actions/runner-images/raw/HEAD/README.md")).text()

  // This will be the first `ubuntu` one.
  let defaultOption = ''

  const availableImagesSection = readme
    // Get the "Available Images" section
    .split(/\n## Available Images\n/)[1]
    .split(/\n##\s+/)[0]
  if (!availableImagesSection) throw new Error("Could not parse the 'Available Images' section from the runner-images README file")

  const choices = availableImagesSection
    // Split by lines
    .split('\n')
    .map(line => {
        // The relevant lines are table rows; The third column (`YAML Label`)
        // contains one or more backticked `runs-on` labels.
        if (!line.startsWith('|')) return false
        const columns = line.split('|').map(e => e.trim())
        const yamlLabels = columns[3]
        if (!yamlLabels || yamlLabels === "YAML Label") return false

        const alternatives = [...yamlLabels.matchAll(/`([^`]+)`/g)]
          .map(([, label]) => label)
          .sort((a, b) => a.length - b.length) // order by length
        if (alternatives.length === 0) return false

        const runsOn = alternatives[0]
        const isPreviewImage = /\bpreview\b/i.test(line)
        if (!defaultOption && runsOn.startsWith('ubuntu-') && !isPreviewImage) defaultOption = runsOn
        return runsOn
    })
    .filter(runsOn => runsOn)
  if (!defaultOption) throw new Error("Could not determine a default Ubuntu runner label")

  // Keep this as a fallback in case the Windows/ARM64 runner temporarily drops
  // out of the runner-images table.
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