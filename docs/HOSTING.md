# Code Shell 托管

当前工作区由相邻的 Code Shell 项目将本项目的 `dist/` 挂载到 `/score/`。该目录直接用于提供页面，不是独立的测试输出目录。

构建托管版本（包括在这个工作区验证完整构建）时，使用：

```sh
VITE_BASE_URL=/score/ VITE_SUBMIT_MODE=remote npm run build
```

默认 `npm run build` 会生成根路径 `/assets/` 的资源引用，覆盖托管目录后会导致页面白屏或脚本 MIME 错误。不要在托管目录上用默认参数覆盖构建。只需验证构建时也可使用单独的输出目录，避免影响正在访问的页面。

Code Shell 的 `codesh-sites-sync.service` 监测源码与入口产物变化，并自动按 `/score/` 重建。排查时先检查 `dist/index.html` 是否引用 `/score/assets/`，再检查同步日志：

```sh
systemctl is-active codesh-sites-sync.service
journalctl -u codesh-sites-sync.service -n 30 --no-pager
```

按需仅重建这个托管站点，可在相邻 Code Shell 项目中运行 `node scripts/build-sites.mjs /score`。普通静态页面更新不需要启动开发服务器。

恢复后用真实浏览器打开托管地址，检查首页、资源响应和脚本错误；若页面在更新前已打开，刷新以加载新的入口和资源。

生产构建使用 Vite 默认的按需分包：HTML 只加载应用入口，页面、曲谱正文、播放和导出代码在需要时加载。发布时先生成完整构建，再更新资源与 HTML 入口，最后清理不再使用的哈希资源。已打开的旧页面可能仍引用已清理的旧分包；刷新即可获取当前版本。音源、播放模块和导出字体均按需加载。

托管构建先在 `.tmp/` 完整生成新版本，再发布资源、最后替换HTML入口，随后立即清理旧资源。这样在构建期间继续提供当前版本，避免资源被提前清空后由CDN缓存404；发布后不保留旧版本。

其余独立资源使用Vite默认的内容哈希命名，不追加每次发布的随机版本后缀；相同内容沿用相同URL。HTML内的代码和样式随入口原子替换，不存在入口与脚本的跨版本请求窗口。


Cloudflare 根域名部署保留 SPA 页面回退，但 `/assets/*` 必须先经过 Worker：`wrangler.jsonc` 的 `assets.run_worker_first` 指定该路径。Worker 对不存在的资源以及静态绑定误回退的 HTML 返回 `404 text/plain` 和 `Cache-Control: no-store`，防止旧哈希脚本地址得到带一年 immutable 缓存的 HTML，触发 JavaScript MIME 错误。正常脚本保留原有内容类型和缓存，`/scores/<id>` 等页面仍可直接访问。已打开的旧页面仍需刷新以取得最新资源引用；这项修复需要发布 Cloudflare Worker 配置和代码后才会在线上生效。


此前 HTTPS 浏览器可能已经把 `/assets/<哈希>.js` 的错误 HTML 按 immutable 长期缓存，服务器修复无法直接删除客户端旧缓存。静态资源现统一迁移到稳定的 `/assets/v2/` 命名空间，入口、动态模块、Worker 和音源由 Vite 一起更新引用，绕开原 URL；仍按内容哈希命名，不增加每次构建的随机参数。根首页和 `/scores/*` 页面显式使用 `Cache-Control: no-store`，避免重新打开 PDF 深链接时复用旧 HTML。无需更改 PDF 的 HTTPS 链接。
