import { expect, test } from 'bun:test';
import { rollDanmuLimit, RollDanmuRateLimiter } from '#/danmu/rate-limit';

test('滚动弹幕每秒上限', () => {
  expect(rollDanmuLimit(50, 1000, 1)).toBe(18);
  expect(rollDanmuLimit(100, 1000, 1)).toBe(36);
  expect(rollDanmuLimit(50, 800, 1.7)).toBe(9);
  expect(rollDanmuLimit(0, 1000, 1)).toBe(9999);
});
test('任意一秒窗口不超过上限', () => {
  const limiter = new RollDanmuRateLimiter();

  expect(limiter.admit(0, 3)).toBe(true);
  expect(limiter.admit(200, 3)).toBe(true);
  expect(limiter.admit(400, 3)).toBe(true);
  expect(limiter.admit(600, 3)).toBe(false);
  // 0 毫秒的条目在 1000 毫秒时离开窗口。
  expect(limiter.admit(1000, 3)).toBe(true);
  // 窗口内仍有 200、400、1000，保持满额。
  expect(limiter.admit(1100, 3)).toBe(false);
  // 200 离开后放行。
  expect(limiter.admit(1200, 3)).toBe(true);
});
test('重置清空窗口', () => {
  const limiter = new RollDanmuRateLimiter();

  expect(limiter.admit(0, 1)).toBe(true);
  expect(limiter.admit(100, 1)).toBe(false);
  limiter.reset();
  expect(limiter.admit(200, 1)).toBe(true);
});
