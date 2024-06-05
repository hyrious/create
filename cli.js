#!/usr/bin/env node
import sade from 'sade'
import fs from 'node:fs'
import path from 'node:path'
import sort_package_json from 'sort-package-json'
import latest_version from 'latest-version'

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
// At the end, show guides:
//    Run `npx @hyrious/license` to create a LICENSE.txt.
//    If you need Prettier or ESLint, install them on your own.
//    Currently no build tool, choose tsup, rollup or whatever.
sade('@hyrious/create', true)
  .version(JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version)
  .option('--js', 'Use JavaScript', false)
  .option('--cli', 'Add CLI entry point', false)
  .option('--vite', 'Install Vite', false)
  .option('--dual', 'Use ESM + CJS', false)
  .option('--public', 'Add workflows', false)
  .describe('Create a new project.')
  .action(async function hyrious_create_package(opts) {
    const cwd = process.cwd()
    if (fs.readdirSync(cwd).filter(e => e[0] !== '.').length > 0) {
      throw new Error('Current directory is not empty.')
    }

    const writeFile = (name, data) => {
      console.log('create', name)
      fs.writeFileSync(name, data)
    }

    const name = path.basename(cwd)

    writeFile('.gitignore', opts.js ? 'node_modules\n' : 'node_modules\ndist\n')
    const pkg = {
      "name": `@hyrious/${name}`,
      "version": "0.1.0",
      "description": name,
      "author": "hyrious <hyrious@outlook.com>",
      "license": "MIT",
      "repository": `hyrious/${name}`,
      "keywords": [],
      "devDependencies": {},
    }

    if (opts.dual) {
      if (opts.js) {
        console.warn('[warning] --dual has no effect with --js')
      }
    } else {
      pkg.type = 'module'
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
        writeFile('src/cli.ts', 'console.log(1)\n')
        pkg.bin = 'dist/cli.js'
      }
      pkg.main = 'dist/index.js'
      if (opts.dual) {
        pkg.module = 'dist/index.mjs'
      }
      pkg.types = 'dist/index.d.ts'
      pkg.files = ['dist', 'src']
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

    if (Object.keys(pkg.devDependencies).length > 0) {
      const tasks = []
      for (const key in pkg.devDependencies) {
        tasks.push(latest_version(key).then(version => {
          pkg.devDependencies[key] = '^' + version
        }))
      }
      await Promise.allSettled(tasks)
    }

    writeFile('package.json', JSON.stringify(sort_package_json(pkg), null, 2) + '\n')

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
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://registry.npmjs.org"
          cache: pnpm
      - run: |
          pnpm install
          pnpm build
      - run: pnpm publish --provenance --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n`)
    }

    writeFile('README.md', `# @hyrious/${name}

${name}.

## License

MIT @ [hyrious](https://github.com/hyrious)\n`)

    console.log()
    console.log('next steps:')
    console.log('npx @hyrious/license mit # Create LICENSE.txt, remember to update pkg.license')
    console.log('npm i -D esbuild         # Define your build tool')
    console.log('npm i -D eslint prettier # Define your linter / formatter')
  })
  .parse(process.argv)
