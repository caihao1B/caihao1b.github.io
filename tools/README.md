# 本版维护工具

本工程现为三项目精简合并版。`check_site.py` 已覆盖 ROS 2；`check_preview.py` 使用标准库检查本地预览的视频区间响应。
最新报告为 `reports/merged-*`，截图为 `reports/merged-screenshots/`。下文浏览器脚本是输入包原有工具，仅覆盖前两项与概述页。
`package_portfolio.py` 现在输出上一级的 `Zehao_Portfolio_Concise_All.zip`。

网站无需构建即可浏览；不要先安装 npm 依赖。

- `python tools/check_site.py`：标准库静态检查，适用于精简版页面。
- `python tools/validate_portfolio.py`：上述检查的兼容入口。
- `python tools/browser_smoke.py --base-url http://127.0.0.1:8000`：可选真实浏览器回归，需 Playwright 与浏览器。先启动预览服务器。
- `python tools/browser_smoke.py --inline --executable /path/to/chromium`：将本站本地资源嵌入页面后测试，不会导航到 URL，也不会修改浏览器策略；不代表 HTTP 浏览器访问测试。
- `node tools/check_farm_graphs.cjs`：校验未改动的决策解释模型与回放记录，输出 farm-graph-validation.json。
- `python tools/package_portfolio.py`：生成新版 ZIP 和哈希清单到项目目录外。
- `python tools/build_site.py`：可选静态部署目录；GitHub Pages 从根目录发布时不需要。

`export_farm_replay.*` 保留原导出工作流，需要 Java 工程；只改介绍或样式时不要重新生成数据。
`legacy/check_farm_ui_v1.cjs` 是旧版页面的模拟 DOM 检查代码，只作历史材料保留，路径和 DOM 假设不适用于本版。以新的 browser_smoke.py 为准。
本次交付的验收记录使用 reports/concise- 前缀。
