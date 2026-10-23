/**
 * 把流式 reasoning 整理成弹幕可读的整行。
 *
 * 只有换行结束的整行才会处理，半行留在缓冲区。
 * 围栏代码块整段吞掉，未闭合的围栏按普通文本发出。
 * 表格整段收集后整批发出，表格行不切分也不截断。
 * 普通文本按空行缓冲成段落，整段 removeMarkdown 后再切分。
 */

import removeMarkdown from 'remove-markdown';

/**
 * 普通行超过这个字符数才按句切开。
 *
 * 取 100 是 B 站单条弹幕的上限，这里只当切分阈值，
 * 不截断内容，单句再长也原样发出。
 */
const SPLIT_CHARS = 100;
/**
 * 围栏代码块开始，只认恰好三个反引号或三个波浪线。
 *
 * 来源：https://www.markdownguide.org/extended-syntax/#fenced-code-blocks
 * 行首缩进在检测前 trimStart，四个及以上按普通文本处理。
 */
const FENCE_OPEN = /^(`{3}(?!`)|~{3}(?!~))/u;
/** 围栏代码块结束，规则与开线相同，行尾只能有空白。 */
const FENCE_CLOSE = /^(`{3}(?!`)|~{3}(?!~))\s*$/u;
/**
 * GFM 表格的分隔行，例如 `| --- | :---: |`。
 *
 * 必须含竖线，每一列至少三个连字符。表头本身和段落无法区分，
 * 只有读到这一行才能确认前面那行是表头。
 */
const TABLE_DELIMITER =
  /^(?=.*\|)\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/u;
const segmenter = new Intl.Segmenter('zh', { granularity: 'sentence' });

/** 一条待发送的弹幕。 */
export interface Snippet {
  readonly text: string;
  /** `table` 表示表格行，由调用方用顶部弹幕展示。 */
  readonly kind: 'table' | 'text';
}

/** 累积流式文本，按段落和块释放。 */
export class SnippetBuffer {
  private pending = '';
  private held: string | null = null;
  private fence: {
    readonly char: string;
    readonly lines: string[];
  } | null = null;
  private table: string[] | null = null;
  /** 当前普通文本段落，等待空行或 flush 后整段处理。 */
  private paragraph: string[] | null = null;

  /** 追加一段增量，返回这次可以发送的弹幕。 */
  push(delta: string): Snippet[] {
    this.pending += delta;

    const released: Snippet[] = [];

    let newline = this.pending.indexOf('\n');

    while (newline >= 0) {
      const line = this.pending.slice(0, newline);

      this.pending = this.pending.slice(newline + 1);
      this.consume(line, released);
      newline = this.pending.indexOf('\n');
    }
    return released;
  }

  /** 清空所有缓冲，切换会话时使用。 */
  reset(): void {
    this.pending = '';
    this.held = null;
    this.fence = null;
    this.table = null;
    this.paragraph = null;
  }

  /** 取走剩余内容，空内容返回空数组。 */
  flush(): Snippet[] {
    const released: Snippet[] = [];

    if (this.pending !== '') {
      this.consume(this.pending, released);
    }

    if (this.held !== null) {
      this.appendParagraph(this.held);
      this.held = null;
    }
    this.flushParagraph(released);

    // 围栏到结束都没闭合，按普通文本发出，不能吞掉。
    if (this.fence !== null) {
      for (const line of this.fence.lines) {
        this.emitText(line, released);
      }
    }
    this.flushTable(released);
    this.reset();

    return released;
  }

  private consume(line: string, released: Snippet[]): void {
    if (this.fence !== null) {
      const close = FENCE_CLOSE.exec(line.trimStart());

      if (close !== null && close[1]?.[0] === this.fence.char) {
        // 闭合了才吞掉，开线和闭合线一起丢。
        this.fence = null;
      } else {
        this.fence.lines.push(line);
      }
      return;
    }

    if (this.table !== null) {
      if (line.includes('|')) {
        this.table.push(line);

        return;
      }
      this.flushTable(released);
    }

    if (TABLE_DELIMITER.test(line)) {
      this.flushParagraph(released);
      // 分隔行也保留，和表头、数据行一起整批发出去。
      this.table = this.held === null ? [line] : [this.held, line];
      this.held = null;

      return;
    }

    if (this.held !== null) {
      this.appendParagraph(this.held);
      this.held = null;
    }
    const fenceLine = line.trimStart();
    const fence = FENCE_OPEN.exec(fenceLine);

    if (fence !== null) {
      this.flushParagraph(released);

      const marker = fence[1] ?? '```';

      this.fence = {
        char: marker[0] ?? '`',
        lines: [line],
      };

      return;
    }

    if (line.trim() === '') {
      this.flushParagraph(released);

      return;
    }

    if (line.includes('|')) {
      this.held = line;

      return;
    }
    this.appendParagraph(line);
  }

  /** 把一行普通文本追加到当前段落。 */
  private appendParagraph(line: string): void {
    if (this.paragraph === null) {
      this.paragraph = [line];
    } else {
      this.paragraph.push(line);
    }
  }

  /** 把当前段落一次性交给文本处理。 */
  private flushParagraph(released: Snippet[]): void {
    if (this.paragraph === null) {
      return;
    }
    this.emitText(this.paragraph.join('\n'), released);
    this.paragraph = null;
  }

  /** 把收集到的表格整批发出，保持原来的行序。 */
  private flushTable(released: Snippet[]): void {
    if (this.table === null) {
      return;
    }

    for (const line of this.table) {
      this.emitTable(line, released);
    }
    this.table = null;
  }

  /** 普通段落整段一条，超过阈值才按句切分。 */
  private emitText(line: string, released: Snippet[]): void {
    const text = clean(line);

    if (text === '') {
      return;
    }

    if (Array.from(text).length <= SPLIT_CHARS) {
      released.push({ text, kind: 'text' });

      return;
    }

    for (const segment of segmenter.segment(text)) {
      if (segment.segment.trim() === '') {
        continue;
      }
      released.push({ text: segment.segment, kind: 'text' });
    }
  }

  /** 表格行原样一条，不切分也不截断。 */
  private emitTable(line: string, released: Snippet[]): void {
    const text = clean(line);

    if (text === '') {
      return;
    }
    released.push({ text, kind: 'table' });
  }
}

/** 把一行 Markdown 清成纯文本，只有整行空白才丢弃。 */
function clean(line: string): string {
  const text = removeMarkdown(line);

  return text.trim() === '' ? '' : text;
}
