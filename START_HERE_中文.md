# 董泽豪 · 三项目精简版作品集

由 Zehao_Portfolio_Concise.zip 的前两个项目与本地 ROS 2 项目合并。纯 HTML / CSS / JavaScript，无构建和依赖安装步骤。

## 文案规范与最新修订

导航、栏目标题和项目介绍统一使用专业技术表述，以研究对象、实现方法与展示范围组织内容，避免口号式标题和口语化设问。
本轮修改涉及五个展示页、使用说明，以及轨迹回放和 ROS 2 脚本中的展示文字；算法逻辑、模型、仿真数据和录像未修改。
最新检查与截图使用 `reports/professional-*` 前缀；原 `merged-*` 报告和截图对应此前合并版。
修订摘要见 `docs/PROFESSIONAL_COPY_REVISION_ZH.md`。

## 本地打开

Windows 双击 START_PREVIEW.cmd。它会检查可用的 Python 3（先 py，后 python），并打开实际的本地地址。
也可在本目录执行 `python preview_server.py`；默认端口 8000，冲突时自动换端口。Ctrl+C 停止。
不启动服务时可直接双击 index.html。保留完整 assets 文件夹。

## 三个项目

- index.html：简短介绍、三个项目入口、教育与联系方式。
- ccpp.html：覆盖路线、全部案例、三层视图与两段转弯视频。
- farm-carrier.html：五类场景、真实记录回放、完整调度树及母车 / 机器人状态机。
- ros2.html：机械臂、论文决策、原始录像、场景与任务四个标签；技术说明按需展开。
- projects.html：三个项目之间的关系。

前两个项目的回放代码与数据沿用精简包。第三个项目保留源模型、运动学交互、论文图、完整录像及源码摘录；网页精简不等于重新运行或修改仿真。
主展示页没有实验数据表或静态指标墙。论文与搬运工程分别说明，录像保留任务失败，机械臂展示为运动学重建。

## 修改位置

介绍文字修改对应 HTML；统一样式在 assets/portfolio.css，本次三项目适配在 assets/merged.css；ROS 2 标签行为在 assets/ros2-concise.js。
assets/ros2.js 与 assets/arm-lab.js 保留原交互，模型在 assets/data/arm-model.js，场景在 assets/data/robot-scene.js。
不要为了页面效果修改原始轨迹、模型参数或结果数据。

## 检查与打包

```text
python tools/check_site.py
python tools/check_preview.py
python tools/package_portfolio.py
```

打包脚本更新文件哈希清单，在本目录上一级生成 Zehao_Portfolio_Concise_All.zip。
预览服务器支持视频区间读取，原始录像的章节按钮可在本地 HTTP 预览中直接跳转。
本次合并检查见 docs/MERGED_SITE_VALIDATION_ZH.md；reports/merged- 前缀才是本次记录。
其余 reports 与 PROJECT03_VALIDATION_ZH.md 属于原包历史材料，不代表本版测试结果。
可选旧浏览器回归工具 tools/browser_smoke.py 仅覆盖前两项及概述页，需已有 Playwright 与浏览器；不需要为了浏览本站安装它。

## 范围

这是本地工程，没有提交、推送或发布。可以直接复制本目录的内容到静态站点目录；发布根目录应包含 index.html 和 assets。
后续修改先读 AGENTS.md。来源与许可见 assets/source/yzbot/SOURCE-NOTES.txt。
