import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DANMU_CLASS } from '#/danmu/overlay';

test('弹幕样式类名与引擎一致', () => {
  const css = readFileSync(
    new URL('../src/styles/danmu.css', import.meta.url),
    'utf8',
  );

  expect(css).toContain(`.${DANMU_CLASS} {`);
  expect(css).toContain(`.${DANMU_CLASS}.${DANMU_CLASS}-show`);
  expect(css).toContain(`.${DANMU_CLASS}-roll`);
  expect(css).toContain(`.${DANMU_CLASS}-center`);
});
