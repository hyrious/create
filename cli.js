#!/usr/bin/env node
import sade from 'sade'
import fs from 'node:fs'
import os from 'node:os'
import cp from 'node:child_process'
import sort_package_json from 'sort-package-json'

sade('@hyrious/create', true)
  .version(JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version)
  .describe('Create a new project.')
  .option('--prettier', 'Use Prettier', false)
  .option('--eslint', 'Use @antfu/eslint-config', false)
  .option('--typescript', 'Use TypeScript', false)
  .option('--dual', 'This is not an ESM-only package', false)
  .action(function hyrious_create_package(opts) {
    if (opts.prettier && opts.eslint) {
      throw new Error('Cannot use both prettier and eslint.')
    }

    if (opts.dual && !opts.typescript) {
      throw new Error('dual option requires typescript.')
    }

    const cwd = process.cwd()
    if (fs.readdirSync(cwd).filter(e => e[0] !== '.').length > 0) {
      throw new Error('Current directory is not empty.')
    }
    const basename = cwd.split('/').pop()

    const pkg = {
      "name": `@hyrious/${basename}`,
      "version": "0.1.0",
      "description": basename,
      "keywords": [],
      "license": "MIT",
      "author": "hyrious <hyrious@outlook.com>",
    }

    if (opts.dual) {
      pkg.main = 'dist/index.js'
      pkg.module = 'dist/index.mjs'
      pkg.types = 'dist/index.d.ts'
    } else {
      pkg.type = 'module'
      pkg.exports = './index.js'
    }

    function latest_version(name) {
      const cmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm'
      return cp.spawnSync(cmd, ['view', name, 'version'], { shell: true, encoding: 'utf8' }).stdout.trim()
    }

    const scripts = {}
    function set_script(name, cmd) {
      scripts[name] = cmd
    }

    const devDependencies = {}
    function save_dev(name) {
      devDependencies[name] = '^' + latest_version(name)
    }
    if (opts.prettier) {
      save_dev('prettier')
      set_script('format', 'prettier -w .')
    }
    if (opts.eslint) {
      save_dev('eslint'), save_dev('@antfu/eslint-config')
      set_script('lint', 'eslint .')
    }
    if (opts.typescript) {
      save_dev('typescript'), save_dev('tsup')
      set_script('build', `tsup src/index.ts${opts.dual ? ' --format esm,cjs' : ''} --clean --treeshake --target esnext --dts`)
    }

    if (Object.keys(scripts).length > 0)
      pkg.scripts = scripts

    if (Object.keys(devDependencies).length > 0)
      pkg.devDependencies = devDependencies
    
    fs.writeFileSync('package.json', JSON.stringify(sort_package_json(pkg), null, 2) + '\n')

    // enable prettier in .vscode/settings
    if (opts.prettier) {
      fs.mkdirSync('.vscode')
      fs.writeFileSync('.vscode/settings.json', JSON.stringify({
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "prettier.enable": true,
      }, null, 2) + '\n')
    }

    // enable eslint in .vscode/settings and .eslintrc
    if (opts.eslint) {
      fs.mkdirSync('.vscode')
      fs.writeFileSync('.vscode/settings.json', JSON.stringify({
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": true,
        },
        "eslint.enable": true,
        "eslint.validate": [
          "javascript",
          "typescript",
          "javascriptreact",
          "typescriptreact",
          "vue",
          "html",
          "markdown",
          "json",
          "jsonc",
          "json5"
        ],
      }, null, 2) + '\n')
      fs.writeFileSync('.eslintrc', JSON.stringify({
        extends: '@antfu'
      }, null, 2) + '\n')
    }

    // initial tsconfig.json
    if (opts.typescript) {
      fs.mkdirSync('src')
      fs.writeFileSync('src/index.ts', `export function hello() {}\n`)
      fs.writeFileSync('tsconfig.json', JSON.stringify({
        "include": ["src"],
        "compilerOptions": {
          "noEmit": true,
          "target": "esnext",
          "module": "esnext",
          "lib": ["esnext"],
          "moduleResolution": "node",
          "esModuleInterop": true,
          "strict": true,
          "resolveJsonModule": true,
          "skipLibCheck": true,
          "stripInternal": true,
        }
      }, null, 2) + '\n')
    } else {
      fs.writeFileSync('index.js', `export function hello() {}\n`)
    }

    // .gitignore
    fs.appendFileSync('.gitignore', `node_modules\ndist\n`)

  })
  .parse(process.argv)
