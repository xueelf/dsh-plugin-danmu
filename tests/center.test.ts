import { expect, test } from 'bun:test';
import { CenterAllocator } from '#/danmu/center';

const request = (now: number, height = 30) => ({
  height,
  now,
  containerHeight: 500,
  area: 50,
});

test('顶部逐行排列', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add(request(0))).toBe(4);
  expect(allocator.add(request(0))).toBe(35);
});
test('过期行复用', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add(request(0))).toBe(4);
  expect(allocator.add(request(5))).toBe(4);
});
test('显示区域放不下', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), area: 5 })).toBeNull();
});
test('堆叠超出显示区域', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), area: 10 })).toBe(4);
  expect(allocator.add({ ...request(0), area: 10 })).toBeNull();
});
test('单条高于整层', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), height: 501 })).toBeNull();
});
