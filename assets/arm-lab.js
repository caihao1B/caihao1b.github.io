/* Source-driven six_arm kinematics. Canvas projection only; no physics, ROS or collision solver. */
(function (root) {
  'use strict';
  const model = root.ARM_MODEL;
  if (!model) return;
  const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const mul = (a,b) => { const c=Array(16).fill(0); for(let r=0;r<4;r++)for(let k=0;k<4;k++)for(let j=0;j<4;j++)c[r*4+j]+=a[r*4+k]*b[k*4+j]; return c; };
  const tr = (v) => [1,0,0,v[0], 0,1,0,v[1], 0,0,1,v[2], 0,0,0,1];
  const point = (m,p) => [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
  const rot = (axis,a) => { const [x,y,z]=axis,c=Math.cos(a),s=Math.sin(a),t=1-c;return [t*x*x+c,t*x*y-s*z,t*x*z+s*y,0,t*x*y+s*z,t*y*y+c,t*y*z-s*x,0,t*x*z-s*y,t*y*z+s*x,t*z*z+c,0,0,0,0,1]; };
  const norm = a => {const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function fk(q) {
    if (!Array.isArray(q)||q.length!==6||q.some(x=>!Number.isFinite(x))) throw new Error('six finite joint values required');
    const base=model.base.origin.map((v,i)=>v+model.base.arm_offset[i]);
    let m=tr(base);const frames=[],origins=[];
    model.joints.forEach((j,i)=>{m=mul(m,tr(j.origin));origins.push(point(m,[0,0,0]));m=mul(m,rot(j.axis,q[i]));frames.push(m.slice());});
    return {frames,origins,tip:point(m,[0,0,0]),armBase:base,frame:'base_footprint',tipFrame:'grasping_frame'};
  }
  const names={home:'收回 / 初始位',pick_hover:'抓取悬停',pick_contact:'接近抓取',carry:'携带姿态',place_hover:'放置悬停',place_release:'下降释放'};
  const groups=['初始准备','接近抓取','附着与携带','放置接近','打开与解除','收回'];
  const sequence=[
    {key:'home',label:'展示复位与打开请求',duration:2,grip:.2,group:0,text:'页面先展示 home 复位，便于观察完整模型。源码 pick_model 从夹爪 open 请求（1.1 s）开始，再进入悬停与接近；此处将准备过程简化展示。',api:'网页初始 home；源抓取入口：gripper open → pick_hover'},
    {key:'pick_hover',label:'抓取悬停',duration:2.2,grip:.2,group:1,text:'机械臂执行 pick_hover 六关节目标，进入接近姿态。',api:'FollowJointTrajectory → pick_hover'},
    {key:'pick_contact',label:'接近抓取',duration:1.1,grip:.2,group:1,text:'执行 pick_contact 预设。实际任务还需要物体对齐、距离和服务返回检查。',api:'FollowJointTrajectory → pick_contact'},
    {key:'pick_contact',label:'建立附着与 closed 请求',duration:1,grip:0,attached:true,group:2,text:'源码通过 Gazebo LinkAttacher 请求建立物体关联，再发送名为 closed 的夹爪目标。这里的标记仅说明服务语义，开合名称保留原配置。',api:'/ATTACHLINK → gripper command'},
    {key:'carry',label:'携带姿态',duration:1.5,grip:0,attached:true,group:2,text:'六关节回到 carry 预设。完整任务在这一姿态下交回底盘导航；本面板不模拟底盘运输。',api:'FollowJointTrajectory → carry'},
    {key:'place_hover',label:'放置悬停',duration:1.8,grip:0,attached:true,group:3,text:'到达目标区后，执行 place_hover。放置关节1可按源码配置采用槽位偏置，本演示采用默认零偏置。',api:'FollowJointTrajectory → place_hover'},
    {key:'place_release',label:'接近释放位',duration:1.1,grip:0,attached:true,group:3,text:'执行 place_release 目标。预设关节插值并不保证末端路径避开障碍物。',api:'FollowJointTrajectory → place_release'},
    {key:'place_release',label:'夹爪打开请求',duration:1.1,grip:.2,attached:true,group:4,text:'源码发送 open=0.2 m；这一值超过模型0.06 m上限。本视图对几何限幅，并保留真实请求值提示。',api:'gripper open request: 0.2 m'},
    {key:'place_release',label:'解除附着',duration:1.25,grip:.2,group:4,text:'请求解除 Gazebo 物体关联，随后等待稳定并收回机械臂；源码在收回后的再次等待之后才核验放置真值。',api:'/DETACHLINK → settle → retract'},
    {key:'place_hover',label:'抬升离开',duration:1.8,grip:.2,group:5,text:'源码在释放后先回到 place_hover，再收回机械臂。',api:'FollowJointTrajectory → place_hover'},
    {key:'carry',label:'回到携带姿态',duration:1.5,grip:.2,group:5,text:'执行 carry 中间姿态，继续收回过程。',api:'FollowJointTrajectory → carry'},
    {key:'home',label:'回到初始位',duration:2,grip:.2,group:5,text:'回到 home。源码在收回后等待稳定，再调用放置真值核验；页面演示结束，未生成实际核验结果。',api:'home → settle → _verify_place_truth'}
  ];
  let total=0;sequence.forEach(s=>{s.start=total;total+=s.duration;s.end=total;});
  function sample(t) {
    t=clamp(t,0,total);let idx=sequence.findIndex(s=>t<s.end);if(idx<0)idx=sequence.length-1;
    const s=sequence[idx],p=idx?sequence[idx-1]:sequence[0],f=clamp((t-s.start)/s.duration,0,1),e=f*f*(3-2*f);
    return {q:model.presets[s.key].map((v,i)=>model.presets[p.key][i]+(v-model.presets[p.key][i])*e),grip:p.grip+(s.grip-p.grip)*e,attached:!!s.attached,phase:idx,fraction:f,time:t};
  }
  root.ArmLab={fk,sample,model,sequence,total,math:{mul,tr,rot,point}};
  if (typeof document==='undefined') return;
  const host=document.getElementById('armLab');if(!host)return;
  host.classList.add('arm-lab');
  host.innerHTML=`
    <div class="arm-lab-head"><div><h3>six_arm · 六轴机械臂工作台</h3><p>源模型尺寸 · 源预设关节角 · 浏览器正运动学</p></div><span class="arm-source-badge">源码驱动的交互重建</span></div>
    <div class="arm-lab-main">
      <div class="arm-view">
        <canvas class="arm-canvas" id="armCanvas" tabindex="0" role="img" aria-label="six_arm机械臂三维视图。拖动旋转，方向键旋转视角，加减键缩放。下方可播放或调整六轴关节。"></canvas>
        <div class="arm-view-caption"><b>URDF KINEMATIC VIEW</b><span>base_footprint → grasping_frame</span><em>网格间距 0.1 m · 非 Gazebo 录屏</em></div>
        <span class="arm-view-status" id="armAttached">未请求附着</span>
        <div class="arm-view-tools" aria-label="模型视角"><button type="button" data-view="iso">等距</button><button type="button" data-view="front">正视</button><button type="button" data-view="top">俯视</button><button type="button" id="armAxes" aria-pressed="false">关节坐标轴</button><span class="arm-spacer"></span><button type="button" id="armZoomIn" aria-label="放大模型">＋</button><button type="button" id="armZoomOut" aria-label="缩小模型">－</button><button type="button" id="armViewReset">重置视角</button><button type="button" id="armExport">导出 PNG</button></div>
        <p class="arm-view-help">拖动旋转 · 聚焦画布后方向键旋转，＋／－缩放 · 拖动关节可单独查看各轴</p>
      </div>
      <div class="arm-side"><h4>关节与末端状态</h4><label class="arm-select-label" for="armPreset">源码中的预设姿态</label><select id="armPreset"><option value="sequence">完整动作序列</option>${Object.entries(names).map(([k,v])=>`<option value="${k}">${k} · ${v}</option>`).join('')}<option value="manual">手动关节查看</option></select>
      <div class="arm-sliders">${model.joints.map((j,i)=>`<div class="arm-joint"><div class="arm-joint-top"><label for="armJoint${i}"><span class="arm-axis-chip"></span>J${i+1} · ${['Z','Y','Y','Z','−Y','Z'][i]}</label><output id="armValue${i}" for="armJoint${i}">0.000 rad</output></div><input id="armJoint${i}" type="range" min="${j.limits.lower}" max="${j.limits.upper}" step="0.001" value="0" aria-label="关节${i+1}角度，弧度"></div>`).join('')}</div>
      <div class="arm-fk-box"><h4>grasping_frame 原点 · m</h4><div class="arm-fk-values"><span id="armTcpX">X 0.000</span><span id="armTcpY">Y 0.000</span><span id="armTcpZ">Z 0.763</span></div><small>相对 base_footprint；该源坐标系与 link6 原点重合，不是指尖中心。</small></div>
      <p class="arm-gripper-readout" id="armGripper"></p></div>
    </div>
    <div class="arm-playback"><div class="arm-playback-top"><div class="arm-play-controls"><button type="button" class="arm-play" id="armPlay">▶ 播放动作</button><button type="button" id="armPrev" aria-label="上一步动作">上一步</button><button type="button" id="armNext" aria-label="下一步动作">下一步</button><button type="button" id="armReset">重播起点</button><label class="arm-speed" for="armSpeed">速度 <select id="armSpeed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div><span class="arm-clock">页面播放时间 <strong id="armTime">0.00 / ${total.toFixed(2)} s</strong></span></div>
    <input id="armTimeline" class="arm-timeline" type="range" min="0" max="${total}" step="0.01" value="0" aria-label="机械臂动作演示时间轴">
    <div class="arm-phase-row" aria-label="跳转动作阶段">${groups.map((g,i)=>`<button type="button" data-group="${i}" aria-pressed="${i===0}">${String(i+1).padStart(2,'0')} ${g}</button>`).join('')}</div>
    <div class="arm-phase-detail"><span class="arm-phase-num" id="armPhaseNum">01</span><div><h4 id="armPhaseTitle">初始准备</h4><p id="armPhaseText"></p><p><code id="armPhaseApi"></code></p></div></div></div>
    <div class="arm-source-note"><p>模型保留 Xacro 圆柱与长方体几何，六轴角度取自原配置。关节之间采用前端 smoothstep 插值；时间轴是说明性的播放编排，服务等待时长与附着标记均不代表实际运行反馈。</p><details><summary>模型来源与控制参数差异</summary><p><code>mybot_description/urdf/arm.xacro</code> 定义六轴、限位和夹爪；<code>large_base.xacro</code> 与 <code>originbot_with_rgbd_gazebo_arm.xacro</code> 定义底盘和安装位置。<code>tools_demo/config/competition_scene.json</code> 的 <code>arm_presets</code> 提供姿态与运动时间，<code>grasp_executor.py</code> 给出抓取、释放和收回顺序。</p><p class="arm-alert">源码夹爪 open 请求为 0.2 m，URDF 行程上限为 0.06 m。open／closed 是原配置标签；按模型轴向，位置增大时两指更接近，与标签直觉不同。页面仅把几何显示限制在模型行程内，没有修复或验证实际开合控制。</p><p class="arm-alert"><code>arm_gazebo.xacro</code> 的 position 接口声明范围为 −1 到 1，部分预设角度为 1.17／1.2 rad。页面按 URDF 关节限位展示这些源目标，实际接口限制如何生效仍需运行核验。</p><p>这里只复现机械臂与底盘主体，未建模传感器；附着以状态提示表达，不生成物体成功搬运结果。本演示没有逆运动学求解、MoveIt 规划、碰撞检测或动力学。</p></details></div><div class="arm-live" id="armLive" aria-live="polite"></div>`;
  const el=id=>document.getElementById(id),canvas=el('armCanvas'),ctx=canvas.getContext('2d');
  if(!ctx){host.innerHTML='<p class="arm-nojs">浏览器无法建立 Canvas 视图。六轴模型及预设参数仍可从本页源码证据中查看。</p>';return;}
  let state=sample(0),playing=false,speed=1,mode='sequence',az=-.87,ev=.42,zoom=1,showAxes=false,lastFrame=0,raf=0,lastPhase=-1;
  const target=[.08,0,.36],jointInputs=model.joints.map((_,i)=>el('armJoint'+i)),jointValues=model.joints.map((_,i)=>el('armValue'+i));
  const colors={blue:[51,112,205],white:[220,232,242],black:[42,59,78],orange:[222,128,56],grey:[126,147,165]};
  const unitCube={v:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],f:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};
  const cylCache=new Map();
  function cylinder(n=24){if(cylCache.has(n))return cylCache.get(n);const v=[],f=[];for(let k=0;k<2;k++)for(let i=0;i<n;i++){const a=2*Math.PI*i/n;v.push([Math.cos(a),Math.sin(a),k-.5]);}for(let i=0;i<n;i++){let j=(i+1)%n;f.push([i,j,j+n,i+n]);}f.push(Array.from({length:n},(_,i)=>n-1-i));f.push(Array.from({length:n},(_,i)=>n+i));const mesh={v,f};cylCache.set(n,mesh);return mesh;}
  function sphere(){const v=[],f=[],lat=8,lon=16;for(let i=0;i<=lat;i++)for(let j=0;j<lon;j++){let a=Math.PI*i/lat,b=2*Math.PI*j/lon;v.push([Math.sin(a)*Math.cos(b),Math.sin(a)*Math.sin(b),Math.cos(a)]);}for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){let k=i*lon+j,l=i*lon+(j+1)%lon;f.push([k,l,l+lon,k+lon]);}return {v,f};}const ball=sphere();
  let W=1,H=1,scale=1,centerY=1,camera={};
  function setupCamera(){camera.right=[-Math.sin(az),Math.cos(az),0];camera.up=[-Math.sin(ev)*Math.cos(az),-Math.sin(ev)*Math.sin(az),Math.cos(ev)];camera.front=[Math.cos(ev)*Math.cos(az),Math.cos(ev)*Math.sin(az),Math.sin(ev)];const narrow=W<500;scale=(narrow?Math.min(W*.95,(H-130)*.95):Math.min(W*1.25,H*.91))*zoom;centerY=H*(narrow?.64:.55);}
  function project(p){let v=sub(p,target);return [W*.50+dot(v,camera.right)*scale,centerY-dot(v,camera.up)*scale,dot(v,camera.front)];}
  function line(a,b,color,width=1,dash=[]){const p=project(a),q=project(b);ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();ctx.setLineDash([]);}
  function draw(){
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(root.devicePixelRatio||1,2);W=Math.max(1,rect.width);H=Math.max(1,rect.height);
    if(canvas.width!==Math.round(W*ratio)||canvas.height!==Math.round(H*ratio)){canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio);}ctx.setTransform(ratio,0,0,ratio,0,0);setupCamera();
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#102237');bg.addColorStop(1,'#091420');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    for(let i=-7;i<=7;i++){let k=i/10;line([k,-.7,0],[k,.7,0],i===0?'#29455c':'#1a2e40',1);line([-.7,k,0],[.7,k,0],i===0?'#29455c':'#1a2e40',1);}
    const faces=[],light=norm([-.25,-.55,1]);
    const add=(mesh,m,size,color)=>{const verts=mesh.v.map(v=>point(m,v.map((x,i)=>x*size[i])));for(const f of mesh.f){const vs=f.map(i=>verts[i]),normal=norm(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])));if(dot(normal,camera.front)<-.03)continue;const ps=vs.map(project),brightness=.39+.55*Math.max(0,dot(normal,light))+.12*Math.max(0,dot(normal,camera.front));faces.push({ps,z:ps.reduce((s,p)=>s+p[2],0)/ps.length,color:`rgb(${color.map(x=>Math.round(clamp(x*brightness,0,255))).join(',')})`});}};
    add(unitCube,tr(model.base.origin),model.base.size,colors.orange);
    for(const origin of model.base.wheel_origins)add(cylinder(),mul(tr(origin),rot([1,0,0],Math.PI/2)),[.065,.065,.05],colors.grey);
    add(ball,tr(model.base.caster_origin),[.0267,.0267,.0267],colors.black);
    const k=fk(state.q);add(unitCube,tr(k.armBase),[.1,.1,.04],colors.white);
    model.visuals.forEach(v=>add(cylinder(),mul(k.frames[v.link],tr(v.origin)),[v.radius,v.radius,v.length],colors[v.color]));
    const grip=clamp(state.grip,0,.06),fingerOrigin=.05*.75;
    add(unitCube,mul(mul(k.frames[5],tr([0,-fingerOrigin+grip,.042])),rot([0,1,0],Math.PI/2)),[.08,.01,.02],colors.white);
    add(unitCube,mul(mul(k.frames[5],tr([0,fingerOrigin,.042])),rot([0,1,0],Math.PI/2)),[.08,.01,.02],colors.white);
    faces.sort((a,b)=>a.z-b.z);for(const f of faces){ctx.beginPath();f.ps.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();ctx.strokeStyle='#a7c7e51c';ctx.lineWidth=.45;ctx.stroke();}
    if(showAxes){k.frames.forEach((m,i)=>{const o=point(m,[0,0,0]);[['#ee8a85',[.055,0,0]],['#79c0a7',[0,.055,0]],['#84b9ec',[0,0,.055]]].forEach(([c,v])=>line(o,point(m,v),c,1.4));const p=project(o);ctx.fillStyle='#d0e2f2';ctx.font='10px system-ui';ctx.fillText('J'+(i+1),p[0]+7,p[1]-6);});}
    const tip=project(k.tip);ctx.beginPath();ctx.arc(tip[0],tip[1],4.2,0,Math.PI*2);ctx.fillStyle=state.attached?'#78e0ce':'#8bc8ef';ctx.fill();ctx.strokeStyle='#0d2031';ctx.lineWidth=2;ctx.stroke();ctx.font='10px ui-monospace,monospace';ctx.fillStyle='#b1d3eb';ctx.fillText('grasping_frame',tip[0]+10,tip[1]-8);
    const o=[-.32,-.32,.003];line(o,[o[0]+.12,o[1],o[2]],'#df8b84',2);line(o,[o[0],o[1]+.12,o[2]],'#83bea0',2);line(o,[o[0],o[1],o[2]+.12],'#82b1df',2);[['X',[o[0]+.14,o[1],o[2]],'#df8b84'],['Y',[o[0],o[1]+.14,o[2]],'#83bea0'],['Z',[o[0],o[1],o[2]+.14],'#82b1df']].forEach(([l,p,c])=>{const q=project(p);ctx.fillStyle=c;ctx.font='10px system-ui';ctx.fillText(l,q[0],q[1]);});
    ctx.fillStyle='#6e91ad';ctx.font='10px system-ui';ctx.fillText('six_arm  /  源码运动学重建 · 非 Gazebo 实录',16,H-27);
    ctx.fillStyle='#65839a';ctx.font='9px ui-monospace,monospace';ctx.fillText('q(rad) ['+state.q.map(v=>v.toFixed(2)).join(', ')+']',16,H-12);
  }
  function update(announce=false){
    const k=fk(state.q),s=sequence[state.phase];jointInputs.forEach((input,i)=>{input.value=state.q[i];jointValues[i].value=state.q[i].toFixed(3)+' rad';});
    ['X','Y','Z'].forEach((v,i)=>el('armTcp'+v).textContent=v+' '+k.tip[i].toFixed(3));
    el('armTimeline').value=state.time;el('armTime').textContent=state.time.toFixed(2)+' / '+total.toFixed(2)+' s';el('armPlay').textContent=playing?'Ⅱ 暂停':'▶ 播放动作';el('armPreset').value=mode;
    el('armAttached').dataset.attached=String(state.attached);el('armAttached').textContent=mode!=='sequence'?'姿态查看 · 无附着反馈':state.attached?'附着意图 · 示意状态':state.phase>=8?'已请求解除 · 示意状态':'未请求附着';
    el('armGripper').innerHTML=`夹爪请求 <b>${state.grip.toFixed(3)} m</b> · 几何显示 ${clamp(state.grip,0,.06).toFixed(3)} m<br>模型行程 0–0.06 m；open=0.2 m 超限。`;
    host.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(mode==='sequence'&&+b.dataset.group===s.group)));
    const changed=lastPhase!==state.phase;lastPhase=state.phase;
    el('armPhaseNum').textContent=mode==='sequence'?String(state.phase+1).padStart(2,'0'):'—';
    el('armPhaseTitle').textContent=mode==='sequence'?s.label:mode==='manual'?'手动查看六轴关节':names[mode];
    el('armPhaseText').textContent=mode==='sequence'?s.text:mode==='manual'?'关节受 URDF 角度限位约束。观察各关节如何改变连杆与末端位姿；J6 改变朝向，不改变与其原点重合的 grasping_frame 坐标。':'显示源码中这一组关节目标。点击播放将回到完整动作说明。';
    el('armPhaseApi').textContent=mode==='sequence'?s.api:mode==='manual'?'q → forward kinematics → grasping_frame':'competition_scene.json → arm_presets.'+mode;
    el('armPrev').disabled=mode==='sequence'&&state.time<=0;el('armNext').disabled=mode==='sequence'&&state.time>=total;
    if(announce||changed)el('armLive').textContent=el('armPhaseTitle').textContent;
    draw();
  }
  function stop(){playing=false;if(raf){cancelAnimationFrame(raf);raf=0;}}
  function seek(t){stop();mode='sequence';state=sample(t);update(true);}
  function tick(ts){if(!playing)return;if(lastFrame){state=sample(state.time+Math.min((ts-lastFrame)/1000,.12)*speed);if(state.time>=total)playing=false;}lastFrame=ts;update();if(playing)raf=requestAnimationFrame(tick);else raf=0;}
  el('armPlay').addEventListener('click',()=>{if(playing){stop();update();return;}if(mode!=='sequence'||state.time>=total){mode='sequence';state=sample(0);}playing=true;lastFrame=0;update(true);raf=requestAnimationFrame(tick);});
  el('armReset').addEventListener('click',()=>seek(0));el('armTimeline').addEventListener('input',e=>seek(+e.target.value));
  el('armPrev').addEventListener('click',()=>{const idx=mode==='sequence'?state.phase:0;seek(sequence[Math.max(0,idx-1)].end-.001);});
  el('armNext').addEventListener('click',()=>{const idx=mode==='sequence'?state.phase:-1;const next=Math.min(sequence.length-1,idx+1);seek(next===sequence.length-1?total:sequence[next].end-.001);});
  el('armSpeed').addEventListener('change',e=>speed=+e.target.value);
  host.querySelectorAll('[data-group]').forEach(b=>b.addEventListener('click',()=>{const i=sequence.findIndex(s=>s.group===+b.dataset.group);seek(sequence[i].end-.001);}));
  el('armPreset').addEventListener('change',e=>{stop();mode=e.target.value;if(mode==='sequence')state=sample(state.time);else if(mode!=='manual'){state.q=model.presets[mode].slice();state.attached=false;}update(true);});
  jointInputs.forEach((input,i)=>input.addEventListener('input',()=>{stop();mode='manual';state.q[i]=+input.value;state.attached=false;update();}));
  function view(name){if(name==='front'){az=-Math.PI/2;ev=.04;}else if(name==='top'){az=-Math.PI/2;ev=1.51;}else{az=-.87;ev=.42;}zoom=1;draw();}
  host.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
  el('armViewReset').addEventListener('click',()=>view('iso'));
  el('armAxes').addEventListener('click',()=>{showAxes=!showAxes;el('armAxes').setAttribute('aria-pressed',String(showAxes));draw();});
  el('armZoomIn').addEventListener('click',()=>{zoom=clamp(zoom*1.13,.65,1.7);draw();});el('armZoomOut').addEventListener('click',()=>{zoom=clamp(zoom/1.13,.65,1.7);draw();});
  el('armExport').addEventListener('click',()=>{draw();const a=document.createElement('a');a.download='six_arm_kinematic_view.png';a.href=canvas.toDataURL('image/png');a.click();el('armLive').textContent='已导出带源码运动学重建说明的当前视图。';});
  let drag=null;canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;az-=(e.clientX-drag[0])*.008;ev=clamp(ev+(e.clientY-drag[1])*.008,-.15,1.53);drag=[e.clientX,e.clientY];draw();});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')az-=.12;else if(e.key==='ArrowRight')az+=.12;else if(e.key==='ArrowUp')ev=clamp(ev+.1,-.15,1.53);else if(e.key==='ArrowDown')ev=clamp(ev-.1,-.15,1.53);else if(['+','='].includes(e.key))zoom=clamp(zoom*1.1,.65,1.7);else if(e.key==='-')zoom=clamp(zoom/1.1,.65,1.7);else return;e.preventDefault();draw();});
  root.addEventListener('resize',draw);document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stop();update();}});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe(canvas);
  Object.assign(root.ArmLab,{getState:()=>({q:state.q.slice(),time:state.time,phase:state.phase,playing,mode,grip:state.grip,gripDisplayed:clamp(state.grip,0,.06),attachedIntent:state.attached,tip:fk(state.q).tip}),seek,setPreset:key=>{if(!model.presets[key])throw new Error('unknown preset');stop();mode=key;state.q=model.presets[key].slice();state.attached=false;update(true);},draw});
  update();
})(typeof window!=='undefined'?window:globalThis);
