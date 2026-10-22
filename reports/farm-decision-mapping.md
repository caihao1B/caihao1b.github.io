# Farm Carrier：网页决策树与 Java 状态机追溯

## 表示约定

网站中的行为树是 `MissionEngine.java` 既有规则的**层次化解释视图**。实际系统通过确定性规则、贪心条带分配和有限状态机执行；本网页没有增添 BehaviorTree.CPP、LLM Agent、强化学习或独立行为树执行器。

节点高亮表示真实回放快照所对应的持续状态或已记录返航原因。例如在 `RETURNING` 且 `returnReason=LOW_BATTERY` 时，返航分支和低电原因会同时高亮。这不表示 Java 此刻再次执行了低电判断，也不记录 BT 的 `SUCCESS/FAILURE/RUNNING` 状态。未取得内部状态的信息不会由网页伪造：`finalReturn`、`previousState`、`recalled` 的细节通过源码条件说明。

当任务进入 `WAITING_RECOVERY`，树只高亮任务门控、故障与路阻节点，不再高亮推进作业、移动、装卸或补给的动作。FSM 仍显示保留的真实状态，改用琥珀色并明确注明“时钟冻结，所有动作均未推进”；它不会将其他机器人保留的 `WORKING` 状态解释为故障等待期间继续作业。

完整树可下载为 `FarmDecisionModel` JSON，源码在 `assets/data/farm-decision-model.js`。每个节点含 `id`、`kind`、`guard`、`action`、`source` 和子节点。

## 调度树对应关系

| 展示层级 | Java 方法 | 实际职责 |
|---|---|---|
| 全局恢复锁 | `tick()`、`command()`、`resumeIfSafe()` | 仅 `RUNNING` 推进时间；故障和路阻分别锁存并分别清除。 |
| 母车运输 | `step()`、`moveCarrier()` | 沿声明道路移动，车上机器人跟随母车，扣除母车行驶能耗。 |
| ① 当前装卸 | `updateHandling()` | 推进唯一装卸坡道的计时，完成卸载或装载。 |
| ② 申请卸载 | `startNextUnload()` | 部署时按机器人列表依次申请坡道；全部卸载后转入作业。 |
| ③ Robot Agent | `updateRobot()` | 每台机器人依序执行与状态对应的决策和动作。 |
| ④ FIFO 补给 | `updateBay()` | 取得队首、占用唯一工位、资源转移、服务完成释放工位。 |
| ⑤ 申请装车 | `startNextLoad()` | 非部署阶段，按机器人列表寻找等待装车者。 |
| ⑥ 全员核对 | `step()` | 全部装车且坡道空闲后，检查地块完成或召回，再选择下一田块/返回基地。 |
| 不变量检查 | `checkInvariants()` | 资源上下界、三类资源守恒及可通行区域等。 |

这些更新共享一个时钟，`tick()` 的单步上界为 0.25 秒。逻辑上多个 Agent 在一场任务中协同，但源码中的更新是顺序进行的，不等于独立线程或 BT 并行节点。母车装卸坡道、补给工位和入口通道是三个彼此独立、容量各为 1 的资源；补给和装卸可以发生在不同机器人身上。

## Robot Agent 子树

`READY` 依次检查召回、保留/选择条带、出车资源、入口通道。条带任务为空时才调用 `chooseTask()`：普通模式比较合法接近路径长度，基准模式按序号轮流固定分配。条带补给期间保存 `owner` 与 `done`，因此服务结束回到 `READY` 后从相同断点续作。

`WORKING` 中判断顺序为：召回 → 演示故障注入 → 电量 → 物料/货箱 → 推进一步作业 → 检查条带完成。当前条件模型使用合法返航路径距离、恒定速度和功率。物料和货箱都预留 4 秒作业量；未声称地形、动力学和实机误差已经标定。

返航统一调用 `requestReturn()`，先挂起条带并记录原因；若处在集结点则直接排队或等待装车，否则申请通道再返航。`arrived()` 到站释放通道。最终返航且货箱为空时直接等待装车；采收任务最终返航若仍有货物，则先排队卸货，最终服务不再充电/补料。

## 有限状态机

机器人源码实际存在 **13 个**执行状态：

`ONBOARD`、`UNLOADING`、`READY`、`WAIT_CORRIDOR`、`TO_WORK`、`WORKING`、`WAIT_RETURN_CORRIDOR`、`RETURNING`、`WAIT_SERVICE`、`SERVICING`、`WAIT_LOAD`、`LOADING`、`FAULT`。

母车具有 **6 个**状态：

`TRANSIT_TO_FIELD`、`DEPLOYING`、`OPERATING`、`COLLECTING`、`TRANSIT_TO_DEPOT`、`AT_DEPOT`。

任务级 `RUNNING`、`WAITING_RECOVERY`、`FAILED`、`COMPLETED`、`CANCELLED` 另属任务生命周期，不应重复计入机器人或母车状态。

FSM 图中的箭头表示允许的条件转换，并非当前帧确实发生过的转换。当前状态使用绿色标记，用户选中查看的状态使用蓝色描边。完整边表包含来源方法与触发条件；人工召回统一走 `requestReturn()` 的位置/货箱/通道分支，设备故障以 `ANY → FAULT → PREVIOUS` 表示，避免把中断线重复画到每一状态造成遮挡。

当前采样场景可以没有触发召回、多田块切换或失败，但决策树保留对应分支说明。这些分支的存在来自核心源码，不声称已经在当前单田块回放中发生。

## 可视化接口与可访问性

依次加载 `assets/data/farm-decision-model.js`、`assets/farm-graphs.js` 和 `assets/farm-graphs.css`。

```js
const graphs = FarmGraphs.mount({ treeRoot, fsmRoot, inspectorRoot });
graphs.update(frame, 'robot_1');
graphs.setTreeMode('mission'); // 或 agent
graphs.setFsmMode('robot');    // 或 carrier
graphs.expandAll();
graphs.collapseAll();
```

树节点用原生按钮；展开按钮提供 `aria-expanded`。SVG 状态节点支持 Tab、Enter 和空格选择，具有可读标签。树与 FSM 在窄屏内部滚动。图使用本地 DOM/SVG，不依赖外部 CDN，也不发出网络控制命令。

## 本组件静态核验

对两个 JavaScript 文件执行 Node 语法检查，通过。对模型执行唯一 ID、状态边端点、引用的 Java 方法存在性及核心源文件 SHA-256 对照，通过。当前整体树为 27 个节点，Agent 树为 35 个节点；机器人转换表 27 条规则，母车转换表 8 条规则。故障转换采用通配中断规则，因此边表条数不等于所有展开后的状态对数量。

模型中 `sourceSha256` 对应：

`cc9d06ce3b3137706f43b3ab66b700d7576f530df9119c9add75d585efc65c99`

这些核验只说明模型结构和源码引用一致；最终网站的浏览器交互与响应式结果应读取网站整体验证报告。

可以在解压后运行以下命令复查，工具只使用 Node 标准库，不启动浏览器或服务器：

```sh
node tools/check_farm_graphs.cjs
```

工具生成 `reports/farm-graph-validation.json`。本版通过 6 组核验，包括脚本加载顺序、57 个页面元素 ID、回放 API、全部 6,017 帧以及 18,051 次选中机器人分支映射；其中 24 个故障/路阻展示帧未高亮持续执行动作。没有把相邻回放帧当作一条直接 FSM 边：某些瞬态在同一核心更新步内部完成，`WAIT_LOAD` 就可能立即进入 `LOADING`，完整事件记录保留其行动。
