import { $, build, file, Glob } from 'bun';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Journal, LevelDebug } from 'annal';
import { name } from '~/package.json';
import { compilerOptions } from '~/tsconfig.json';

const logger = new Journal({ scope: 'build', level: LevelDebug });
const root = join(import.meta.dir, '..');
const BUNDLED_LICENSES = [{ name: 'remove-markdown', file: 'LICENSE' }];

await rm(compilerOptions.outDir, { recursive: true, force: true });
logger.info('Output directory cleaned');
await $`tsc -p tsconfig.build.json`;
logger.info('Type declaration files generated');
// 宿主入口运行在 Node 进程。
await build({
  entrypoints: ['src/index.ts'],
  format: 'esm',
  outdir: compilerOptions.outDir,
  packages: 'external',
  target: 'node',
});
/**
 * Client 产物是 lazy CJS factory。
 * Bun 输出 CJS，React 和 react/jsx-runtime 保持 external，
 * 再把整个 bundle 包进 __ModuleLoader__.load 的 factory。
 */
await build({
  entrypoints: ['src/client.ts'],
  external: ['react', 'react/jsx-runtime'],
  format: 'cjs',
  outdir: compilerOptions.outDir,
  target: 'browser',
  jsx: {
    runtime: 'automatic',
    development: false,
  },
  loader: {
    '.css': 'text',
  },
  define: {
    __PACKAGE_NAME__: JSON.stringify(name),
  },
});
logger.info('JavaScript bundles generated');

const clientPath = join(compilerOptions.outDir, 'client.js');
const clientBundle = await file(clientPath).text();
const clientArtifact = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${clientBundle}
    return module.exports;
  },
});
`;

await writeFile(clientPath, clientArtifact);
new Bun.Transpiler({ loader: 'js' }).transformSync(clientArtifact);
logger.info('Client artifact syntax verified');

/**
 * 页面会原样执行 Client 产物，只要残留 `import` 或 `export` 语句，
 * 或者产物不是 factory 包裹的 CJS，插件在加载时就会失败。
 */
const moduleSyntax = clientArtifact
  .split('\n')
  .filter(line => /^\s*(?:import|export)\s/u.test(line));

if (moduleSyntax.length > 0) {
  throw new Error(
    `Client artifact must stay free of module syntax:\n${moduleSyntax.join('\n')}`,
  );
}

if (!clientArtifact.includes('__ModuleLoader__')) {
  throw new Error(
    'Client artifact does not register with the Web module loader',
  );
}
logger.info('Client artifact verified');

const outputPaths = await Array.fromAsync(
  new Glob('**/*').scan({
    absolute: true,
    cwd: compilerOptions.outDir,
  }),
);
const outputBytes = outputPaths.reduce(
  (bytes, path) => bytes + file(path).size,
  0,
);
const outputSize = `${(outputBytes / 1000).toFixed(2)} KB`;
const licensesDir = join(root, 'licenses');

await rm(licensesDir, { recursive: true, force: true });
await mkdir(licensesDir, { recursive: true });

for (const entry of BUNDLED_LICENSES) {
  await copyFile(
    join(root, 'node_modules', entry.name, entry.file),
    join(licensesDir, `${entry.name}.txt`),
  );
}
logger.info('Third-party licenses copied');
logger.info('Build completed');
logger.debug(`Output: ${compilerOptions.outDir}`);
logger.debug(`Artifacts: ${outputPaths.length} files, ${outputSize}`);
