import { en } from './en';
import { zh } from './zh';

/** 翻译函数，只需按键取文案。 */
export type Translate = (key: string) => string;

/** 面板的本地化文案，英文和中文分别放在同目录语言文件。 */
export const SETTINGS_LOCALE = { en, zh };
