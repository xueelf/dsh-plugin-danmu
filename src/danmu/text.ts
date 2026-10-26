/**
 * 复刻 B 站网页端的弹幕文本宽度估算。
 *
 * 按字符类别累加宽度，避免每条弹幕都触发布局。
 * 标定使用两个探针字符，量出当前字体下一单位宽度的像素，再乘以字号。
 * 字符表之外的文本（拉丁字母、emoji 等）返回 0，
 * 调用方改用元素的实测宽度，与 B 站网页端一致。
 *
 * B 站会过滤弹幕里的 emoji，本项目不复刻，emoji 按普通文本原样渲染。
 */

/** 32 到 64 的 ASCII 字符宽度，单位是当前字体的数字宽度。 */
const ASCII_WIDTH = new Map<number, number>([
  [32, 0.5],
  [33, 0.4],
  [34, 0.55],
  [35, 0.6],
  [36, 0.6],
  [37, 1],
  [38, 0.8],
  [39, 0.36],
  [40, 0.4],
  [41, 0.4],
  [42, 0.6],
  [43, 0.7],
  [44, 0.4],
  [45, 0.7],
  [46, 0.4],
  [47, 0.6],
  [48, 0.65],
  [49, 0.5],
  [50, 0.6],
  [51, 0.6],
  [52, 0.6],
  [53, 0.6],
  [54, 0.6],
  [55, 0.6],
  [56, 0.6],
  [57, 0.6],
  [58, 0.4],
  [59, 0.4],
  [60, 0.7],
  [61, 0.7],
  [62, 0.7],
  [63, 0.6],
  [64, 0.95],
]);
/** 标定探针，`def` 是该字符在表里的基准宽度。 */
const PROBES = [
  { char: '9', baseWidth: 0.6, key: 'number' },
  { char: '麤', baseWidth: 1, key: 'fullAngle' },
] as const;

/** 一单位宽度的像素数，按字体标定一次。 */
export interface SizeScale {
  /** 数字宽度的基准。 */
  readonly number: number;
  /** 全角字符宽度的基准。 */
  readonly fullAngle: number;
}

/**
 * 量一次当前字体的宽度基准。
 *
 * 与 B 站网页端一致，在与弹幕同字体的容器中放置两个 20px 的探针。
 * 量出宽度后除以基准再除以 20，得到每单位宽度的像素数。
 * 若无法测得（容器未布局或字体未就绪），返回 `null`，
 * 调用方改用元素实测宽度。
 */
export function measureSizeScale(
  container: HTMLElement,
  family: string,
  bold: boolean,
): SizeScale | null {
  const fragment = document.createElement('div');

  fragment.style.cssText =
    'position:absolute;left:-9999px;top:0;opacity:0;pointer-events:none;' +
    `font-family:${family};font-weight:${bold ? 'bold' : 'normal'};`;

  const probes = PROBES.map(probe => {
    const span = document.createElement('span');

    span.textContent = probe.char;
    span.style.cssText =
      'margin:0;padding:0;line-height:1;font-size:20px;' +
      'font-family:inherit;font-weight:inherit;';
    fragment.appendChild(span);

    return { probe, span };
  });

  container.appendChild(fragment);

  const scales = probes.map(
    ({ probe, span }) =>
      span.getBoundingClientRect().width / probe.baseWidth / 20,
  );

  fragment.remove();

  const [number, fullAngle] = scales;

  return number !== undefined && fullAngle !== undefined && number > 0
    ? { number, fullAngle }
    : null;
}

function isFullAngle(code: number): boolean {
  return (
    (code >= 8192 && code <= 10175) ||
    (code >= 11904 && code <= 40959) ||
    (code >= 63744 && code <= 64255) ||
    (code >= 65040 && code <= 65055) ||
    (code >= 65072 && code <= 65103) ||
    (code >= 65280 && code <= 65376) ||
    (code >= 65471 && code <= 65473) ||
    (code >= 65480 && code <= 65481) ||
    (code >= 65488 && code <= 65489) ||
    (code >= 65496 && code <= 65497) ||
    (code >= 65501 && code <= 65512) ||
    code === 65519
  );
}

function isHalfAngle(code: number): boolean {
  return (
    (code >= 65377 && code <= 65470) ||
    (code >= 65474 && code <= 65479) ||
    (code >= 65482 && code <= 65487) ||
    (code >= 65490 && code <= 65495) ||
    (code >= 65498 && code <= 65500) ||
    (code >= 65513 && code <= 65518)
  );
}

/**
 * 文本折合多少单位宽度，表外字符返回 0。
 *
 * 单位与字号相乘即得像素宽度，见 {@link textSize}。
 */
export function getLen(text: string, scale: SizeScale): number {
  let length = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;

    if (code >= 32 && code <= 64) {
      length += (ASCII_WIDTH.get(code) ?? 0) * scale.number;
    } else if (isFullAngle(code)) {
      length += scale.fullAngle;
    } else if (isHalfAngle(code)) {
      length += scale.fullAngle / 2;
    } else {
      return 0;
    }
  }
  return length;
}

/**
 * 一条弹幕占用的宽度与高度，CSS 像素。
 *
 * 宽度按 B 站网页端的公式取整后放大百分之二，高度为字号的 1.125 倍。
 * 估算不成立时调用 `measure` 读取元素实测值。
 */
export function textSize(
  text: string,
  fontSize: number,
  scale: SizeScale | null,
  measure: () => { width: number; height: number },
): { width: number; height: number } {
  const length = scale === null ? 0 : getLen(text, scale);

  if (length > 0) {
    return {
      width: 1.02 * Math.ceil(length * fontSize),
      height: Math.ceil(1.125 * fontSize),
    };
  }
  return measure();
}
