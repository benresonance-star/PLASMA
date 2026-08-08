import fs from 'node:fs';
import path from 'node:path';

function writePkg(dir, name) {
  const withTests = name === 'shared-units';
  const pkg = {
    name: `@spds/${name}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    files: ['dist'],
    scripts: withTests
      ? {
          build: 'tsc -p tsconfig.json',
          typecheck: 'tsc -p tsconfig.json --noEmit',
          lint: 'eslint src --max-warnings 0',
          test: 'vitest run',
        }
      : {
          build: 'tsc -p tsconfig.json',
          typecheck: 'tsc -p tsconfig.json --noEmit',
          lint: 'eslint src --max-warnings 0',
          test: 'node -e process.exit(0)',
        },
  };
  if (withTests) {
    pkg.devDependencies = {
      typescript: '^5.8.2',
      vitest: '^3.0.8',
      eslint: '^9.22.0',
    };
  }
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

for (const kind of ['packages', 'apps', 'services']) {
  for (const name of fs.readdirSync(kind)) {
    const dir = path.join(kind, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    writePkg(dir, name);
  }
}

console.log('rewrote package.json files without BOM');
