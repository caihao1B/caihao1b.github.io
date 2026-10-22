(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const colors = {robot_1:'#2987af',robot_2:'#b77936',robot_3:'#7963ae',carrier:'#193b5c'};
  const robotNames = {robot_1:'R01',robot_2:'R02',robot_3:'R03',carrier:'母车',system:'系统',operator:'操作员'};
  const states = {ONBOARD:'车上随行',UNLOADING:'正在卸载',READY:'准备 / 申请任务',WAIT_CORRIDOR:'等待入田通道',TO_WORK:'驶向作业断点',WORKING:'执行覆盖条带',WAIT_RETURN_CORRIDOR:'等待返航通道',RETURNING:'沿合法路径返航',WAIT_SERVICE:'排队等待补给',SERVICING:'充电 / 补料 / 卸货',WAIT_LOAD:'等待装车',LOADING:'正在装车',FAULT:'设备故障',TRANSIT_TO_FIELD:'运输机器人到田块',DEPLOYING:'依次卸载机器人',OPERATING:'支持田间作业',COLLECTING:'回收机器人',TRANSIT_TO_DEPOT:'全员返仓',AT_DEPOT:'已回到基地'};
  const eventNames = {STRIP_COMPLETE:'条带执行完成',RETURN_ARRIVAL:'到达母车，申请服务或装车',FIELD_COMPLETE:'田块计划完成，全员已回收',MISSION_START:'母车携带机器人出发',FIELD_ARRIVAL:'抵达地块集结点',UNLOAD_START:'取得坡道，开始卸载',UNLOAD_DONE:'卸载结束，准备执行',TASK_ASSIGNED:'领取覆盖条带',WORK_START:'到达条带，开始或恢复作业',STRIP_DONE:'条带执行完成',TASK_DONE:'条带执行完成',RETURN_REQUEST:'保存断点，申请返航',SERVICE_QUEUE:'进入补给队列',SERVICE_START:'取得工位，开始资源服务',SERVICE_DONE:'资源服务完成',LOAD_START:'取得坡道，开始装车',LOAD_DONE:'装车完成',RETURN_TO_DEPOT:'全员已装车，母车返回基地',MISSION_COMPLETE:'任务完成，全队回到基地',ROBOT_FAULT:'设备故障，冻结任务时钟',FAULT_CLEARED:'操作员确认清除设备故障',ROUTE_BLOCKED:'通道阻塞，等待恢复',ROUTE_CLEARED:'操作员确认解除道路阻塞',WAITING_RECOVERY:'任务暂停，等待外部恢复',RESUMED:'恢复锁解除，继续执行',CORRIDOR_ACQUIRED:'取得入口通道',CORRIDOR_RELEASED:'释放入口通道'};
  const stateExplanations = {ONBOARD:'机器人随母车移动。到达集结点后，需要依次获得装卸坡道才能下车。',UNLOADING:'坡道由这台机器人独占。卸载计时结束后进入 READY。',READY:'保留未完成条带，或按可行连接距离领取下一条带；出发前检查资源。',WAIT_CORRIDOR:'已经确定任务，等待容量为 1 的入口通道释放。',TO_WORK:'沿田内合法路径前往已保存的条带断点，当前尚未执行作业。',WORKING:'沿当前条带推进，同时扣除资源；检查返航路径能耗和 4 秒预测余量。',WAIT_RETURN_CORRIDOR:'已记录条带断点，等待返回通道。任务所有权继续保留。',RETURNING:'沿合法路径返回母车。当前条带仍保留断点，不会被当作已完成。',WAIT_SERVICE:'已到母车附近，按 FIFO 顺序等待容量为 1 的服务工位。',SERVICING:'从母车转移电量与物料，或将货物卸入母车；各项资源实际记账。',WAIT_LOAD:'当前不再出勤，等待装卸坡道可用。',LOADING:'占用装卸坡道，将机器人装回母车。',FAULT:'设备故障阻止任务推进。需要外部明确复位，再恢复故障前状态。'};
  const reasonNames = {LOW_BATTERY:'电量接近返航预算',LOW_MATERIAL:'物料不足',MATERIAL:'物料不足',FULL_CARGO:'货箱接近满载',CARGO_FULL:'货箱接近满载',COMPLETED:'任务完成',FINISHED:'任务完成',NO_TASK:'无剩余任务',RECALL:'收到召回命令',FIELD_COMPLETE:'田块任务完成',low_battery:'电量接近返航预算',material:'物料不足',cargo:'货箱接近满载'};
  const safe = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n,d=1) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const clock = n => {const t=Math.max(0,Math.floor(n));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
  const shortTask = id => id ? 'S'+String(Number(id.split('_').pop())+1).padStart(2,'0') : '—';
  const robotName = id => robotNames[id] || id || '空闲';
  function reasonText(value) {
    if (!value) return '—';
    if (reasonNames[value]) return reasonNames[value];
    if (/energy|battery/i.test(value)) return '电量接近返航预算';
    if (/material/i.test(value)) return '物料不足';
    if (/cargo|harvest|full/i.test(value)) return '货箱接近满载';
    if (/complete|finish|no.*task/i.test(value)) return '任务完成';
    if (/recall/i.test(value)) return '收到召回命令';
    return value;
  }
  if (!window.FarmReplay || !window.FarmGraphs) {
    const box=$('farmLoadError');box.hidden=false;box.textContent='运行记录或图组件未能载入。请完整解压网站包，保留 assets 目录后重新打开；也可以运行 START_PREVIEW.cmd。';return;
  }
  const data=window.FarmReplay;
  const graph=window.FarmGraphs.mount({treeRoot:$('farmTree'),fsmRoot:$('farmFsm'),inspectorRoot:$('farmInspector')});
  const canvas=$('farmMap'),ctx=canvas.getContext('2d');
  let scenario='normal',selected='robot_1',playing=false,head=0,duration=0,frame=null,frames=[],events=[],chapters=[];
  let lastIndex=-1,lastEventKey='',lastTimestamp=0,animationId=0,zoom=1,panX=0,panY=0,drag=null,screenRobots=[];
  let canvasWidth=700,canvasHeight=480,transform={k:1,cx:0,cy:0};
  const allTrailPoints={};
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setPlaying(value) {
    playing=Boolean(value);
    $('replayPlay').textContent=playing?'暂停':'播放';
    $('replayPlay').setAttribute('aria-label',playing?'暂停回放':'播放回放');
    lastTimestamp=0;
    if (playing) schedule();
  }
  function schedule() {if (!animationId) animationId=requestAnimationFrame(tick);}
  function tick(ts) {
    animationId=0;
    if (!playing) return;
    if (lastTimestamp) head=Math.min(duration,head+Math.min((ts-lastTimestamp)/1000,.15)*Number($('farmSpeed').value));
    lastTimestamp=ts;
    render(false);
    if(head>=duration) setPlaying(false);else schedule();
  }
  function seek(time, pause=true) {
    if(pause) setPlaying(false);
    head=Math.min(duration,Math.max(0,Number(time)||0));
    render(true);
  }
  function selectRobot(id) {
    if(!colors[id] || id==='carrier') return;
    selected=id;
    document.querySelectorAll('[data-robot]').forEach(b=>{const on=b.dataset.robot===id;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    lastEventKey='';render(true);
  }
  function loadScenario(id) {
    if(!data.getScenario(id)) return;
    setPlaying(false);scenario=id;$('farmScenario').value=id;
    const meta=data.getScenario(id);duration=meta.duration;
    frames=data.getFrames(id);events=data.getEvents(id);chapters=data.getChapters(id).slice();
    const resume=events.find(e=>e.type==='WORK_START' && Number(e.details?.offset_m)>0);
    if(resume)chapters.push({...resume,label:'断点续作'});
    chapters.sort((a,b)=>a.replayTime-b.replayTime);
    ['carrier','robot_1','robot_2','robot_3'].forEach(a=>allTrailPoints[a]=[]);
    frames.forEach(f=>{allTrailPoints.carrier.push({time:f.replayTime,x:f.carrier.x,y:f.carrier.y,onboard:false});f.robots.forEach(r=>allTrailPoints[r.id].push({time:f.replayTime,x:r.x,y:r.y,onboard:r.onboard}));});
    buildChapters();lastIndex=-1;lastEventKey='';
    const interest=chapters.find(c=>['ROBOT_FAULT','ROUTE_BLOCKED','WAITING_RECOVERY'].includes(c.type));
    if(interest){head=interest.replayTime;if(interest.actor.startsWith('robot_')) selected=interest.actor;}
    else head=0;
    $('farmTimeline').max=duration;$('farmTimeline').disabled=false;$('replayPlay').disabled=false;$('replayReset').disabled=false;
    selectRobot(selected);render(true);
  }
  function buildChapters() {
    const box=$('farmChapters');box.replaceChildren();
    const filtered=chapters.filter(c=>c.type!=='FIELD_ARRIVAL'&&c.type!=='RETURN_TO_DEPOT');
    filtered.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML='<span>'+String(i+1).padStart(2,'0')+'</span>'+safe(c.label);b.title=clock(c.time)+' · '+c.type;b.dataset.time=String(c.replayTime);b.addEventListener('click',()=>{if(c.actor?.startsWith('robot_'))selectRobot(c.actor);seek(c.replayTime);});box.appendChild(b);});
  }
  function displayPosition(actor, nextActor, alpha) {
    // States and decisions stay at the recorded frame. Only positions interpolate.
    if (!nextActor || alpha<=0) return [actor.x,actor.y];
    if(typeof actor.onboard==='boolean' && actor.onboard!==nextActor.onboard) return [actor.x,actor.y];
    if(actor.id==='carrier') return [actor.x,actor.y]; // Preserve exact sampled road positions without cutting corners.
    return [actor.x+(nextActor.x-actor.x)*alpha,actor.y+(nextActor.y-actor.y)*alpha];
  }
  function render(force) {
    frame=data.getFrameAtTime(scenario,head);
    if(!frame) return;
    const changed=force||frame.index!==lastIndex;
    if(changed){updatePanels();graph.update(frame,selected);updateEvents();lastIndex=frame.index;}
    $('farmTimeline').value=head;
    $('farmTime').textContent=clock(frame.time)+' / '+clock(data.getScenario(scenario).simulationDuration ?? data.getScenario(scenario).metrics.totalTimeSeconds);
    if(frame.status==='WAITING_RECOVERY') $('farmTime').textContent=clock(frame.time)+' · 等待恢复';
    drawMap();
  }
  function updatePanels() {
    const robot=frame.robots.find(r=>r.id===selected),carrier=frame.carrier;
    const task=frame.coverage.strips.find(s=>s.id===robot.task);
    const terminal=frame.status==='COMPLETED';
    $('missionStatus').textContent=terminal?'任务已完成':frame.status==='WAITING_RECOVERY'?'等待外部恢复':'任务执行中';
    $('missionDot').style.background=frame.status==='WAITING_RECOVERY'?'#bb8a3e':'#478778';
    $('scenarioNote').textContent=$('farmScenario').selectedOptions[0].textContent;
    $('agentName').textContent='Robot '+selected.slice(-1).padStart(2,'0');
    $('agentOnboard').textContent=robot.onboard?'车上':'车外';
    $('agentState').innerHTML=safe(robot.state)+'<small>'+safe(states[robot.state])+'</small>';
    $('agentState').style.color=colors[selected];
    for(const [key,cap,unit] of [['battery','batteryKWh','kWh'],['material','materialKg','kg'],['cargo','cargoKg','kg']]){
      $(key+'Value').textContent=fmt(robot[key],0)+'% · '+fmt(robot[cap],key==='battery'?2:1)+' '+unit;
      $(key+'Meter').value=robot[key];$(key+'Meter').classList.toggle('low',key==='battery'&&robot[key]<25);
    }
    $('agentTask').textContent=shortTask(robot.task)+(task?' · '+fmt(task.total,1)+' m':'');
    $('agentBreakpoint').textContent=robot.breakpointM==null?'—':fmt(robot.breakpointM,1)+' m';
    $('agentReason').textContent=reasonText(robot.returnReason);
    $('agentPosition').textContent=fmt(robot.x,1)+', '+fmt(robot.y,1)+' m';
    $('agentExplain').textContent=(frame.status==='WAITING_RECOVERY'?'状态保持，动作暂不推进。恢复锁解除后：':'')+(stateExplanations[robot.state]||'');
    $('coverageValue').textContent=fmt(frame.coverage.fraction*100,1)+'%';
    $('coverageMeter').value=frame.coverage.fraction;
    $('coverageLength').textContent=fmt(frame.coverage.completed,2)+' / '+fmt(frame.coverage.total,2)+' m';
    $('carrierState').textContent=states[carrier.state]||carrier.state;
    $('carrierOnboard').textContent='车上 '+carrier.onboard.length+' / '+frame.robots.length+' 台 · '+fmt(carrier.batteryKWh,1)+' kWh';
    $('corridorOwner').textContent=frame.routeBlocked?'阻塞 / 恢复锁':robotName(frame.corridorOwner);
    $('serviceOwner').textContent=robotName(frame.bayOwner)+(frame.queue.length?' · 排队 '+frame.queue.map(robotName).join('、'):'');
    $('rampOwner').textContent=robotName(carrier.handlingRobot);
    let decision='执行当前动作',detail=states[robot.state];
    if(frame.status==='WAITING_RECOVERY'){decision='恢复锁优先';detail='冻结时钟，等待显式复位';}
    else if(terminal){decision='终点条件已满足';detail='计划条带完成 + 全员回到基地';}
    else if(robot.state==='WORKING'){decision='持续检查资源';detail='返航能耗 + 4 秒作业预测';}
    else if(['RETURNING','WAIT_RETURN_CORRIDOR'].includes(robot.state)){decision='保留断点并返航';detail=reasonText(robot.returnReason);}
    else if(['WAIT_SERVICE','SERVICING'].includes(robot.state)){decision='FIFO 服务与资源守恒';detail='母车库存转移，完成后续作';}
    else if(['WAIT_LOAD','LOADING'].includes(robot.state)){decision='申请装卸坡道';detail='全部装车之前母车保持等待';}
    else if(robot.state==='READY'){decision='资源可行后领取任务';detail='优先保留条带，否则选择较近任务';}
    $('decisionNow').textContent=decision;$('decisionDetail').textContent=detail;
    const context=scenario.toUpperCase()+' · '+robotName(selected)+' · '+clock(frame.time);
    $('treeContext').textContent=context;$('fsmClock').textContent=clock(frame.time)+' · '+robotName(selected)+' · '+robot.state;
    $('fsmSelected').textContent='当前选择 '+robotName(selected);
    $('farmMap').dataset.frame=String(frame.index);$('farmMap').dataset.scenario=scenario;
    $('recoveryNote').hidden=frame.status!=='WAITING_RECOVERY';
    $('recoveryText').textContent=frame.routeBlocked?'道路锁保持，等待明确的 clear_route 命令。':'设备故障锁保持，等待明确的 clear_fault 命令。';
    const buttons=[...$('farmChapters').querySelectorAll('button')];
    const active=buttons.filter(b=>Number(b.dataset.time)<=head+.001).pop();
    buttons.forEach(b=>{b.classList.toggle('active',b===active);if(b===active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  }
  function translatedEvent(e) {
    let text=eventNames[e.type] || e.message;
    if(e.details?.task)text+=' · '+shortTask(e.details.task);
    if(e.details?.offset_m!=null)text+=' · 断点 '+fmt(e.details.offset_m,1)+' m';
    if(e.details?.reason)text+=' · '+reasonText(e.details.reason);
    if(['FAULT_CLEARED','ROUTE_CLEARED'].includes(e.type))text+='（生成脚本模拟操作员确认）';
    return text;
  }
  function updateEvents() {
    const filtered=$('filterAgentEvents').checked;
    const key=[scenario,frame.eventIndex,filtered,selected].join(':');
    if(key===lastEventKey)return;lastEventKey=key;
    const visible=events.slice(0,frame.eventIndex).filter(e=>!filtered||e.actor===selected).slice(-14).reverse();
    const box=$('farmEvents');box.replaceChildren();
    if(!visible.length){const p=document.createElement('p');p.className='farm-event-empty';p.textContent='这个时刻之前还没有符合筛选条件的事件。';box.appendChild(p);return;}
    visible.forEach(e=>{const b=document.createElement('button');b.className='farm-event-row';b.type='button';b.title=e.type+' · '+e.message;b.innerHTML='<time>'+clock(e.time)+'</time><strong>'+safe(robotName(e.actor))+'</strong><p>'+safe(translatedEvent(e))+'</p>';b.addEventListener('click',()=>{if(e.actor?.startsWith('robot_'))selectRobot(e.actor);seek(e.replayTime);});box.appendChild(b);});
  }
  function dimensions() {
    const rect=canvas.getBoundingClientRect();canvasWidth=rect.width||700;canvasHeight=rect.height||480;
    const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(canvasWidth*dpr);canvas.height=Math.round(canvasHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function point(p) {return [transform.cx+(p[0]-200)*transform.k,transform.cy-(p[1]+170)*transform.k];}
  function path(points,stroke,width=1,fill=null,dash=[]) {
    if(!points?.length)return;ctx.beginPath();points.forEach((p,i)=>{const q=point(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  }
  function label(text,x,y,align='left',color='#5b7a89',background=true) {
    ctx.font='10px "Segoe UI", "Microsoft YaHei", sans-serif';ctx.textAlign=align;
    const width=ctx.measureText(text).width;
    if(background){ctx.fillStyle='#f8fafbe8';const left=align==='right'?x-width-4:align==='center'?x-width/2-4:x-4;ctx.fillRect(left,y-11,width+8,17);}
    ctx.fillStyle=color;ctx.fillText(text,x,y);
  }
  function drawMap() {
    if(!frame)return;
    const w=canvasWidth,h=canvasHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#f8fafb';ctx.fillRect(0,0,w,h);
    transform={k:Math.min((w-45)/570,(h-50)/480)*zoom,cx:w/2+panX,cy:h/2+panY};
    const k=transform.k,field=data.map.fields[0];
    ctx.save();
    for(let x=-100;x<=550;x+=50)path([[x,-450],[x,100]],'#e8eff2',.6);
    for(let y=-450;y<=100;y+=50)path([[-100,y],[550,y]],'#e8eff2',.6);
    path(field.polygon,'#86ab9a',1.5,'#eef4ee');
    data.map.roads.forEach(road=>{path(road.points,'#ddceb5',Math.max(4,road.width_m*k));path(road.points,'#b6a487',1,null,[3,3]);});
    path(field.access_corridor,frame.routeBlocked?'#bd8054':'#9dbeae',1,frame.routeBlocked?'#ecd5c7':'#dce9df');
    if($('showStrips').checked){
      frame.coverage.strips.forEach(s=>{
        path([s.start,s.end],'#ccdacf',.8);
        if(s.completed>0){const p=Math.min(1,s.completed/s.total),end=[s.start[0]+(s.end[0]-s.start[0])*p,s.start[1]+(s.end[1]-s.start[1])*p];path([s.start,end],s.state==='COMPLETED'?'#87b49b':colors[s.owner]||'#7ea78d',s.owner===selected&&s.state!=='COMPLETED'?3:1.8);}
        if(s.owner===selected&&s.state!=='COMPLETED')path([s.start,s.end],colors[selected]+'90',1.1,null,[3,4]);
      });
    }
    if($('showTrails').checked){
      ['robot_1','robot_2','robot_3'].forEach(id=>{
        const pts=allTrailPoints[id].filter(p=>p.time<=head&&p.time>=head-220&&!p.onboard).map(p=>[p.x,p.y]);
        path(pts,colors[id]+'65',id===selected?2.3:1.2);
      });
      const r=frame.robots.find(a=>a.id===selected);
      if(['TO_WORK','RETURNING'].includes(r.state))path(r.activePath,colors[selected]+'a0',1.4,null,[5,4]);
    }
    const depot=point(data.map.depot),staging=point(field.staging),entry=point(field.entry);
    ctx.strokeStyle='#617e92';ctx.lineWidth=1.4;ctx.fillStyle='#f8fafb';ctx.fillRect(depot[0]-5,depot[1]-4,10,8);ctx.strokeRect(depot[0]-5,depot[1]-4,10,8);
    field.entrances.forEach((p,i)=>{const q=point(p);ctx.beginPath();ctx.arc(q[0],q[1],3.4,0,2*Math.PI);ctx.fillStyle=i===0?'#659983':'#b6c9bf';ctx.fill();});
    if($('showLabels').checked){
      label('演示基地',depot[0]-9,depot[1]-11,'left');
      label('集结 / 补给点',staging[0]+16,staging[1]-15);
      label('入口',entry[0]-9,entry[1]+22,'right');
      const q=point([257,-197]);label('FELD 13',q[0],q[1],'center','#7b9b89',false);label('12.39 ha',q[0],q[1]+17,'center','#99afa2',false);
    }
    const next=frames[Math.min(frame.index+1,frames.length-1)],span=next.replayTime-frame.replayTime;
    const alpha=span>0?Math.max(0,Math.min(1,(head-frame.replayTime)/span)):0;
    const cp=point(displayPosition(frame.carrier,next.carrier,alpha));
    ctx.fillStyle='#193b5c';ctx.beginPath();ctx.roundRect(cp[0]-10,cp[1]-6,20,12,2);ctx.fill();ctx.fillStyle='#8cb1c5';ctx.fillRect(cp[0]+4,cp[1]-4,4,8);ctx.fillStyle='#193b5c';[-6,6].forEach(x=>{ctx.fillRect(cp[0]+x-2,cp[1]-8,4,3);ctx.fillRect(cp[0]+x-2,cp[1]+5,4,3);});
    if($('showLabels').checked)label('母车 · '+frame.carrier.onboard.length+' 台在车上',cp[0]+17,cp[1]+15,'left','#274e68');
    screenRobots=[];
    frame.robots.forEach((r,i)=>{
      if(r.onboard)return;
      const q=point(displayPosition(r,next.robots[i],alpha));
      // A display-only small radial offset separates co-located service agents.
      const near=frame.robots.filter(a=>!a.onboard&&Math.hypot(a.x-r.x,a.y-r.y)<.05);
      const offset=near.length>1?near.findIndex(a=>a.id===r.id)-(near.length-1)/2:0;
      const x=q[0]+offset*14,y=q[1];
      if(r.id===selected){ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fillStyle=colors[r.id]+'20';ctx.fill();ctx.strokeStyle=colors[r.id]+'80';ctx.lineWidth=1;ctx.stroke();}
      ctx.beginPath();ctx.arc(x,y,6.3,0,Math.PI*2);ctx.fillStyle=r.state==='FAULT'?'#be6251':colors[r.id];ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=1.8;ctx.stroke();
      ctx.fillStyle='white';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.fillText(String(i+1),x,y+2.5);
      if($('showLabels').checked)label(robotName(r.id),x+11,y-8,'left',colors[r.id]);
      screenRobots.push({id:r.id,x,y});
    });
    ctx.restore();
    // Scale bar and north arrow remain in screen coordinates.
    const metres=k*100<w*.35?100:50,len=metres*k;
    ctx.strokeStyle='#7893a2';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(w-22-len,h-28);ctx.lineTo(w-22,h-28);ctx.moveTo(w-22-len,h-31);ctx.lineTo(w-22-len,h-25);ctx.moveTo(w-22,h-31);ctx.lineTo(w-22,h-25);ctx.stroke();label(metres+' m',w-22-len/2,h-34,'center','#7a939f');
    ctx.fillStyle='#7f98a6';ctx.beginPath();ctx.moveTo(w-25,20);ctx.lineTo(w-29,31);ctx.lineTo(w-21,31);ctx.closePath();ctx.fill();label('N',w-25,43,'center','#7f98a6',false);
  }
  function download(name,obj) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('replayPlay').addEventListener('click',()=>{if(head>=duration)seek(0);setPlaying(!playing);});
  $('replayReset').addEventListener('click',()=>seek(0));
  $('farmTimeline').addEventListener('input',e=>seek(e.target.value));
  $('farmScenario').addEventListener('change',e=>loadScenario(e.target.value));
  $('filterAgentEvents').addEventListener('change',updateEvents);
  document.querySelectorAll('[data-robot]').forEach(b=>b.addEventListener('click',()=>selectRobot(b.dataset.robot)));
  document.querySelectorAll('[data-tree-mode]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tree-mode]').forEach(a=>{a.classList.toggle('active',a===b);a.setAttribute('aria-pressed',String(a===b));});graph.setTreeMode(b.dataset.treeMode);graph.update(frame,selected);}));
  document.querySelectorAll('[data-fsm-mode]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-fsm-mode]').forEach(a=>{a.classList.toggle('active',a===b);a.setAttribute('aria-pressed',String(a===b));});graph.setFsmMode(b.dataset.fsmMode);graph.update(frame,selected);}));
  $('expandTree').addEventListener('click',()=>graph.expandAll());$('collapseTree').addEventListener('click',()=>graph.collapseAll());
  $('downloadDecision').addEventListener('click',()=>download('farm-decision-model.json',window.FarmDecisionModel));
  $('downloadEvents').addEventListener('click',()=>download('farm-'+scenario+'-events.json',{scenario,source:'farm.sim.MissionEngine.events()',notice:'异常恢复由导出脚本模拟操作员明确确认；replayTime 含展示等待，time 为仿真时钟。',events}));
  $('startTour').addEventListener('click',()=>{loadScenario('normal');setPlaying(!reducedMotion);});
  ['showStrips','showTrails','showLabels'].forEach(id=>$(id).addEventListener('change',drawMap));
  $('zoomIn').addEventListener('click',()=>{zoom=Math.min(5,zoom*1.25);drawMap();});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(.65,zoom/1.25);drawMap();});$('zoomFit').addEventListener('click',()=>{zoom=1;panX=0;panY=0;drawMap();});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));drawMap();},{passive:false});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,px:panX,py:panY,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;panX=drag.px+dx;panY=drag.py+dy;drawMap();});
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const r=screenRobots.find(p=>Math.hypot(p.x-x,p.y-y)<18);if(r)selectRobot(r.id);}drag=null;});
  canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(['1','2','3'].includes(e.key)){selectRobot('robot_'+e.key);e.preventDefault();}else if(e.key==='0'){zoom=1;panX=0;panY=0;drawMap();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){panX+=e.key==='ArrowLeft'?20:e.key==='ArrowRight'?-20:0;panY+=e.key==='ArrowUp'?20:e.key==='ArrowDown'?-20:0;drawMap();e.preventDefault();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
  new ResizeObserver(()=>{dimensions();drawMap();}).observe(canvas.parentElement);
  dimensions();loadScenario('normal');
  // Open on a representative real frame; the full-mission button always starts at t=0.
  seek(600);
}());
