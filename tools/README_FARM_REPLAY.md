# Farm Carrier 真实核心回放数据

本目录的导出器调用已完成项目中未经修改的 `farm.sim.MissionEngine`，网站不运行另一套 JavaScript 调度算法。规则决策、FIFO 补给、断点续作和状态转换均发生在 Java 核心中。

## 再生成

安装 JDK 17 或以上、Python 3。将 Farm Carrier 项目与作品集放在相邻目录，运行：

```bash
python tools/export_farm_replay.py --core ../farm_carrier_system
node tools/export_farm_replay.check.cjs
```

也可以用 `--core` 指向解压后的完整核心项目。命令需要核心的 `farm-carrier.jar`、`maps/farm_map.json`、`src/main/java/farm/sim/MissionEngine.java` 和 `reports/benchmark.json`。导出器不修改这些输入。

产物：

- `assets/data/farm-replays.js`：5 个真实运行场景、地图、静态条带几何、事件、终点指标和浏览器访问 API。
- `assets/data/farm-evidence.json`：来源哈希、模型边界、采样规则、参数与既有基准。
- `reports/farm-replay-validation.json`：逐场景终点和暂停点核验。

## 数据语义

每个核心时间步为 0.25 秒。导出器保留每 5 秒的帧，以及每个步末观察到的状态、资源持有者或事件数变化。为减少快照开销，导出器通过只读反射检测变化；写出的值全部取自公开 `snapshot()`、`events()` 和 `metrics()` 接口。不会重写任务分配。

坐标与显示资源值保留 3 位小数，能量保留 6 位小数。全局累计完成米数和终点 `metrics` 使用核心原始精度；完成条带的完成长度直接等于原始总长度，避免显示量化使其越过终点。一个时间步内多个内部动作只保留步末状态，全部事件依旧保留；这不是逐行执行跟踪。检查脚本需要 Node.js（仅数据生成与验证使用，浏览网页不需要）。

`time` 为真实仿真时钟，`replayTime` 为展示时间轴。故障和通道阻塞场景在 Java 进入 `WAITING_RECOVERY` 后插入 12 秒展示等待；仿真时钟不前进。随后导出脚本明确调用 `clear_fault` 或 `clear_route`，模拟操作员确认。网页必须显示这个人为操作，不能将其描述为自主修复。

完成率是已完成条带中心线米数 / 计划条带中心线米数；不是独立计算的扫掠面积覆盖率。`activePath` 是当前剩余导航路径，在 `WORKING` 等非导航状态下可能保留旧导航末端；网页应只在 `TO_WORK` / `RETURNING` 状态显示导航线。实际工作线使用当前条带及断点位置。

## 浏览器接口

以普通 `<script src="assets/data/farm-replays.js"></script>` 加载，因此 HTTP 与 `file://` 都可使用，不需要网络数据请求。

```js
const replay = window.FarmReplay;
replay.scenarios;                         // 每个场景的名称、时长、说明、终点指标
replay.map;                               // 共享地图
replay.strips;                            // 共享静态条带几何
replay.getFrameCount('normal');
replay.getFrame('normal', 0);              // 解码后的 snapshot 兼容对象
replay.getFrameAtTime('normal', 900);       // 返回 <= replayTime 的最近帧
replay.getFrames('normal');                // 解码全部帧；较耗内存，播放器通常不需要
replay.getEvents('normal');                // 全部原始核心事件，额外附 replayTime
replay.getChapters('robot_fault');         // 按时间排序的重要事件
replay.getScenario('normal').metrics;
```

帧包含 `time`、`replayTime`、`status`、`reason`、`carrier`、`robots`、`coverage`、`queue`、`bayOwner`、`corridorOwner`、`routeBlocked`、`eventIndex`、`scriptedOperator` 和 `parameters`。`eventIndex` 是当前帧已经发生的事件数。

机器人 `battery`、`material`、`cargo` 都是百分比；`batteryKWh`、`materialKg`、`cargoKg` 是物理单位。载具 `cargo` 和 `supply` 沿用核心的 kg 语义，请用 `supplyPercent` 或相应容量计算百分比。状态机和调度树应使用同一帧，不能各自独立动画。

## 核验范围

正常、低电量和收获场景的终点时间、距离、能耗、物料、货物、补给次数和队列等待对比此前的 `reports/benchmark.json`。故障和阻塞场景对比已有基准的首次暂停时间，随后检查显式解除后任务完成、全部机器人在车上、资源守恒和无核心不变量违规。

这些核验不替代实车试验、全场多机器人避碰、车辆轮廓碰撞或农业作业器扫掠面积验证。
