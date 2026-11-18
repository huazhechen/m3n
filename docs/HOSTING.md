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

Vite 重建会清除旧资源。已打开的标签页若加载旧版按需脚本失败，会自动刷新获取最新入口；同一标签页对每个入口脚本URL最多自动刷新一次；连续发布的新入口可立即再次恢复，同一入口持续失败时保留错误提示，避免循环刷新。

托管构建先在 `.tmp/` 完整生成新版本，再发布资源、最后替换HTML入口，随后立即清理旧资源。这样在构建期间继续提供当前版本，避免资源被提前清空后由CDN缓存404；发布后不保留旧版本。

资源使用Vite默认的内容哈希命名，不追加每次发布的随机版本后缀；相同内容沿用相同URL。
