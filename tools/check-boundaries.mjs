import ts from 'typescript'
import { isBuiltin } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
const root = process.cwd()
const appManifest = JSON.parse(await readFile('package.json', 'utf8'))
const manifests = new Map()
for (const name of await readdir('packages')) {
  const folder = path.join(root, 'packages', name)
  manifests.set(folder, JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')))
}
const errors = []
async function scan(folder, owner) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) { await scan(file, owner); continue }
    if (!/\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.d.ts')) continue
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const check = node => {
      let specifier
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text
      if (specifier) {
        const fail = reason => errors.push(`${path.relative(root, file)}: ${specifier}: ${reason}`)
        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(file), specifier)
          if (owner && !target.startsWith(`${owner}/`)) fail('包内相对导入不得越过本包边界')
          if (file.startsWith(`${root}/worker/`) && target.startsWith(`${root}/src/`)) fail('部署 Worker 不得依赖 Web UI')
          if (!owner && target.startsWith(`${root}/packages/`)) fail('应用必须通过包的公共入口导入')
        } else if (!isBuiltin(specifier) && !specifier.startsWith('virtual:')) {
          const manifest = owner ? manifests.get(owner) : appManifest
          const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
          const allowed = { ...manifest.dependencies, ...manifest.devDependencies }
          if (!allowed[name] && name !== manifest.name) fail('依赖未在本包声明')
          if (name.startsWith('@m3n/')) {
            const target = [...manifests.values()].find(item => item.name === name)
            const subpath = specifier.slice(name.length)
            if (target && !target.exports?.[subpath ? `.${subpath}` : '.']) fail('只允许已声明的公共入口')
          }
        }
      }
      ts.forEachChild(node, check)
    }
    check(source)
  }
}
for (const folder of manifests.keys()) await scan(path.join(folder, 'src'), folder)
await scan(path.join(root, 'src'))
await scan(path.join(root, 'worker'))
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log('Package boundaries verified.')
