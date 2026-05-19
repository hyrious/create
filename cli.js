#!/usr/bin/env node
import sade from 'sade'
import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
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
//    tsconfig.json       // apply '@hyrious/configs/tsconfig.{casual,node}.json'
//    pkg.cli = dist/cli.js
//    pkg.files = [src, dist]
//
// If '--vite', add:
//    main.{js,ts}        // '.js' if '--js' else '.ts'
//    index.html
//
// If '--public[=github]', add:
//    .github/workflows/npm-publish.yml
//
// Run '{npm,pnpm,bun} install' if '-i'
//
sade('@hyrious/create', true)
  .version(JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version)
  .option('-i, --install', 'Run `npm install` afterwards, use mirror with -i=mirror', null)
  .option('--js', 'Use JavaScript', false)
  .option('--node', 'Use tsconfig.node.json', false)
  .option('--cli', 'Add CLI entry point, implies --node', false)
  .option('--pnpm', 'Use pnpm with @pnpm/plugin-better-defaults', false)
  .option('--bun', 'Use bun with --cli and --install', false)
  .option('--vite', 'Install Vite', false)
  .option('--dual', 'Use ESM + CJS', false)
  .option('--author', 'Set the "author" field', 'hyrious <hyrious@outlook.com>')
  .option('--public', 'Add publish workflows using OIDC or GitHub registry with --public=github', null)
  .option('--corepack', 'Use corepack, only work with --pnpm', false)
  .describe('Create a new project.')
  .action(async function hyrious_create_package(opts) {
    const cwd = process.cwd()
    if (fs.readdirSync(cwd).filter(e => e[0] !== '.').length > 0) {
      console.error('Current directory is not empty.')
      process.exitCode = 1
      return
    }

    const win = process.platform === 'win32'

    opts.mirror = opts.install === 'mirror'
    opts.install = opts.install === true || opts.mirror
    opts.github = opts.public === 'github'
    opts.public = opts.public === true || opts.github
    if (opts.cli) opts.node = true
    if (!opts.npm) opts.npm = !opts.pnpm

    const writeFile = (name, data) => {
      console.log('create', name)
      if (win) data = data.replaceAll(/\r?\n/g, '\r\n')
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
        console.warn('--corepack has no effect with npm, append --pnpm to enable it')
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
        pkg.devDependencies[opts.bun ? '@types/bun' : '@types/node'] = '*'
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
  "extends": "@hyrious/configs/tsconfig.${opts.node ? 'node' : 'casual'}.json"
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
      const registry = opts.github ? 'https://npm.pkg.github.com' : 'https://registry.npmjs.org'
      writeFile('.github/workflows/npm-publish.yml', `name: Node.js Package

on:
  push:
    tags:
      - "*"
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      ${opts.github ? 'packages: write' : 'id-token: write'}
    concurrency:
      group: \${{ github.workflow }}-\${{ github.ref }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v6${opts.npm ? '' : `
      - uses: pnpm/action-setup@v4${opts.corepack ? '' : `
        with:
          version: latest`}`}
      - uses: actions/setup-node@v6
        with:
          node-version: "lts/*"
          registry-url: "${registry}"${opts.github ? `
          scope: "@${userLower}"` : ''}
          package-manager-cache: false
      - run: |${opts.npm ? `
          npm ci
          npm run build` : `
          pnpm install
          pnpm build`}${opts.npm ? `
      - run: npm publish${opts.github ? '' : ' --access public'}` : `
      - run: pnpm publish${opts.github ? '' : ' --access public'} --no-git-checks`}${opts.github ? `
        env:
          NODE_AUTH_TOKEN: \${{ secrets.GITHUB_TOKEN }}` : ''}\n`)
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

    const names = Object.keys(pkg.devDependencies)
    const plugins = opts.pnpm ? ['@pnpm/plugin-better-defaults', '@pnpm/plugin-trusted-deps'] : []
    if (pkg.packageManager) names.push('pnpm')
    names.push(...plugins)
    let versions = { __proto__: null }
    if (names.length > 0) {
      console.info('resolving', ...names)

      // https://github.com/antfu/fast-npm-meta#-resolve-multiple-packages
      const latest = async (names) => {
        const payload = encodeURIComponent(names.join('+'))
        const response = await fetch('https://npm.antfu.dev/' + payload)
        const data = await response.json()
        if (response.ok) {
          if (Array.isArray(data)) {
            return data.reduce((deps, a) => { deps[a.name] = a.version; return deps }, { __proto__: null })
          } else {
            return { __proto__: null, [data.name]: data.version }
          }
        } else {
          console.warn(data && data.message || data || 'failed to fetch npm.antfu.dev')
          return fallback(names)
        }
      }

      // https://www.jsdelivr.com/docs/data.jsdelivr.com#get-/v1/packages/npm/-package-/resolved
      const fallback = async (names) => {
        const tasks = [], deps = { __proto__: null }
        for (const name of names) {
          tasks.push(fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}/resolved`)
            .then(r => r.json())
            .then(a => { deps[a.name] = a.version }))
        }
        await Promise.allSettled(tasks)
        return deps
      }

      versions = await latest(names)
      if (pkg.packageManager && versions.pnpm) {
        pkg.packageManager = `pnpm@${versions.pnpm}`
      }
      for (const name in pkg.devDependencies) {
        if (versions[name]) pkg.devDependencies[name] = `^${versions[name]}`
      }

      // Check if done right
      for (const name in pkg.devDependencies) {
        if (pkg.devDependencies[name] == '*') {
          console.warn('failed to resolve dependency', name)
        }
      }
    }

    writeFile('package.json', sortJSON(pkg))

    if (opts.pnpm) {
      writeFile('pnpm-workspace.yaml', `
configDependencies:
  '@pnpm/plugin-better-defaults': ${versions[plugins[0]]}
  '@pnpm/plugin-trusted-deps': ${versions[plugins[1]]}
`.trimStart())
    }

    if (opts.install) {
      let bin = opts.bun ? 'bun' : opts.npm ? 'npm' : 'pnpm'
      if (win && !opts.bun) bin += '.cmd';
      let env = { ...process.env }
      if (opts.mirror) env.NPM_CONFIG_REGISTRY = 'https://registry.npmmirror.com';
      process.exitCode = cp.spawnSync(bin, ['install'], { env, stdio: 'inherit', shell: win }).status
      if (opts.mirror) {
        console.info('hint: NPM_CONFIG_REGISTRY=https://registry.npmmirror.com')
        if (opts.npm || opts.bun) {
          const lockfile = opts.bun ? 'bun.lock' : 'package-lock.json'
          let contents = fs.readFileSync(lockfile, 'utf8')
          if (opts.bun) {
            const mirror = env.NPM_CONFIG_REGISTRY.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
            contents = contents.replace(new RegExp(`"${mirror}[^"]+"`, 'g'), '""')
          } else {
            contents = contents.replaceAll(env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org')
          }
          console.log('update', lockfile)
          fs.writeFileSync(lockfile, contents)
        }
      }
    }

    const pm = opts.bun ? 'bun add' : opts.npm ? 'npm i' : 'pnpm add'

    console.log()
    console.log('next steps:')
    console.log('npx @hyrious/license mit # Update LICENSE.txt, remember to update pkg.license')
    console.log(pm + ' -D esbuild         # Define your build tool')
    console.log(pm + ' -D eslint prettier # Define your linter / formatter')
  })
  .parse(process.argv)
