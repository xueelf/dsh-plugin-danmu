import { $, build, file, Glob } from 'bun';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Journal, LevelDebug } from 'annal';
import { compilerOptions } from '~/tsconfig.json';

const logger = new Journal({ scope: 'build', level: LevelDebug });

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
 * Client 入口由 Web 模块加载器直接执行，
 * 以浏览器为目标构建，依赖全部保持 external。
 */
await build({
  entrypoints: ['src/client.ts'],
  format: 'esm',
  outdir: compilerOptions.outDir,
  packages: 'external',
  target: 'browser',
});
logger.info('JavaScript bundles generated');

/**
 * 页面会原样执行 Client 产物，只要残留 `import` 或 `export` 语句，
 * 或者产物中包含 React，插件在加载时就会失败，而且不会给出明显提示。
 */
const clientArtifact = await file(
  join(compilerOptions.outDir, 'client.js'),
).text();
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

logger.info('Build completed');
logger.debug(`Output: ${compilerOptions.outDir}`);
logger.debug(`Artifacts: ${outputPaths.length} files, ${outputSize}`);
