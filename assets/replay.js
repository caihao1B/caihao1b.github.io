/* Actual Python-generated ordered routes and analytic reference trajectories.
   No hidden replanning, no angle snapping and no automatic end-to-start loop. */
'use strict';
(()=>{
const cases=window.CCPP_CASES||[],$=id=>document.getElementById(id);
if(!cases.length){$('caseHeading').textContent='演示数据未加载：请完整解压并保留 assets 文件夹。';return;}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const state={data:null,t:0,playing:false,last:0,stage:'curve',focus:null};
const canvas=$('sceneCanvas'),ctx=canvas.getContext('2d');
const text=(id,value)=>{const node=$(id);if(node)node.textContent=value;};
const labels={square_greedy:'方格 · Greedy',square_mst:'方格 · MST–Euler',square_ga:'方格 · GA / 2-opt',triangle_greedy:'三角格 · Greedy',triangle_mst:'三角格 · MST–Euler',triangle_ga:'三角格 · GA / 2-opt',square_ga_circular:'同顺序 · 圆弧平滑',square_ga_conservative:'同曲线 · 保守时间剖面',car_r060:'前进车辆 · R ≥ 0.60 m',car_r090:'前进车辆 · R ≥ 0.90 m'};
const H=u=>10*u**3-15*u**4+6*u**5,I=u=>2.5*u**4-3*u**5+u**6;
function profileAt(p,time){
 const r=p.ramp,c=p.cruise,V=p.peak,t=clamp(time,0,2*r+c);
 if(t<r){const u=t/r;return{s:V*r*I(u),v:V*H(u)};}
 if(t<r+c)return{s:V*r/2+V*(t-r),v:V};
 const u=clamp((t-r-c)/r,0,1);return{s:V*(r/2+c)+V*r*(u-I(u)),v:V*(1-H(u))};
}
function bernstein(cp,u,co){let x=0,y=0;const n=cp.length-1;cp.forEach((p,i)=>{const b=co[i]*(1-u)**(n-i)*u**i;x+=b*p[0];y+=b*p[1];});return[x,y];}
function curveAt(g,u){
 u=clamp(u,0,1);
 if(g.type==='LINE'){const dx=g.p1[0]-g.p0[0],dy=g.p1[1]-g.p0[1];return{x:g.p0[0]+dx*u,y:g.p0[1]+dy*u,yaw:Math.atan2(dy,dx),du:Math.hypot(dx,dy),k:0};}
 if(g.type==='ARC'){const a=g.angle0+g.sweep*u,r=g.radius;return{x:g.center[0]+r*Math.cos(a),y:g.center[1]+r*Math.sin(a),yaw:a+Math.sign(g.sweep)*Math.PI/2,du:r*Math.abs(g.sweep),k:Math.sign(g.sweep)/r};}
 if(g.type==='BEZIER5'){
 const cp=g.control,dc=cp.slice(1).map((p,i)=>[5*(p[0]-cp[i][0]),5*(p[1]-cp[i][1])]),ac=dc.slice(1).map((p,i)=>[4*(p[0]-dc[i][0]),4*(p[1]-dc[i][1])]);
 const p=bernstein(cp,u,[1,5,10,10,5,1]),v=bernstein(dc,u,[1,4,6,4,1]),a=bernstein(ac,u,[1,3,3,1]),du=Math.hypot(...v);
 return{x:p[0],y:p[1],yaw:Math.atan2(v[1],v[0]),du,k:(v[0]*a[1]-v[1]*a[0])/du**3};}
 throw Error('Unknown saved curve: '+g.type);
}
function poseAt(d,time){
 const es=d.events,t=clamp(time,0,es.at(-1).t1);let lo=0,hi=es.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(es[mid].t1<=t)lo=mid+1;else hi=mid;}
 const e=es[lo],lt=t-e.t0;let a={t,x:e.p0[0],y:e.p0[1],yaw:e.yaw0,v:0,w:0,k:0,steer:e.steer0||0,tool:!!e.tool_on,kind:e.kind,event:lo};
 if(e.curve){const pr=profileAt(e.profile,lt),g=curveAt(e.curve,pr.s),g0=curveAt(e.curve,0);
 const yaw=e.curve.type==='BEZIER5'?e.yaw0+wrap(g.yaw-g0.yaw):g.yaw+e.yaw0-g0.yaw;
 a={...a,x:g.x,y:g.y,yaw,v:g.du*pr.v,w:g.k*g.du*pr.v,k:g.k,steer:Math.atan(d.config.wheelbase_m*g.k)};
 }else if(e.kind==='TURN'){const p=profileAt(e.profile,lt),sign=Math.sign(e.yaw1-e.yaw0);a.yaw=e.yaw0+sign*p.s;a.w=sign*p.v;
 }else if(e.kind==='STEER'){const p=profileAt(e.steer_profile,lt);a.steer=e.steer0+Math.sign(e.steer1-e.steer0)*p.s;}
 return a;
}
function polygonParts(f){return f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];}
function draw(){
 const d=state.data;if(!d)return;const a=poseAt(d,state.t),ratio=window.innerWidth<=740?1.15:1.38,dpr=Math.min(window.devicePixelRatio||1,2);
 const W=canvas.clientWidth,Ht=W/ratio;
 if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(Ht*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(Ht*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,Ht);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,Ht);
 const pts=d.map.features.filter(f=>f.properties.kind==='field').flatMap(f=>polygonParts(f).flatMap(p=>p[0]));
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);let xmin=Math.min(...xs)-.35,xmax=Math.max(...xs)+.35,ymin=Math.min(...ys)-.35,ymax=Math.max(...ys)+.35;
 if(state.focus){const box=state.focus.bbox,pad=Math.max(.65,d.robot.length_m*.95);[xmin,ymin,xmax,ymax]=[box[0]-pad,box[1]-pad,box[2]+pad,box[3]+pad];}
 const pad=W<500?25:34,scale=Math.min((W-2*pad)/(xmax-xmin),(Ht-2*pad)/(ymax-ymin)),xoff=(W-scale*(xmax-xmin))/2,yoff=(Ht-scale*(ymax-ymin))/2;
 const screen=p=>[xoff+(p[0]-xmin)*scale,Ht-yoff-(p[1]-ymin)*scale];
 function path(points,close=false){if(!points.length)return;ctx.beginPath();points.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});if(close)ctx.closePath();}
 function polygon(f,fill,stroke){polygonParts(f).forEach(poly=>{ctx.beginPath();poly.forEach(ring=>{ring.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();});if(fill){ctx.fillStyle=fill;ctx.fill('evenodd');}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}});}
 ctx.save();ctx.beginPath();ctx.rect(xoff,yoff,scale*(xmax-xmin),scale*(ymax-ymin));ctx.clip();
 const step=state.focus?.25:2;ctx.strokeStyle='#edf1f5';ctx.lineWidth=.6;
 for(let x=Math.ceil(xmin/step)*step;x<xmax;x+=step){path([[x,ymin],[x,ymax]]);ctx.stroke();}
 for(let y=Math.ceil(ymin/step)*step;y<ymax;y+=step){path([[xmin,y],[xmax,y]]);ctx.stroke();}
 if(state.stage==='grid')polygon(d.declared,'#f0f6fb',null);
 d.map.features.forEach(f=>{ctx.lineWidth=1.2;polygon(f,f.properties.kind==='obstacle'?'#e2e7ec':null,'#72899e');});
 if(state.stage==='grid')d.cells.forEach(cell=>{path(cell.points,true);ctx.lineWidth=.55;ctx.strokeStyle='#84a9c8';ctx.stroke();});
 if(state.stage==='order'||(state.stage==='curve'&&$('rawCheck').checked)){
 ctx.strokeStyle=state.stage==='order'?'#2a78ae':'#b6c1cb';ctx.lineWidth=state.stage==='order'?1.25:.75;ctx.setLineDash(state.stage==='order'?[]:[3,3]);
 d.raw_legs.forEach(l=>{path([l.p0,l.p1]);ctx.stroke();});ctx.setLineDash([]);
 }
 if(state.stage==='curve')d.curve_groups.forEach(g=>{
 ctx.strokeStyle=g.kind==='WORK'?'#287daf':'#b76d37';ctx.lineWidth=g.kind==='WORK'?1.5:1.2;
 ctx.globalAlpha=state.focus&&state.focus.id&&g.turn_id!==state.focus.id?.32:1;
 if(state.focus&&g.turn_id===state.focus.id)ctx.lineWidth=2.6;
 ctx.setLineDash(g.kind==='TRANSIT'&&!state.focus?[3,2]:[]);path(g.points);ctx.stroke();ctx.globalAlpha=1;ctx.setLineDash([]);
 });
 const unique=new Map();d.visits.forEach(r=>unique.set(r.node_id,[r.x_m,r.y_m]));ctx.fillStyle='#8095a9';
 unique.forEach(p=>{const q=screen(p);ctx.beginPath();ctx.arc(...q,state.stage==='grid'?2.1:1.5,0,2*Math.PI);ctx.fill();});
 if($('labelsCheck').checked&&!state.focus){
 const first=clamp((Number($('visitStart').value)||1)-1,0,d.visits.length-1),groups=new Map();
 d.visits.slice(first,first+18).forEach(r=>{const old=groups.get(r.node_id);if(old)old.text+='/'+r.sequence;else groups.set(r.node_id,{p:[r.x_m,r.y_m],text:String(r.sequence)});});
 ctx.font='600 10px "Segoe UI",sans-serif';
 groups.forEach(l=>{const p=screen(l.p),tw=ctx.measureText(l.text).width;ctx.fillStyle='#ffffffea';ctx.fillRect(p[0]+2,p[1]-14,tw+5,14);ctx.fillStyle='#234b6c';ctx.fillText(l.text,p[0]+4,p[1]-3);});
 }
 if(state.stage==='curve'){
 const start=Math.max(state.focus?state.focus.t0:0,state.t-10),tail=Array.from({length:45},(_,i)=>{const q=poseAt(d,start+(state.t-start)*i/44);return[q.x,q.y];});
 ctx.strokeStyle='#aa4c26';ctx.lineWidth=2.4;path(tail);ctx.stroke();
 const rb=d.robot,c=Math.cos(a.yaw),s=Math.sin(a.yaw),body=[[-rb.length_m/2,-rb.width_m/2],[rb.length_m/2,-rb.width_m/2],[rb.length_m/2,rb.width_m/2],[-rb.length_m/2,rb.width_m/2]].map(([x,y])=>[a.x+c*x-s*y,a.y+s*x+c*y]);
 path(body,true);ctx.fillStyle='#284d7220';ctx.fill();ctx.strokeStyle='#183e61';ctx.lineWidth=2.2;ctx.stroke();
 path([[a.x,a.y],[a.x+c*rb.length_m*.7,a.y+s*rb.length_m*.7]]);ctx.stroke();
 const p=screen([a.x,a.y]);ctx.beginPath();ctx.arc(...p,rb.cutting_width_m/2*scale,0,2*Math.PI);ctx.strokeStyle=a.tool?'#4e9987':'#c0c9d1';ctx.lineWidth=.9;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
 if(d.config.motion_model==='bounded_curvature'){
 const p=[a.x+c*rb.length_m*.28,a.y+s*rb.length_m*.28],angle=a.yaw+a.steer,z=.14;
 path([[p[0]-z*Math.cos(angle),p[1]-z*Math.sin(angle)],[p[0]+z*Math.cos(angle),p[1]+z*Math.sin(angle)]]);ctx.strokeStyle='#183e61';ctx.lineWidth=3;ctx.stroke();}
 }
 ctx.restore();ctx.font='11px "Segoe UI",sans-serif';ctx.fillStyle='#76899b';ctx.fillText('x / y：米 · 序号：计划访问顺序',pad,Ht-9);
 $('timeSlider').value=state.t;$('timeLabel').textContent=`${state.t.toFixed(1)} / ${(state.focus?state.focus.t1:d.events.at(-1).t1).toFixed(1)} s`;
 text('speedValue',a.v.toFixed(3));text('omegaValue',a.w.toFixed(3));text('curvatureValue',a.k.toFixed(3));
 const kinds={WORK:'作业',TRANSIT:'转场/回环',WAIT:'刀具等待',SERVICE:'原地作业',STEER:'停车转舵（车体不旋转）',TURN:'原地转向'};
 $('eventText').textContent=`#${a.event} ${kinds[a.kind]||a.kind}`;window.CCPP_CURRENT_POSE=a;
}
function pause(){state.playing=false;state.last=0;$('playButton').textContent='播放';}
function stage(name){state.stage=name;text('stageHint',({grid:'田界、障碍与可访问任务单元的网格表示。',order:'任务访问顺序及必要回访路径。',curve:'基于已保存参考轨迹的机器人运动回放。'})[name]);document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b.dataset.stage===name));if(name!=='curve'){pause();state.focus=null;setRange();}draw();}
function setRange(){const d=state.data;$('timeSlider').min=state.focus?state.focus.t0:0;$('timeSlider').max=state.focus?state.focus.t1:d.events.at(-1).t1;}
function setCase(id){
 state.data=cases.find(d=>d.id===id)||cases[0];state.t=0;state.focus=null;pause();const d=state.data;
 $('caseSelect').value=d.id;$('caseHeading').textContent=labels[d.id];$('visitStart').value=1;$('visitStart').max=d.visits.length;
 $('gridSummary').textContent=`${d.config.grid_type==='square'?'方格':'三角格'}任务 → 访问顺序 → 曲线轨迹`;
 $('focusNote').textContent='“回环掉头回放”可定位至完整的局部转弯过程。';
 setRange();draw();
}
function focusWindow(win,note){pause();state.focus=win;state.t=win.t0;$('speedSelect').value='1';state.stage='curve';document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b.dataset.stage==='curve'));setRange();$('focusNote').textContent=note;draw();}
function chooseLoop(){
 const d=state.data,w=d.turn_windows.find(w=>w.id.startsWith('heading_')&&Math.abs(w.delta)>3)||d.turn_windows.find(w=>Math.abs(w.delta)>3)||d.turn_windows[0];
 if(!w){$('focusNote').textContent='该案例没有回环；请查看普通平滑弯道。';return;}
 focusWindow(w,`完整 ${w.word} 回环：${((w.t1-w.t0)).toFixed(1)} s，净航向变化 ${(Math.abs(w.delta)*180/Math.PI).toFixed(0)}°。点击播放；片段结束会停止，不会自动跳回起点。`);
}
function chooseCurve(){const d=state.data,e=d.events.find(e=>e.curve&&e.curve.type==='BEZIER5')||d.events.find(e=>e.curve&&e.curve.type==='ARC');if(!e)return;
 const g=d.curve_groups.find(g=>g.event===e.id),xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]);
 focusWindow({id:null,t0:e.t0,t1:e.t1,bbox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]},`${e.curve.type} 平滑段，${e.duration.toFixed(1)} s。机器人航向由曲线切线确定，不做额外角度补间。`);
}
function full(){pause();state.focus=null;state.t=0;setRange();$('focusNote').textContent='已回到全任务视图。局部转弯建议使用 1×。';draw();}
const baseKeys=['square_greedy','square_mst','square_ga','triangle_greedy','triangle_mst','triangle_ga'];
for(const [title,ids] of [['网格与覆盖算法对照',baseKeys],['固定顺序的曲线与时间对照',['square_ga_circular','square_ga_conservative']],['车辆最小转弯半径对照',['car_r060','car_r090']]]){
 const og=document.createElement('optgroup');og.label=title;ids.forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=labels[id];og.appendChild(o);});$('caseSelect').appendChild(og);
}
$('caseSelect').addEventListener('change',e=>setCase(e.target.value));
document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>stage(b.dataset.stage)));
$('playButton').addEventListener('click',()=>{if(state.playing){pause();return;}if(state.stage!=='curve')stage('curve');const end=state.focus?state.focus.t1:state.data.events.at(-1).t1;if(state.t>=end)state.t=state.focus?state.focus.t0:0;state.playing=true;state.last=0;$('playButton').textContent='暂停';});
$('resetButton').addEventListener('click',()=>{pause();state.t=state.focus?state.focus.t0:0;draw();});$('loopButton').addEventListener('click',chooseLoop);$('curveButton').addEventListener('click',chooseCurve);$('fullButton').addEventListener('click',full);
$('timeSlider').addEventListener('input',e=>{pause();state.t=Number(e.target.value);draw();});['labelsCheck','rawCheck','visitStart'].forEach(id=>$(id).addEventListener('change',draw));
function frame(stamp){if(state.playing){if(state.last){state.t+=Math.min(.1,(stamp-state.last)/1000)*Number($('speedSelect').value);const end=state.focus?state.focus.t1:state.data.events.at(-1).t1;if(state.t>=end){state.t=end;pause();}draw();}state.last=stamp;}else state.last=0;requestAnimationFrame(frame);}
window.CCPPReplay={poseAt,profileAt,curveAt,state,setCase,chooseLoop,chooseCurve,draw,stage};
setCase(new URLSearchParams(location.search).get('case')||'square_ga');new ResizeObserver(draw).observe(canvas.parentElement);requestAnimationFrame(frame);
})();
