/**
 * Web 模块加载器注入的全局对象。
 *
 * 页面在任何 client 产物执行之前将其挂到 `window` 上。
 * 官方 client 产物统一写作 `window.__ModuleLoader__.load(...)`，
 * 安装包没有随附类型声明，本仓库自行声明。
 *
 * 本文件不含 import 与 export，所声明的类型为全局类型，使用时无需引入。
 */

interface ModuleLoaderDefinition {
  /** 注册 id，通常是包名。 */
  readonly id: string;
  /** 返回 Cordis 插件的工厂。 */
  readonly factory: (require: (id: string) => unknown) => unknown;
}

interface ModuleLoader {
  load(definition: ModuleLoaderDefinition): void;
}

interface Window {
  /** 由页面注入，未注入时为 undefined。 */
  __ModuleLoader__?: ModuleLoader;
}
