# 本版网站验证说明

本说明对应新增的 `farm-carrier.html` 及作品集整合。验证依据分为网页资产、Java 核心导出数据、决策模型和网页交互逻辑；原仿真工程的验收记录单独保留。

## 1. 静态网页与原资产

工具：`tools/validate_portfolio.py`。结果：`reports/farm-site-static-validation.json`。

本次检查 6 个源 HTML 页面，核对本地 `href` / `src` / 视频封面引用、同页和跨页锚点、重复 ID、`label for` 与 ARIA 控件关联。`dist/`、`build/`、`out/`、`node_modules/`、Git 和缓存目录不参与扫描，避免把构建副本重复计入。

原 CCPP 的 30 个数据、图片、视频和回放脚本按 SHA-256 与用户上传 ZIP 对照，均保持一致。原 ZIP 未修改；更新后的作品集是独立输出。源文件检查结果以 JSON 报告为准，可在网站目录执行：

```bash
python tools/validate_portfolio.py
```

这项检查不执行 JavaScript，也不证明排版或按钮交互正确。

## 2. 回放数据与数值

工具：`tools/export_farm_replay.py`、`tools/export_farm_replay.java`、`tools/export_farm_replay.check.cjs`。说明：`tools/README_FARM_REPLAY.md`。结果：`reports/farm-replay-validation.json`。

五类场景记录由实际 Java `MissionEngine` 运行导出。校验包含终态、条带完成、资源数值范围、服务工位所有权、事件数量、帧检索与异常展示停留。标准、低电和收获场景与原核心基准结果对应；异常场景使用明确的恢复命令继续运行。

报告中的 `browserDataApiCheck` 表示面向网页的数据 API 解码与契约检查，由 JavaScript 测试执行；它不代表已经完成真实浏览器的视觉验收。源码、JAR、地图和回放数据的哈希保存在报告中。

## 3. 调度树与状态机模型

模型：`assets/data/farm-decision-model.js`。追溯说明与结构核验：`reports/farm-decision-mapping.md`。

校验内容包括 JavaScript 语法、节点 ID 唯一性、状态转换边的端点、引用 Java 方法的存在性，以及 `MissionEngine.java` 的 SHA-256。整体树与 Agent 子树分别映射真实调度规则和机器人执行分支；状态机区分 13 个机器人状态、6 个母车状态和任务生命周期状态。

这些校验说明模型结构与源码引用一致。行为树高亮仍是基于快照的解释映射，不能理解为真实行为树引擎的 tick 返回结果。

## 4. 网页 DOM 交互逻辑

对应报告：`reports/farm-ui-dom-tests.json`。本次 Node + jsdom 检查 **14/14 通过**，没有未捕获的脚本或事件错误。

回放控件、场景切换、Agent 选择和图示切换的 DOM 逻辑检查单独记录，具体结果与检查项以该报告为准。本说明不把 DOM 环境中的执行结果视为真实浏览器的像素渲染、字体显示或响应式布局验证。

可选复验使用 Node.js 与 `jsdom@26.1.0`；浏览网站本身不需要这些开发依赖：

```bash
npm install --no-save --ignore-scripts jsdom@26.1.0
node tools/check_farm_ui.cjs
node tools/check_farm_graphs.cjs
```

也可通过 `FARM_JSDOM_PATH` 指向已有 jsdom 安装目录。

## 5. 真实浏览器验证的限制

**本次新页面的真实浏览器与响应式验收未完成。** 托管预览访问超时，未取得足以确认新页面完整交互与布局的浏览器验证结果。因此，不能声称已在桌面、平板和手机浏览器完成视觉验收。

原仿真工程保存的 `13/13` 浏览器测试针对原独立操作界面，原 CCPP 页面也有自己的历史验证记录。它们均不能替代本次新增 Farm Carrier 展示页面的浏览器验收。

页面采用本地经典 JavaScript 文件载入数据，没有通过 `fetch` 或外部地图服务取数，支持解压后直接以本地文件打开 `farm-carrier.html`。完整作品集仍推荐使用 `START_PREVIEW.cmd`，以统一页面和下载资源的 HTTP 路径。
