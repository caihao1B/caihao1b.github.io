# 专业化文案修订

## 修改范围

统一修改首页、覆盖规划、农田协同、ROS 2 及系统架构概述页的导航、标题、导语和项目说明。
使用“项目介绍”“研究与工程项目”“联系方式”等栏目名称，以及“覆盖路径与参考轨迹回放”“调度决策与状态转换”“六轴机械臂运动学交互”等技术标题。
ROS 2 恢复模式与任务阶段的动态标题、轨迹回放提示同步调整，避免切换后恢复旧表达。

保持既有专业事实、功能边界与来源说明。按钮仍使用直接的操作名称。未改变页面结构、样式、交互逻辑或模型参数。

## 检查结果

- 52 项静态检查通过，记录为 reports/professional-static-checks.json。
- assets/replay.js 和 assets/ros2.js 通过 Node 语法检查。
- 64 个数据、源码、下载包、视频与图像文件的 SHA-256 未变，记录为 reports/professional-copy-review.json。
- 浏览器核对 1280 px 下的五个展示页，以及 390 px 下的首页和三个项目页；页面未出现横向溢出。
- 实际切换论文决策 D2 分支后，标题显示“剩余区域覆盖几何替换”。
- 当前截图见 reports/professional-screenshots/，布局观察见 reports/professional-browser-checks.json。

本轮为文案修订，未重复运行仿真和全面交互回归；此前 merged-* 和 concise-* 资料作为历史记录保留。
