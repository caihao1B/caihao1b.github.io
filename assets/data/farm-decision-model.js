/* Executable-core explanation model. No behavior-tree executor is implemented here. */
(function (global) {
  'use strict';
  function node(id, label, kind, summary, source, guard, action, children, match) {
    return {id:id,label:label,kind:kind,summary:summary,source:source,guard:guard,action:action,children:children||[],match:match||id};
  }
  var mission = node('mission','母车 + 作业机器人：完整任务调度','root','统一时钟 · 每个更新步不超过 0.25 秒','tick() / step()','status == RUNNING 才推进仿真时间','按源码中的次序更新运输、装卸、机器人、补给和回收。',[
    node('mission_gate','任务生命周期与恢复锁','guard','先确定本次快照能否继续推进','tick() / command() / resumeIfSafe()','任务状态、routeBlocked 和各机器人 FAULT','故障与路阻分别锁存；召回不清除锁。',[
      node('route_lock','道路阻断：等待显式清障','guard','WAITING_RECOVERY · clear_route','requestReturn() / command() / resumeIfSafe()','routeBlocked == true','冻结整个仿真时钟；清障后仍检查设备故障。'),
      node('fault_lock','设备故障：等待人工确认','guard','保存 previousState · clear_fault','fault() / command() / resumeIfSafe()','任意机器人 state == FAULT','保存故障前状态；确认后恢复该状态，且必须同时不存在路阻。'),
      node('failed','执行不可行或运行资源不足','terminal','FAILED：保留失败原因','fail() / checkInvariants()','能耗不可满足、补给耗尽、货舱满或守恒违例等','停止推进；不会将失败任务标记为完成。无效的初始参数另在构造期直接拒绝。'),
      node('terminal','任务终点判定','terminal','COMPLETED / CANCELLED','finishMission()','母车已到基地，且机器人全部在车上','普通任务还检查全部条带完成；召回返回 CANCELLED，允许覆盖未完成。')
    ]),
    node('carrier_transit','母车运输阶段','selector','只沿声明的道路图行驶','step() / moveCarrier()','carrierState 为 TRANSIT_TO_FIELD 或 TRANSIT_TO_DEPOT','扣除道路行驶能耗；车上机器人的位置随母车移动。',[
      node('to_field','携带机器人前往地块','action','TRANSIT_TO_FIELD → DEPLOYING','moveCarrier() / step()','沿 roadPath() 到达 staging','进入部署阶段；道路不连通时不会改用穿田直线。'),
      node('to_depot','全员回收后返回基地','action','TRANSIT_TO_DEPOT → AT_DEPOT','moveCarrier() / finishMission()','沿声明道路到达 depot','执行最终全员与完成判定。')
    ]),
    node('field_cycle','地块内协同：每步按顺序更新','sequence','实体在同一仿真时钟中交替更新','step()','母车处于 DEPLOYING / OPERATING / COLLECTING','以下 ①–⑥ 是源码中的更新顺序；并非多线程并发或 BT 并行节点。',[
      node('handling','① 推进当前装卸操作','resource','装卸坡道容量 = 1','updateHandling()','handlingRobot != null','按固定时长完成卸载或装载，释放坡道。',[
        node('unloading','卸载完成后进入 READY','action','UNLOADING → READY','updateHandling()','handlingRemaining ≤ 0 且 state == UNLOADING','onboard=false；机器人定位到 staging。'),
        node('loading','装载完成后进入 ONBOARD','action','LOADING → ONBOARD','updateHandling()','handlingRemaining ≤ 0 且 state == LOADING','onboard=true；机器人位置绑定母车。')
      ]),
      node('deploy','② 按机器人顺序申请卸载','sequence','DEPLOYING 时仅取一个坡道使用者','startNextUnload()','DEPLOYING 且 handlingRobot == null','依次找车上机器人；全部卸完转为 OPERATING；收到召回则转入 COLLECTING。'),
      node('agents','③ 更新每一个 Robot Agent','sequence','调度、作业、返航、等待','updateRobot()','按 robots 列表顺序，对未装车机器人更新','展开“Robot Agent 决策树”查看每个条件与行动。',[
        node('agent_assign','任务选择与出车检查','action','READY / WAIT_CORRIDOR','updateRobot() / chooseTask()','已有断点任务继续使用；否则寻找 PENDING 条带','正常策略按合法连接路径长度贪心选任务；保留条带 owner。'),
        node('agent_work','驶向断点并推进条带','action','TO_WORK / WORKING','moveRobot() / arrived() / updateRobot()','路径合法且资源阈值未触发','按速度推进位置；记录条带已完成米数及资源消耗。'),
        node('agent_return','保存断点并申请返航通道','resource','WAIT_RETURN_CORRIDOR / RETURNING','requestReturn() / startReturn()','低电、缺料、满货、召回或本人无待领任务','保留 task.done；申请容量为 1 的通道；到站后排队补给或装车。')
      ]),
      node('bay','④ FIFO 补给工位','resource','补给工位容量 = 1','updateBay()','工位空闲且 serviceQueue 非空，或已有 bayOwner','从队首取一台；充电、补料和卸货实际转移母车资源。',[
        node('bay_queue','按 FIFO 队列取得工位','guard','WAIT_SERVICE → SERVICING','enqueue() / updateBay()','bayOwner == null && !serviceQueue.isEmpty()','去重入队；等待期间累计排队时长和怠速能耗。'),
        node('bay_transfer','执行能量、物料和货物转移','action','SERVICING','updateBay()','当前机器人为 bayOwner','非最终回收时充电、非采收模式补料；所有模式都卸货。'),
        node('bay_release','完成后续作或等待装车','selector','READY / WAIT_LOAD','updateBay()','资源目标达到、货物清空、达到最短服务时间','finalReturn=false 保留断点并返回 READY；否则 WAIT_LOAD。')
      ]),
      node('collect','⑤ 申请装车坡道','resource','WAIT_LOAD → LOADING','startNextLoad()','非 DEPLOYING、handlingRobot 为空且存在 WAIT_LOAD','按机器人列表顺序占用坡道。补给工位和坡道是两个独立资源。'),
      node('depart_guard','⑥ 全员核对与下一段任务','guard','覆盖完成还不足以让母车离开','step()','allOnboard() && handlingRobot == null && 非 DEPLOYING','再检查全部条带完成或收到召回，然后决定下一田块或返仓。',[
        node('next_field','还有田块：进入下一地块','action','COLLECTING → TRANSIT_TO_FIELD','step()','未召回、当前田块完成且还有下一田块','更新 field，清理各机器人 finalReturn/task，沿道路前往下一站。'),
        node('return_depot','全部完成或召回：返基地','action','COLLECTING → TRANSIT_TO_DEPOT','step()','全员在车上，且没有下一田块或已召回','正常完成与召回取消在到达基地后分别判定。')
      ])
    ]),
    node('invariants','每步末尾检查系统不变量','guard','能量、物料、货物守恒与可通行区域','checkInvariants()','更新步未提前退出时检查','核对资源上下界、机器人编号、田内/入口位置和三条守恒账；失败进入 FAILED。')
  ]);
  var agent = node('agent_root','所选 Robot Agent：规则、状态与动作','root','状态决定执行阶段，条件决定下一步','updateRobot() / command()','读取本机器人的执行状态、资源、任务与通道占用','此树是规则的层次化解释；真实执行由 Java 有限状态机完成。',[
    node('robot_fault','全局故障中断','guard','任意状态 → FAULT → 故障前状态','fault() / command()','fault_robot 或演示中的设备故障触发','锁存 previousState，冻结整个任务；clear_fault 后还要检查 routeBlocked。'),
    node('robot_handling','已在车上或正在装卸','selector','ONBOARD / UNLOADING / LOADING','updateRobot() / updateHandling()','onboard 或状态为 LOADING / UNLOADING','机器人更新直接返回；装卸过程由母车处理器推进。'),
    node('ready','准备并决定下一段行动','sequence','READY','updateRobot()','state == READY','按召回、任务、出车资源、通道的先后次序检查。',[
      node('ready_recall','已收到召回：请求最终返航','guard','RECALL · finalReturn=true','updateRobot() / requestReturn()','recalled == true','当前条带挂起；返回后等待装车，必要时先卸货。'),
      node('task','保留断点任务，或领取新条带','selector','task == null 时才重新分配','chooseTask() / updateRobot()','READY 且未召回','对未分配条带按合法接近距离贪心选择；补给回来仍使用原任务。',[
        node('task_none','没有可领条带：本人结束作业','guard','WORK_COMPLETE · finalReturn=true','chooseTask() / requestReturn()','chooseTask() 返回 null','申请回收；其他机器人可能仍在完成已分配条带。'),
        node('task_select','选择距离最近的待领条带','action','PENDING → ASSIGNED','chooseTask()','正常策略；baseline 另用固定轮流分配','比较 pathInside()/fromStaging() 合法连接路径长度，记录 owner 和 TASK_ASSIGNED。')
      ]),
      node('precheck','按位置检查资源或连接下一条带','selector','集结点先查往返资源；田内直接连接','updateRobot()','当前任务已确定；根据 nearStaging(position) 选择分支','集结点需量 = 往返路径能耗 + reserve + max(0.02 kWh, 4 秒作业能耗)。超过满电容量则 FAILED；田内直接用合法路径连接。',[
        node('precheck_service','资源不足：先进入补给队列','action','READY → WAIT_SERVICE','enqueue()','在集结点，当前电量低于需量，或施用模式物料低于 min(容量,0.5 kg)','以 PRECHECK 原因入队，不先驶入田中。'),
        node('corridor_out','申请出站通道','resource','容量 = 1 · WAIT_CORRIDOR / TO_WORK','updateRobot() / startMove()','在集结点且资源检查通过；入口被其他机器人占用时等待','取得通道后沿 access_path 到达田内 anchor，释放通道，再前往断点。'),
        node('inside_move','已在田内：直接连接下一条带','action','READY → TO_WORK','pathInside() / startMove()','机器人位置不在 staging','按可通行多边形内的路径前往任务当前断点，无需再次占用入口。')
      ])
    ]),
    node('wait_out','等待出站通道','resource','WAIT_CORRIDOR','updateRobot()','corridorOwner != null','怠速扣电；通道释放后先回 READY，下个更新步重新检查。'),
    node('to_work','驶向条带当前断点','sequence','TO_WORK','updateRobot() / moveRobot() / arrived()','在田内先检查召回与低电，再推进位置','到达 task.current() 后进入 WORKING。',[
      node('transit_return','途中召回或余量不足','guard','RECALL / LOW_BATTERY','updateRobot()','机器人已在田内，且召回或 battery < returnEnergy + reserve + 0.003 kWh','保存当前条带进度并请求返航。'),
      node('reach_work','到达断点：开始或继续作业','action','TO_WORK → WORKING','arrived()','当前移动路径到达终点且 afterMove == WORK','将 task.state 设为 WORKING，并记录 WORK_START 与 offset_m。')
    ]),
    node('working','推进覆盖作业','sequence','WORKING · 每步消耗与产出','updateRobot()','state == WORKING','依次检查召回、演示故障、电量、物料/货箱；全部通过才推进条带。',[
      node('work_recall','召回优先于继续作业','guard','RECALL','updateRobot()','recalled == true','发起 finalReturn=true 的返航。'),
      node('work_fault_injection','故障场景的确定性触发点','guard','WORKING → FAULT','updateRobot() / fault()','scenario == robot_fault，尚未注入，且全队累计 workLength > 80 m','当前工作中的机器人进入 FAULT，保存前态并冻结全局时钟；等待显式 clear_fault。'),
      node('battery','返航能耗 + 储备 + 作业预测窗','guard','LOW_BATTERY','returnEnergy() / updateRobot()','battery ≤ E_return + reserve + workPower × 4 / 3600','E_return = 合法返航距离 / 行驶速度 × 行驶功率 / 3600。'),
      node('material','施用模式：剩余物料不足','guard','LOW_MATERIAL','updateRobot()','material < max(单位距离耗料 × 作业速度 × 4 秒, 本步耗料)','提前返航补料，避免在条带中途扣出负库存。'),
      node('cargo','采收模式：剩余货箱不足','guard','CARGO_FULL','updateRobot()','cargoCapacity − cargo < max(单位距离产量 × 作业速度 × 4 秒, 本步产量)','保存断点，返航将货物转入母车。'),
      node('work_step','执行本步作业并检查条带终点','action','WORKING → READY（条带完成）','updateRobot()','各资源条件通过','推进 min(workSpeed × dt, 剩余条带米数)，扣电/物料或增加货物；完成后释放 task 引用。')
    ]),
    node('return','统一返航与断点保存','sequence','保留条带 owner 和 task.done','requestReturn() / startReturn() / arrived()','发生资源返航、本人任务结束或召回','资源返航 finalReturn=false；任务结束/召回 finalReturn=true。',[
      node('save_breakpoint','挂起当前条带并保留米数','action','task.state = SUSPENDED','requestReturn()','r.task != null','记录 RETURN_REQUEST、返航原因、电量、估计返航能量和 offset_m。'),
      node('return_lock','路阻：冻结整场仿真','guard','WAITING_RECOVERY','requestReturn() / startReturn()','routeBlocked == true','等待 clear_route；它不会解除设备故障。'),
      node('wait_return','返航通道被占用：原地等待','resource','WAIT_RETURN_CORRIDOR','requestReturn() / updateRobot()','corridorOwner 属于另一机器人','怠速扣电；取得通道后再校验所需返航能量。'),
      node('return_move','持有通道并驶回集结点','action','RETURNING','startReturn() / moveRobot()','电量足够覆盖合法返航路径','占用通道至抵达 staging；不足则 FAILED，不忽略能量约束。'),
      node('return_route','到站后选择服务或装车','selector','WAIT_SERVICE / WAIT_LOAD','arrived() / enqueue()','机器人回到 staging 并释放通道','最终回收且货箱为空则直接 WAIT_LOAD；其他情况先排队服务。')
    ]),
    node('service','排队补给与断点续作','resource','WAIT_SERVICE / SERVICING','enqueue() / updateBay()','进入 FIFO 队列且工位容量为 1','按充电效率扣母车电量；补料扣母车库存；卸货增加母车货量。',[
      node('service_wait','等待服务：累计等待时间','action','WAIT_SERVICE','updateRobot()','尚未取得工位','记录全局和本机器人 queueWaitSeconds，并消耗怠速电量。'),
      node('service_run','取得工位并完成资源转移','action','SERVICING','updateBay()','当前机器人为 bayOwner','非最终回收补满电与施用物料，卸空货物，满足 serviceMinSeconds。'),
      node('resume','服务完成：从原条带断点续作','action','SERVICING → READY','updateBay() / arrived()','finalReturn == false','释放工位；保留任务与 task.done，在 READY 重新检查并前往断点。'),
      node('service_final','最终回收：卸空后等待装车','action','SERVICING → WAIT_LOAD','updateBay()','finalReturn == true','最终服务跳过充电/补料，但仍卸货；完成后等待坡道。')
    ]),
    node('wait_load','等待坡道、装车并绑定母车','resource','WAIT_LOAD → LOADING → ONBOARD','startNextLoad() / updateHandling()','非 DEPLOYING 且装卸坡道空闲','等待时扣除怠速能耗；按固定 loadSeconds 完成装车，设置 onboard=true；所有人装车后母车才可能离开。')
  ]);
  var robotStates = [
    ['ONBOARD','已在母车上','位置随母车同步；不独立更新行动。',110,60,'moveCarrier() / updateRobot()'],
    ['UNLOADING','卸载中','占用唯一装卸坡道，计时完成后到达集结点。',390,60,'startNextUnload() / updateHandling()'],
    ['READY','准备 / 分配任务','处理召回、条带分配、出车资源检查与通道申请。',670,60,'updateRobot() / chooseTask()'],
    ['LOADING','装车中','占用唯一装卸坡道，计时完成后 onboard=true。',110,180,'startNextLoad() / updateHandling()'],
    ['TO_WORK','前往断点','沿合法路径驶往任务当前断点，途中检查召回和电量。',390,180,'startMove() / moveRobot()'],
    ['WAIT_CORRIDOR','等待出站通道','等待他人释放入口，期间消耗怠速能量。',670,180,'updateRobot()'],
    ['WAIT_LOAD','等待装车','已回到母车；等待装卸坡道空闲。',110,300,'enqueue() / startNextLoad()'],
    ['WORKING','作业中','推进条带米数；按模式消耗物料或累积采收货物。',390,300,'updateRobot()'],
    ['WAIT_RETURN_CORRIDOR','等待返航通道','保留任务与断点，通道释放后才发起返航。',670,300,'requestReturn() / updateRobot()'],
    ['SERVICING','补给 / 卸货中','占用唯一补给工位，实际转移母车资源。',110,420,'updateBay()'],
    ['WAIT_SERVICE','等待补给','FIFO 去重队列，统计等待时间及怠速耗电。',390,420,'enqueue() / updateRobot()'],
    ['RETURNING','返航中','持有入口通道，回到集结点后释放。',670,420,'startReturn() / arrived()'],
    ['FAULT','故障锁存','从任意状态中断；clear_fault 恢复 previousState，且所有锁清除后才推进时间。',390,565,'fault() / command() / resumeIfSafe()']
  ].map(function(s){return{id:s[0],label:s[1],description:s[2],x:s[3],y:s[4],source:s[5]};});
  function edge(from,to,label,source,path,kind){return{from:from,to:to,label:label,source:source,path:path||null,kind:kind||'normal'};}
  var robotEdges=[
    edge('ONBOARD','UNLOADING','坡道空闲，按顺序卸载','startNextUnload()'),
    edge('UNLOADING','READY','卸载计时结束','updateHandling()'),
    edge('READY','WAIT_CORRIDOR','出站通道被其他机器人占用','updateRobot()'),
    edge('WAIT_CORRIDOR','READY','通道空闲，下步重新检查','updateRobot()','M 696 148 L 696 92'),
    edge('READY','TO_WORK','有任务、出车检查通过，或位于田内','updateRobot()','M 644 92 L 644 120 L 390 120 L 390 148'),
    edge('TO_WORK','WORKING','到达任务当前断点','arrived()'),
    edge('WORKING','READY','当前条带完成，释放 task','updateRobot()','M 490 285 L 550 285 L 550 42 L 570 42'),
    edge('READY','WAIT_SERVICE','集结点 PRECHECK 需补给','updateRobot() / enqueue()','M 770 78 L 792 78 L 792 475 L 390 475 L 390 452'),
    edge('WORKING','WAIT_RETURN_CORRIDOR','需要返航，但通道被占用','requestReturn()'),
    edge('TO_WORK','WAIT_RETURN_CORRIDOR','途中需返航，但通道被占用','requestReturn()','M 490 197 L 530 197 L 530 275 L 570 275'),
    edge('READY','WAIT_RETURN_CORRIDOR','任务结束或召回，但通道被占用','requestReturn()','M 770 50 L 784 50 L 784 278 L 770 278'),
    edge('WAIT_RETURN_CORRIDOR','RETURNING','通道可用、返航电量足够','updateRobot() / startReturn()'),
    edge('WORKING','RETURNING','资源触发或召回，通道可用','requestReturn()','M 490 317 L 530 317 L 530 400 L 570 400'),
    edge('TO_WORK','RETURNING','途中召回或低电，通道可用','requestReturn()','M 490 164 L 545 164 L 545 382 L 650 382 L 650 388'),
    edge('READY','RETURNING','本人无待领任务或召回，通道可用','requestReturn()','M 770 65 L 798 65 L 798 420 L 770 420'),
    edge('RETURNING','WAIT_SERVICE','回到集结点，需补给或卸货','arrived() / enqueue()'),
    edge('RETURNING','WAIT_LOAD','最终回收且货箱已空','arrived() / enqueue()','M 650 452 L 650 490 L 10 490 L 10 300 L 10 300'),
    edge('WAIT_SERVICE','SERVICING','工位空闲，取得 FIFO 队首','updateBay()'),
    edge('SERVICING','READY','非最终回收，资源转移完成','updateBay()','M 110 452 L 110 510 L 812 510 L 812 20 L 670 20 L 670 28'),
    edge('SERVICING','WAIT_LOAD','最终回收，货物卸空','updateBay()'),
    edge('WAIT_LOAD','LOADING','非部署阶段且坡道空闲','startNextLoad()'),
    edge('LOADING','ONBOARD','装车计时结束','updateHandling()'),
    edge('READY','WAIT_LOAD','在集结点直接最终回收且无货物','requestReturn() / enqueue()','M 570 78 L 540 78 L 540 250 L 85 250 L 85 268','exception'),
    edge('WAIT_CORRIDOR','WAIT_LOAD','人工召回：仍在集结点且货箱为空','command() / requestReturn()','M 570 198 L 555 198 L 555 245 L 70 245 L 70 268','exception'),
    edge('TO_WORK','WAIT_LOAD','人工召回恰在起步前的集结点，且货箱为空','command() / requestReturn()','M 290 198 L 250 198 L 250 300 L 210 300','exception'),
    edge('ANY','FAULT','显式 fault_robot；演示可从 WORKING 注入','fault() / command()',null,'interrupt'),
    edge('FAULT','PREVIOUS','clear_fault：恢复故障前状态；检查其他恢复锁','command() / resumeIfSafe()',null,'interrupt')
  ];
  var carrierStates=[
    ['TRANSIT_TO_FIELD','驶向地块',150,65,'沿声明道路携带车上机器人前往 staging。','moveCarrier() / step()'],
    ['DEPLOYING','部署机器人',490,65,'使用容量为 1 的坡道逐一卸载。','startNextUnload() / updateHandling()'],
    ['OPERATING','地块作业',490,220,'推进机器人行动、补给队列及已返航机器人的装载。','step() / updateRobot() / updateBay()'],
    ['COLLECTING','回收机器人',490,375,'回收阶段仍遵循独立坡道和补给工位；要求全员装车。','enqueue() / startNextLoad()'],
    ['TRANSIT_TO_DEPOT','驶回基地',150,375,'所有机器人都在车上后沿声明道路返回。','step() / moveCarrier()'],
    ['AT_DEPOT','到达基地',150,220,'检查全员在车上；正常任务还检查所有条带完成。','finishMission()']
  ].map(function(s){return{id:s[0],label:s[1],x:s[2],y:s[3],description:s[4],source:s[5]};});
  var carrierEdges=[
    edge('TRANSIT_TO_FIELD','DEPLOYING','到达 staging','step()'),
    edge('DEPLOYING','OPERATING','所有机器人已卸载','startNextUnload()'),
    edge('DEPLOYING','COLLECTING','部署期间收到召回','startNextUnload()','M 590 65 L 625 65 L 625 375 L 590 375','exception'),
    edge('OPERATING','COLLECTING','最终回收且田块完成，或已召回','enqueue() / updateBay()'),
    edge('COLLECTING','TRANSIT_TO_DEPOT','全员在车上、坡道空闲且完成/召回','step()'),
    edge('COLLECTING','TRANSIT_TO_FIELD','全员在车上，未召回且还有田块','step()','M 490 407 L 490 460 L 20 460 L 20 65 L 50 65'),
    edge('TRANSIT_TO_DEPOT','AT_DEPOT','到达 depot 并进行最终核对','step() / finishMission()'),
    edge('TRANSIT_TO_FIELD','TRANSIT_TO_DEPOT','运输途中召回，所有机器人仍在车上','command()','M 50 80 L 35 80 L 35 375 L 50 375','exception')
  ];
  global.FarmDecisionModel={schemaVersion:1,sourceSha256:"cc9d06ce3b3137706f43b3ab66b700d7576f530df9119c9add75d585efc65c99",title:'Farm Carrier：Java 调度规则与状态机映射',implementation:'Deterministic Java rules + finite-state machines. Trees are explanatory views, not executable behavior trees.',source:'src/main/java/farm/sim/MissionEngine.java',mission:mission,agent:agent,robot:{states:robotStates,edges:robotEdges},carrier:{states:carrierStates,edges:carrierEdges},notes:[
    '高亮仅表示快照对应的持续状态或已记录返航原因，不代表真实 BT tick、SUCCESS/FAILURE/RUNNING 返回值。',
    '主循环按固定顺序更新，各实体共享仿真时钟；坡道、补给工位、入口通道各自容量为 1。',
    '条件视图包含正常采样场景中未触发的路径，例如召回、下一田块与失败；可点击节点查看。',
    'requestReturn() 有按当前位置和占用条件分支的组合转换；节点详情与完整边表为准。',
    'Robot 有 13 个执行状态；任务级 WAITING_RECOVERY 和 FAILED 不算作机器人状态。'
  ]};
})(window);
