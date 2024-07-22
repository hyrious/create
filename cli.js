#!/usr/bin/env node
import sade from 'sade'
import fs from 'node:fs'
import path from 'node:path'
import { sortJSON } from '@hyrious/sort-package-json'

// Base files:
//    .gitignore
//       node_modules
//       dist             // if no '--js', i.e. use ts
//    package.json
//       {type: module}   // if no '--dual', use ESM only
//       @hyrious/configs // if no '--js'
//       vite             // if '--vite'
//
// If '--js', add:
//    lib/
//    index.js
//    cli.js              // if '--cli'
//    pkg.cli = cli.js
//    pkg.files = [lib, *.js]
// otherwise:
//    src/index.ts
//    src/cli.ts          // if '--cli'
//    tsconfig.json       // apply '@hyrious/configs/tsconfig.casual.json'
//    pkg.cli = dist/cli.js
//    pkg.files = [src, dist]
//
// If '--vite', add:
//    main.{js,ts}        // '.js' if '--js' else '.ts'
//    index.html
//
// If '--public', add:
//    .github/workflows/npm-publish.yml
//
sade('@hyrious/create', true)
  .version(JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version)
  .option('--js', 'Use JavaScript', false)
  .option('--cli', 'Add CLI entry point', false)
  .option('--npm', 'Use npm instead of pnpm', false)
  .option('--vite', 'Install Vite', false)
  .option('--dual', 'Use ESM + CJS', false)
  .option('--author', 'Set the "author" field', 'hyrious <hyrious@outlook.com>')
  .option('--public', 'Add workflows', false)
  .option('--corepack', 'Use corepack, only work without --npm', false)
  .describe('Create a new project.')
  .action(async function hyrious_create_package(opts) {
    const cwd = process.cwd()
    if (fs.readdirSync(cwd).filter(e => e[0] !== '.').length > 0) {
      console.error('Current directory is not empty.')
      process.exitCode = 1
      return
    }

    const writeFile = (name, data) => {
      console.log('create', name)
      fs.writeFileSync(name, data)
    }

    const name = path.basename(cwd)

    let index = opts.author.indexOf('<')
    if (index < 0) index = opts.author.indexOf('(')
    if (index < 0) index = opts.author.length
    const user = opts.author.slice(0, index).trimEnd()
    const userLower = user.toLowerCase()

    writeFile('.gitignore', opts.js ? 'node_modules\n' : 'node_modules\ndist\n')

    const pkg = {
      "name": `@${userLower}/${name}`,
      "version": "0.1.0",
      "description": name,
      "author": opts.author,
      "license": "MIT",
      "repository": `${userLower}/${name}`,
      "keywords": name.split('-'),
      "devDependencies": {},
    }

    if (opts.dual) {
      if (opts.js) {
        console.warn('--dual has no effect with --js')
      }
    } else {
      pkg.type = 'module'
    }

    if (opts.corepack) {
      if (opts.npm) {
        console.warn('--corepack has no effect with --npm')
      } else {
        pkg.packageManager = 'pnpm@*'
      }
    }

    if (opts.js) {
      fs.mkdirSync('lib', { recursive: true })
      writeFile('index.js', 'export let a = 1\n')
      if (opts.cli) {
        writeFile('cli.js', '#!/usr/bin/env node\nconsole.log(1)\n')
        pkg.bin = 'cli.js'
      }
      pkg.files = ['lib', '*.js']
    } else {
      fs.mkdirSync('src', { recursive: true })
      writeFile('src/index.ts', 'export let a = 1\n')
      if (opts.cli) {
        writeFile('src/cli.ts', 'console.log(1)\n\n// "#!/usr/bin/env node" will make this file be detected as js by github.\n')
        pkg.bin = 'dist/cli.js'
      }
      pkg.main = 'dist/index.js'
      if (opts.dual) {
        pkg.module = 'dist/index.mjs'
      }
      pkg.types = 'dist/index.d.ts'
      pkg.files = ['src', 'dist']
      pkg.devDependencies['@hyrious/configs'] = '*'
      writeFile('tsconfig.json', `{
  "include": ["src"],
  "extends": "@hyrious/configs/tsconfig.casual.json"
}\n`)
    }

    if (opts.vite) {
      pkg.devDependencies['vite'] = '*'
      const main = opts.js ? 'main.js' : 'main.ts'
      writeFile(main, 'console.log(1)\n')
      writeFile('index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test</title>
</head>
<body>
  <script type="module" src="/${main}"></script>
</body>
</html>\n`)
    }

    if (opts.public) {
      fs.mkdirSync('.github/workflows', { recursive: true })
      writeFile('.github/workflows/npm-publish.yml', `name: Node.js Package

on:
  push:
    tags: "*"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    concurrency:
      group: \${{ github.workflow }}-\${{ github.ref }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v4${opts.npm ? '' : `
      - uses: pnpm/action-setup@v4${opts.corepack ? '' : `
        with:
          version: latest`}`}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://registry.npmjs.org"
          cache: ${opts.npm ? 'npm' : 'pnpm'}
      - run: |${opts.npm ? `
          npm ci
          npm run build` : `
          pnpm install
          pnpm build`}${opts.npm ? `
      - run: npm publish --provenance --access public` : `
      - run: pnpm publish --provenance --access public --no-git-checks`}
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n`)
    }

    writeFile('README.md', `# @${userLower}/${name}

${name}.

## License

MIT @ [${user}](https://github.com/${userLower})\n`)

    writeFile('LICENSE.txt', `MIT License

Copyright (c) ${new Date().getFullYear()} ${user}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`)

    if (Object.keys(pkg.devDependencies).length > 0 || pkg.packageManager) {
      const packages = Object.keys(pkg.devDependencies)
      if (pkg.packageManager) packages.push('pnpm')
      console.info('resolving', packages)

      // https://github.com/antfu/fast-npm-meta#-resolve-multiple-packages
      const latestVersions = async (names) => {
        const payload = names.map(name => encodeURIComponent(name)).join('+')
        const response = await fetch('https://npm.antfu.dev/' + payload)
        const data = await response.json()
        if (response.ok) {
          if (Array.isArray(data)) {
            return data.reduce((deps, a) => { deps[a.name] = `^${a.version}`; return deps }, {})
          } else {
            return { [data.name]: `^${data.version}` }
          }
        } else {
          console.warn(data && data.message || data || 'failed to fetch npm.antfu.dev')
          return latestVersionsFallback(names)
        }
      }

      // https://www.jsdelivr.com/docs/data.jsdelivr.com#get-/v1/packages/npm/-package-/resolved
      const latestVersionsFallback = async (names) => {
        const tasks = [], deps = {}
        for (const name of names) {
          tasks.push(fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}/resolved`)
            .then(r => r.json())
            .then(a => { deps[a.name] = `^${a.version}` }))
        }
        await Promise.allSettled(tasks)
        return deps
      }

      const versions = await latestVersions(packages)
      if (pkg.packageManager && versions.pnpm) {
        pkg.packageManager = `pnpm@${versions.pnpm.slice(1)}`
        delete versions.pnpm
      }
      Object.assign(pkg.devDependencies, versions)

      // Check if done right
      for (const name in pkg.devDependencies) {
        if (pkg.devDependencies[name] == '*') {
          console.warn('failed to resolve dependency', name)
        }
      }
    }

    writeFile('package.json', sortJSON(pkg))

    const pm = opts.npm ? 'npm i' : 'pnpm add'

    console.log()
    console.log('next steps:')
    console.log('npx @hyrious/license mit # Update LICENSE.txt, remember to update pkg.license')
    console.log(pm + ' -D esbuild         # Define your build tool')
    console.log(pm + ' -D eslint prettier # Define your linter / formatter')
  })
  .parse(process.argv)
