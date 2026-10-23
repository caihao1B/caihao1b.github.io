'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const modes = {
    none: {code:'NONE', title:'正常覆盖任务跟踪', description:'未触发恢复条件时，保持原分段顺序，通过 Nav2 执行当前路径窗口。', action:'FollowPath · 动态场景以 MPPI 为主控制器。', ledger:'更新当前段与进度游标；不修改剩余任务语义。', source:'论文第 5 章，第 40–43 页。'},
    wait: {code:'A_WAIT', title:'短时干扰等待', description:'当短时预测与路径重叠证据支持等待时，执行短暂安全保持，观察障碍是否离开当前窗口。', action:'暂停当前运动并持续监测；条件解除后恢复窗口执行。', ledger:'保留当前段与未执行部分，等待状态不计入覆盖完成。', source:'论文第 5 章，第 44–50 页；图 5.3。'},
    yield: {code:'B_YIELD', title:'动态交互让行', description:'对于适合让行的动态交互，以速度受限的通行方式处理干扰，减少不必要的全任务中断。', action:'速度约束或安全覆盖层配合当前导航动作。', ledger:'在控制变化期间继续检查进度；让行本身不关闭残余任务。', source:'论文第 5 章，第 47–50 页。'},
    c1: {code:'C1_REJOIN', title:'同段局部绕行与重接', description:'在当前段的前方搜索可达重接点，候选需满足有效进度推进条件，随后继续执行同一覆盖段。', action:'构造局部绕行路径并 FollowPath；重接点仍属于当前段。', ledger:'被绕过的切片显式记录，后续清理或按规则审计，不能自动视为已覆盖。', source:'论文第 42 页图 5.2(a)，第 49–53 页。'},
    c2: {code:'C2_ORDERED_REJOIN', title:'下一覆盖段有序重接', description:'同段重接不可行或不合适时，访问下一段的入口或其前部有序锚点，限制恢复对任务顺序的破坏。', action:'按锚点接入的需要使用 NavigateToPose，随后恢复短路径跟踪。', ledger:'保存跳过区域的责任；移动到下一段并不意味着上一段全部完成。', source:'论文第 42–43 页图 5.2(b)，第 49–53 页。'},
    d1: {code:'D1 / PREFIX REORDER', title:'剩余覆盖段局部重排序', description:'根据区域状态，对当前 cluster 的有限剩余段前缀进行 beam search，比较候选执行顺序。几何段集合保持不变。', action:'局部段序替换；论文配置检查前 5 个剩余段，非 hard 情形要求至少 8% 的改进。', ledger:'保留段 ID 与剩余任务集合，使改序仍能逐段追踪。', source:'论文第 6 章，第 62–63 页。'},
    d2: {code:'D2 / GEOMETRY REPLACEMENT', title:'剩余区域覆盖几何替换', description:'区域状态达到更强修复的准入条件后，评估当前剩余段、几何对齐与网格对齐等候选。可改写区域内的剩余覆盖几何。', action:'评估并提交局部结构替换；D2 准入开启时可优先评估，不固定等待 D1 失败。', ledger:'只更新对应剩余区域，并将新计划重新接入监督执行与覆盖记账。', source:'论文第 6 章，第 61–65 页。'}
  };
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    const m = modes[button.dataset.mode];
    document.querySelectorAll('[data-mode]').forEach(b => {const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    for (const [id,key] of [['modeCode','code'],['modeTitle','title'],['modeDescription','description'],['modeAction','action'],['modeLedger','ledger'],['modeSource','source']]) $(id).textContent=m[key];
  }));

  const video=$('robotVideo');
  const chapterNotes={0:'场景全景与机器人移动记录。机械臂结构可在“机械臂交互”标签中查看。',120:'red_cube_1 的 placing、retreating_after_place 与后续退出日志。日志不是物理夹持的独立证明。',180:'red_cube_2 的 grasping 与 navigating_to_place 状态；源视频保留实际时间顺序。',240:'red_cube_2 放置及退离状态，随后继续转场。',300:'blue_cube_1 的任务日志，以及随后出现的导航稳定性检查。',355:'约 5:59 出现 task_failed：Navigation watchdog stopped motion: odom_pose_unstable。'};
  document.querySelectorAll('[data-seek]').forEach(button => button.addEventListener('click', () => {
    video.pause();
    const t=Number(button.dataset.seek);
    const seek=()=>{video.currentTime=Math.min(t,Number.isFinite(video.duration)?Math.max(0,video.duration-.05):t);};
    if(video.readyState>=1) seek(); else {video.addEventListener('loadedmetadata',seek,{once:true});video.load();}
    document.querySelectorAll('[data-seek]').forEach(b=>b.classList.toggle('active',b===button));
    $('chapterNote').textContent=chapterNotes[t]+' 已定位至对应章节并暂停，可通过播放器继续播放。';
  }));

  const flows={
    parse:{code:'TASK → PLAN',title:'任务解析与搬运序列构建',description:'控制器根据颜色、数量和目标放置区生成逐件 pick / place 序列，并发布任务与进度。任务解析结果与实际动作完成状态分别核验。',file:'03-task-controller.txt'},
    navpick:{code:'NAVIGATING_TO_PICK',title:'取物服务位导航',description:'发送 NavigateToPose 目标；本源码配置使用 AMCL、NavFn Dijkstra 与 DWB。目标来源于场景配置和模型信息，地图上的点是保存坐标，不是本次在线定位。',file:'04-navigation-configuration.txt',object:'red_cube_1'},
    grasp:{code:'GRASPING → ATTACHLINK',title:'预设关节轨迹与仿真附着',description:'张开夹爪、到达 pick_hover 和 pick_contact、请求 ATTACHLINK、关闭夹爪并抬到 carry；随后检查模型真值。附着服务与物理夹持验证需要区分。',file:'02-grasp-execution.txt',object:'red_cube_1'},
    navplace:{code:'NAVIGATING_TO_PLACE',title:'目标区域导航与物体携带',description:'保留当前搬运对象，并导航到对应放置服务位。任务状态与物体真值同时提供诊断依据；导航或位姿稳定性失败可终止任务。',file:'03-task-controller.txt',object:'zone_a'},
    place:{code:'PLACING → RETRACT → EXIT',title:'物体释放、机械臂回收与底盘退出',description:'到达 place_hover 与 place_release，打开夹爪、等待并请求 DETACHLINK，再收回机械臂并检查放置真值。底盘随后按配置执行退出导航或退离；直接速度退离在本快照默认关闭。',file:'02-grasp-execution.txt',object:'zone_a'},
    audit:{code:'MODEL_STATES → FINAL AUDIT',title:'仿真真值核验与完成审计',description:'真值桥发布 /competition/model_states，控制器检查物体是否仍在目标区域。当前源码会记录 final audit，但 all_truth_ok=false 并未自动阻断 _succeed() 的成功状态；因此必须一起查看审计结果。',file:'03-task-controller.txt',object:'zone_a'}
  };
  document.querySelectorAll('[data-flow]').forEach(button=>button.addEventListener('click',()=>{
    const f=flows[button.dataset.flow];
    document.querySelectorAll('[data-flow]').forEach(b=>{const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    $('flowCode').textContent=f.code;$('flowTitle').textContent=f.title;$('flowDescription').textContent=f.description;
    $('flowSource').href='assets/source/yzbot/'+f.file;
    if(f.object && $('sceneSelect')) {$('sceneSelect').value=f.object; $('sceneSelect').dispatchEvent(new Event('change'));}
  }));

  const scene=window.ROBOT_SCENE,canvas=$('sceneCanvas');
  if(!scene || !canvas) return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const select=$('sceneSelect');
  const entities=[{...scene.robotInitialPose,kind:'robot',label:'机器人默认起点'},...scene.objects.map(o=>({...o,kind:'object',label:o.id})),...scene.zones.map(o=>({...o,kind:'zone',label:'放置区 '+o.label}))];
  entities.forEach(o=>{const option=document.createElement('option');option.value=o.id;option.textContent=o.label;select.append(option);});
  select.value='zone_a';let scope='full',projection=null;
  const colors={red:'#ce6266',blue:'#3b85bc',zone_a:'#369a84',zone_b:'#c8a444',zone_c:'#479caa'};
  function selectInfo(){
    const e=entities.find(o=>o.id===select.value);
    const coords=`x=${e.x.toFixed(2)}, y=${e.y.toFixed(2)}, z=${e.z.toFixed(3)} m`;
    $('sceneDetail').textContent=e.kind==='robot'?`six_arm 默认生成点 · ${coords}（运行参数可覆盖）`:`${e.label} · ${coords}`;
  }
  function draw(){
    const rect=canvas.getBoundingClientRect(),w=Math.max(280,rect.width),h=Math.max(240,rect.height),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#f8fbfd';ctx.fillRect(0,0,w,h);
    const b=scope==='full'?scene.bounds:scene.operatingBounds;
    const pad=38,dx=b.maxX-b.minX+2,dy=b.maxY-b.minY+2,scale=Math.min((w-pad*2)/dx,(h-pad*2)/dy);
    const mx=(b.minX+b.maxX)/2,my=(b.minY+b.maxY)/2;
    const p=(x,y)=>[w/2+(x-mx)*scale,h/2-(y-my)*scale];projection={p,scale,w,h};
    ctx.save();ctx.beginPath();ctx.rect(pad-8,pad-8,w-2*pad+16,h-2*pad+16);ctx.clip();
    const step=scope==='full'?2:1;
    ctx.strokeStyle='#e7eef4';ctx.lineWidth=1;
    for(let x=Math.floor(b.minX)-1;x<=b.maxX+1;x++){if(x%step)continue;const a=p(x,b.minY-2),z=p(x,b.maxY+2);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...z);ctx.stroke();}
    for(let y=Math.floor(b.minY)-1;y<=b.maxY+1;y++){if(y%step)continue;const a=p(b.minX-2,y),z=p(b.maxX+2,y);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...z);ctx.stroke();}
    scene.obstacles.forEach(o=>{ctx.beginPath();o.polygon.forEach((v,i)=>{const a=p(...v);i?ctx.lineTo(...a):ctx.moveTo(...a);});ctx.closePath();ctx.fillStyle=o.kind==='wall'?'#58758c':'#a2b4c1';ctx.fill();});
    scene.zones.forEach(z=>{const q=p(z.x,z.y);ctx.save();ctx.translate(...q);ctx.rotate(-z.yaw);ctx.fillStyle=colors[z.id]+'66';ctx.strokeStyle=colors[z.id];ctx.lineWidth=1.5;ctx.fillRect(-z.size[0]*scale/2,-z.size[1]*scale/2,z.size[0]*scale,z.size[1]*scale);ctx.strokeRect(-z.size[0]*scale/2,-z.size[1]*scale/2,z.size[0]*scale,z.size[1]*scale);ctx.restore();ctx.fillStyle=colors[z.id];ctx.font='600 11px system-ui';ctx.fillText(z.label,q[0]+z.size[0]*scale/2+7,q[1]+4);});
    scene.objects.forEach(o=>{const q=p(o.x,o.y);ctx.fillStyle=colors[o.color];ctx.beginPath();ctx.arc(...q,Math.max(2.2,scale*.04),0,Math.PI*2);ctx.fill();});
    for(const [key,label] of [['red','红色方块 ×5'],['blue','蓝色方块 ×5']]){const group=scene.objects.filter(o=>o.color===key);const q=p(-1.7,group[0].y);ctx.font='10px system-ui';ctx.fillStyle=colors[key];ctx.fillText(label,q[0]+11,q[1]+(key==='red'?-8:12));}
    Object.entries(scene.pickStaging).forEach(([k,o])=>{const q=p(o.x,o.y);ctx.beginPath();ctx.arc(...q,3,0,Math.PI*2);ctx.strokeStyle=colors[k];ctx.lineWidth=1;ctx.stroke();});
    const r=p(scene.robotInitialPose.x,scene.robotInitialPose.y);ctx.save();ctx.translate(...r);ctx.fillStyle='#254f71';ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-5);ctx.lineTo(-3,0);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
    const selected=entities.find(o=>o.id===select.value),q=p(selected.x,selected.y);ctx.strokeStyle='#b37b28';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(...q,11,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
    ctx.font='10px ui-monospace,monospace';ctx.fillStyle='#6b879c';ctx.fillText('WORLD / m',16,20);ctx.textAlign='right';ctx.fillText(scope==='full'?'SOURCE WORLD STATE':'SOURCE WORLD STATE · DETAIL',w-16,20);ctx.textAlign='left';
    const bar=scope==='full'?5:2,xb=26,yb=h-22;ctx.strokeStyle='#617e94';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(xb,yb-3);ctx.lineTo(xb,yb+3);ctx.moveTo(xb,yb);ctx.lineTo(xb+bar*scale,yb);ctx.moveTo(xb+bar*scale,yb-3);ctx.lineTo(xb+bar*scale,yb+3);ctx.stroke();ctx.fillText(`${bar} m`,xb+bar*scale+8,yb+3);
    ctx.textAlign='right';ctx.fillText('静态配置 · 非导航轨迹',w-16,h-18);ctx.textAlign='left';
  }
  select.addEventListener('change',()=>{selectInfo();draw();});
  for(const [id,view] of [['mapFull','full'],['mapWork','work']]) $(id).addEventListener('click',()=>{scope=view;for(const [bid,bs] of [['mapFull','full'],['mapWork','work']]){$(bid).classList.toggle('active',bs===view);$(bid).setAttribute('aria-pressed',String(bs===view));}draw();});
  canvas.addEventListener('click',e=>{if(!projection)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,dist=22;entities.forEach(o=>{const q=projection.p(o.x,o.y),d=Math.hypot(q[0]-x,q[1]-y);if(d<dist){dist=d;best=o;}});if(best){select.value=best.id;selectInfo();draw();}});
  new ResizeObserver(draw).observe(canvas);selectInfo();draw();
})();
