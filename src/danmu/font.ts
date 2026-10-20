/**
 * 复刻 B 站网页端的弹幕字号换算。
 *
 * 字号以 25 为基准，按容器高度分段换算，最小 12px。规则如下。
 *
 * ```js
 * // 弹幕字号倍率，默认 1
 * const e = setting.fontSize;
 *
 * // 随屏缩放，默认 true
 * if (setting.fullScreenSync) {
 *   const r = containerSize.height;
 *   // 25 是归一化基准
 *   const n = e * size / 25;
 *
 *   return r <= 314  ? 16
 *        : r <= 499  ? n * (0.0385 * r + 3.29)
 *        : r <= 608  ? 0.041 * r * n
 *        : r <= 700  ? n * (0.022 * r + 12)
 *        : r <= 816  ? 27 * n
 *        : r <= 980  ? n * (0.0365 * r - 2.5)
 *        : r <= 1300 ? n * (0.022 * r + 18.5)
 *        : 40 * n;
 * }
 * return e * size;
 * ```
 *
 * 调用方另外先取 `Math.max(12, 结果)`，再在结果为假值时回落到 25，
 * {@link getFontSize} 也做了同样的事。
 */

/** 换算归一化所用的基准字号。 */
export const REFERENCE_SIZE = 25;

/** B 站网页端允许的最小渲染字号，CSS 像素。 */
export const MIN_FONT_SIZE = 12;

/** 换算得不出结果时的回落值。 */
const FALLBACK_SIZE = 25;

/**
 * 一条弹幕实际渲染的像素大小。
 *
 * @param size - 弹幕自带的 `size` 字段，通常为 25。
 * @param containerHeight - 弹幕所在层的高度。
 * @param fontSize - 弹幕字号设置。
 * @param fullScreenSync - 随屏缩放设置。关闭时字号固定不缩放。
 */
export function getFontSize(
  size: number,
  containerHeight: number,
  fontSize: number,
  fullScreenSync = true,
): number {
  if (!fullScreenSync) {
    return normalize(fontSize * size);
  }
  const normalized = (fontSize * size) / REFERENCE_SIZE;
  const height = containerHeight;
  const scaled =
    height <= 314
      ? 16
      : height <= 499
        ? normalized * (0.0385 * height + 3.29)
        : height <= 608
          ? 0.041 * height * normalized
          : height <= 700
            ? normalized * (0.022 * height + 12)
            : height <= 816
              ? 27 * normalized
              : height <= 980
                ? normalized * (0.0365 * height - 2.5)
                : height <= 1300
                  ? normalized * (0.022 * height + 18.5)
                  : 40 * normalized;

  return normalize(scaled);
}

/**
 * 归一化到 B 站网页端的取值区间，顺序与 B 站网页端一致：先将结果提升到最小字号，再在取不到时回落 25。
 *
 * `Math.max(12, NaN)` 仍是 `NaN`，所以回落只会在换算失败时触发。
 */
function normalize(size: number): number {
  return Math.max(MIN_FONT_SIZE, size) || FALLBACK_SIZE;
}
