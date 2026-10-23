#!/usr/bin/env node
'use strict';
/*
 * DOM integration checks, NOT browser rendering or responsive-layout QA.
 * Uses the actual page and production scripts with controlled drawing/time APIs.
 * Optional: FARM_JSDOM_PATH=/path/to/node_modules/jsdom node tools/check_farm_ui.cjs
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const {pathToFileURL}=require('url');
const root=path.resolve(__dirname,'..'),reportPath=path.join(root,'reports/farm-ui-dom-tests.json');
let jsdom,loadedFrom;
const candidates=[process.env.FARM_JSDOM_PATH,'jsdom','/tmp/farm-portfolio-dom-qa/node_modules/jsdom'].filter(Boolean);
for(const candidate of candidates){try{jsdom=require(candidate);loadedFrom=candidate;break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
const limitations={realBrowserRendering:'not_run',responsiveLayout:'not_run',canvasPixels:'not_run',pointerHitTestingAtActualScreenCoordinates:'not_run',downloadNavigation:'not_run',statement:'本报告是 Node + jsdom 的 DOM 与事件联动验证。Canvas、尺寸、RAF 和 ResizeObserver 为受控替身，未验收真实浏览器像素、字体、响应式布局或浏览器下载行为。'};
if(!jsdom){
 const report={passed:false,status:'blocked_missing_dom_library',method:'DOM integration',limitations,candidates};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.error('jsdom unavailable; no browser or rendering result is claimed.');process.exit(2);
}
const {JSDOM,VirtualConsole}=jsdom;
const htmlPath=path.join(root,'farm-carrier.html'),html=fs.readFileSync(htmlPath,'utf8');
const runtimeErrors=[],vc=new VirtualConsole();
vc.on('jsdomError',error=>runtimeErrors.push(String(error.stack||error.message||error)));
const dom=new JSDOM(html,{url:pathToFileURL(htmlPath).href,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
let rafSerial=0,rafQueue=new Map(),drawCalls=0;
const context=new Proxy({measureText:text=>({width:String(text).length*6}),getLineDash:()=>[]},{get(target,key){if(key in target)return target[key];return (...args)=>{drawCalls++;};},set(target,key,value){target[key]=value;return true;}});
w.HTMLCanvasElement.prototype.getContext=function(){return context;};
w.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,top:0,left:0,right:700,bottom:480,width:700,height:480,toJSON(){return this;}};};
w.HTMLCanvasElement.prototype.setPointerCapture=function(){};
w.HTMLElement.prototype.scrollIntoView=function(){};
w.matchMedia=query=>({media:query,matches:false,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
w.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){}unobserve(){}disconnect(){}};
w.requestAnimationFrame=fn=>{rafQueue.set(++rafSerial,fn);return rafSerial;};
w.cancelAnimationFrame=id=>rafQueue.delete(id);
w.URL.createObjectURL=()=> 'blob:dom-test-only';w.URL.revokeObjectURL=()=>{};
const scripts=[...d.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
for(const src of scripts){const file=path.resolve(root,src);assert(file.startsWith(root+path.sep),'Script path must stay inside site');w.eval(fs.readFileSync(file,'utf8')+'\n//# sourceURL='+src);}
const checks=[];
function check(name,fn){try{const details=fn();checks.push({name,passed:true,details:details||null});}catch(error){checks.push({name,passed:false,error:String(error.stack||error)});}}
const $=id=>{const el=d.getElementById(id);assert(el,'Missing #'+id);return el;};
function click(el){assert(el,'Click target must exist');el.click();}
function change(el,value){el.value=String(value);el.dispatchEvent(new w.Event('change',{bubbles:true}));}
function selectScenario(id){change($('farmScenario'),id);}
function seek(time){$('farmTimeline').value=String(time);$('farmTimeline').dispatchEvent(new w.Event('input',{bubbles:true}));}
function frame(){return w.FarmReplay.getFrame($('farmMap').dataset.scenario,Number($('farmMap').dataset.frame));}
function selectedRobot(){const el=d.querySelector('[data-robot][aria-pressed="true"]');assert(el);return el.dataset.robot;}
function assertRobotFsm(){const f=frame(),id=selectedRobot(),r=f.robots.find(x=>x.id===id);assert($('agentState').textContent.startsWith(r.state));const current=[...$('farmFsm').querySelectorAll('.fg-state.fg-current')];assert.equal(current.length,1);assert.equal(current[0].dataset.state,r.state);assert($('fsmClock').textContent.includes(r.state));return r;}
function chapter(type){return [...$('farmChapters').querySelectorAll('button')].find(b=>b.title.includes('· '+type));}
function walkTree(n){return [n,...n.children.flatMap(walkTree)];}
function runRaf(time){const pending=[...rafQueue.values()];rafQueue.clear();pending.forEach(fn=>fn(time));}

check('actual page and dependency scripts initialise',()=>{
 assert.equal($('farmLoadError').hidden,true);assert(w.FarmReplay&&w.FarmGraphs&&w.FarmDecisionModel);
 assert.equal($('replayPlay').disabled,false);assert.equal($('farmTimeline').disabled,false);
 assert.equal(frame().scenario,'normal');assert.equal(frame().time,600);
 assert.equal(selectedRobot(),'robot_1');assertRobotFsm();assert(drawCalls>0);
 return {defaultSimulationTime:frame().time,scriptCount:scripts.length,canvasCommandsIssued:true};
});
check('select all three robots and keep Agent, map selection and robot FSM aligned',()=>{
 const selected=[];
 for(const id of w.FarmReplay.robotIds){click(d.querySelector('[data-robot="'+id+'"]'));assert.equal(selectedRobot(),id);const r=assertRobotFsm();assert($('agentName').textContent.endsWith(id.slice(-1).padStart(2,'0')));selected.push({id,state:r.state});}
 return selected;
});
check('switch all five scenarios using the actual select change event',()=>{
 const result=[];
 for(const meta of w.FarmReplay.scenarios){selectScenario(meta.id);const f=frame();assert.equal(f.scenario,meta.id);assert.equal(Number($('farmTimeline').max),meta.duration);assertRobotFsm();assert($('farmChapters').children.length>0);result.push({scenario:meta.id,time:f.time,status:f.status});}
 return result;
});
check('chapter buttons seek to actual event snapshots',()=>{
 selectScenario('normal');
 const result=[];
 for(const type of ['MISSION_START','WORK_START','RETURN_REQUEST','SERVICE_START','SERVICE_DONE']){
  const b=chapter(type);assert(b,'No chapter '+type);click(b);const f=frame();assert.equal(Number($('farmTimeline').value),Number(b.dataset.time));assert.equal(f.replayTime,Number(b.dataset.time));assertRobotFsm();result.push({type,time:f.time,frameIndex:f.index});
 }
 const resumeButton=[...$('farmChapters').querySelectorAll('button')].find(b=>b.textContent.includes('断点续作'));
 assert(resumeButton,'Resume chapter must exist');click(resumeButton);
 const resumeEvent=w.FarmReplay.getEvents('normal').find(e=>e.type==='WORK_START'&&Number(e.details?.offset_m)>0);
 const resumed=assertRobotFsm();assert.equal(selectedRobot(),resumeEvent.actor);assert.equal(resumed.task,resumeEvent.details.task);assert(resumed.breakpointM>0);assert(Math.abs(resumed.breakpointM-resumeEvent.details.offset_m)<0.001);assert.equal(frame().replayTime,resumeEvent.replayTime);
 result.push({type:'WORK_START_RESUMED',time:frame().time,task:resumed.task,breakpointM:resumed.breakpointM});
 return result;
});
check('robot fault hold and explicit operator clearance are visible and seekable',()=>{
 selectScenario('robot_fault');click(chapter('ROBOT_FAULT'));const before=frame();
 assert.equal(before.status,'WAITING_RECOVERY');assert.equal($('recoveryNote').hidden,false);assert($('recoveryText').textContent.includes('clear_fault'));assert.equal(assertRobotFsm().state,'FAULT');
 click(chapter('FAULT_CLEARED'));const after=frame();assert.equal(after.status,'RUNNING');assert.equal(after.time,before.time);assert.equal(after.replayTime-before.replayTime,12);assert.equal($('recoveryNote').hidden,true);assert.notEqual(assertRobotFsm().state,'FAULT');assert($('farmEvents').textContent.includes('生成脚本模拟操作员确认'));
 return {simulationTime:before.time,presentationWaitSeconds:after.replayTime-before.replayTime};
});
check('blocked route hold and explicit route clearance are visible and seekable',()=>{
 selectScenario('blocked_return');click(chapter('ROUTE_BLOCKED'));const before=frame();
 assert.equal(before.status,'WAITING_RECOVERY');assert.equal(before.routeBlocked,true);assert.equal($('recoveryNote').hidden,false);assert($('corridorOwner').textContent.includes('阻塞'));assert($('recoveryText').textContent.includes('clear_route'));
 click(chapter('ROUTE_CLEARED'));const after=frame();assert.equal(after.status,'RUNNING');assert.equal(after.routeBlocked,false);assert.equal(after.time,before.time);assert.equal(after.replayTime-before.replayTime,12);assert.equal($('recoveryNote').hidden,true);assertRobotFsm();
 return {simulationTime:before.time,presentationWaitSeconds:after.replayTime-before.replayTime};
});
check('all five final chapters show complete strips and all robots aboard',()=>{
 const result=[];
 for(const meta of w.FarmReplay.scenarios){selectScenario(meta.id);click(chapter('MISSION_COMPLETE'));const f=frame();assert.equal(f.status,'COMPLETED');assert.equal(f.coverage.fraction,1);assert.equal(f.carrier.onboard.length,3);assert.equal($('coverageMeter').value,1);assert.equal($('missionStatus').textContent,'任务已完成');assert.equal(assertRobotFsm().state,'ONBOARD');result.push(meta.id);}
 click(d.querySelector('[data-fsm-mode="carrier"]'));assert.equal($('farmFsm').querySelectorAll('.fg-state').length,6);assert.equal($('farmFsm').querySelector('.fg-state.fg-current').dataset.state,'AT_DEPOT');
 click(d.querySelector('[data-fsm-mode="robot"]'));assert.equal($('farmFsm').querySelectorAll('.fg-state').length,13);assertRobotFsm();return result;
});
check('reset returns to scenario start and keeps original low battery parameters',()=>{
 selectScenario('low_battery');seek(1000);click($('replayReset'));const f=frame();assert.equal(f.time,0);assert.equal(f.status,'RUNNING');assert.equal(f.carrier.state,'TRANSIT_TO_FIELD');assert.equal(f.robots[0].battery,30);assert.equal(Number($('farmTimeline').value),0);assert.equal($('replayPlay').textContent,'播放');assertRobotFsm();
 return {time:f.time,robot1BatteryPercent:f.robots[0].battery};
});
check('mission and Agent trees switch, collapse, expand and inspect actual nodes',()=>{
 click(d.querySelector('[data-tree-mode="mission"]'));assert.equal($('farmTree').querySelectorAll('.fg-node').length,walkTree(w.FarmDecisionModel.mission).length);
 click($('collapseTree'));assert($('farmTree').querySelectorAll('.fg-children[hidden]').length>0);
 click($('expandTree'));assert.equal($('farmTree').querySelectorAll('.fg-children[hidden]').length,0);
 click(d.querySelector('[data-tree-mode="agent"]'));assert.equal($('farmTree').querySelectorAll('.fg-node').length,walkTree(w.FarmDecisionModel.agent).length);
 const node=$('farmTree').querySelector('.fg-node[data-node="battery"]');click(node);assert.equal(node.getAttribute('aria-pressed'),'true');assert($('farmInspector').textContent.includes('触发条件'));assert($('farmInspector').textContent.includes('行动与结果'));assert($('farmInspector').textContent.includes('实现位置'));
 const result={missionNodes:walkTree(w.FarmDecisionModel.mission).length,agentNodes:walkTree(w.FarmDecisionModel.agent).length,selectedNode:'battery'};
 click(d.querySelector('[data-tree-mode="mission"]'));return result;
});
check('state clicks and keyboard activation explain the selected state without changing actual state',()=>{
 const actual=frame().robots.find(r=>r.id===selectedRobot()).state;
 const working=$('farmFsm').querySelector('.fg-state[data-state="WORKING"]');working.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(working.getAttribute('aria-pressed'),'true');assert($('farmFsm').querySelector('.fg-fsm-detail').textContent.includes('WORKING'));assert($('farmInspector').textContent.includes('状态职责'));assert.equal($('farmFsm').querySelector('.fg-current').dataset.state,actual);
 const fault=$('farmFsm').querySelector('.fg-state[data-state="FAULT"]');fault.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(fault.getAttribute('aria-pressed'),'true');assert($('farmFsm').querySelector('.fg-fsm-detail').textContent.includes('FAULT'));assert.equal($('farmFsm').querySelector('.fg-current').dataset.state,actual);return {actualState:actual,inspectedStates:['WORKING','FAULT']};
});
check('event filter follows the selected robot and events seek back to their recorded times',()=>{
 selectScenario('normal');seek(2000);$('filterAgentEvents').checked=true;$('filterAgentEvents').dispatchEvent(new w.Event('change',{bubbles:true}));
 for(const id of ['robot_1','robot_2','robot_3']){
  click(d.querySelector('[data-robot="'+id+'"]'));const rows=[...$('farmEvents').querySelectorAll('.farm-event-row')];assert(rows.length>0);assert(rows.every(r=>r.querySelector('strong').textContent==='R0'+id.slice(-1)));
 }
 const row=$('farmEvents').querySelector('.farm-event-row');const expected=w.FarmReplay.getEvents('normal').slice(0,frame().eventIndex).filter(e=>e.actor===selectedRobot()).at(-1);click(row);assert.equal(frame().replayTime,expected.replayTime);assertRobotFsm();
 $('filterAgentEvents').checked=false;$('filterAgentEvents').dispatchEvent(new w.Event('change',{bubbles:true}));return {selectedRobot:selectedRobot(),selectedEvent:expected.type,time:frame().time};
});
check('controlled RAF playback advances and pause prevents further advance',()=>{
 selectScenario('normal');seek(600);change($('farmSpeed'),60);click($('replayPlay'));assert.equal($('replayPlay').textContent,'暂停');runRaf(1000);runRaf(1100);runRaf(1200);const advanced=Number($('farmTimeline').value);assert(advanced>600);assert(frame().time>600);assertRobotFsm();click($('replayPlay'));assert.equal($('replayPlay').textContent,'播放');runRaf(1300);assert.equal(Number($('farmTimeline').value),advanced);return {startTime:600,advancedReplayTime:advanced};
});
check('map keyboard selection, layer toggles and zoom handlers execute without DOM errors',()=>{
 $('farmMap').dispatchEvent(new w.KeyboardEvent('keydown',{key:'1',bubbles:true,cancelable:true}));assert.equal(selectedRobot(),'robot_1');assertRobotFsm();const before=drawCalls;
 for(const id of ['showStrips','showTrails','showLabels']){const input=$(id);input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}));}
 for(const id of ['zoomIn','zoomOut','zoomFit'])click($(id));assert(drawCalls>before);return {drawingCommandsIssued:true,pixelsVerified:false};
});
check('no uncaught script or DOM event errors',()=>{assert.deepEqual(runtimeErrors,[]);return {runtimeErrors:runtimeErrors.length};});

const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={passed:checks.every(c=>c.passed),method:'Node + jsdom DOM integration; production HTML and scripts evaluated',environment:{node:process.version,jsdom:require(path.join(path.dirname(require.resolve(loadedFrom)),'../package.json')).version},limitations,stubs:['CanvasRenderingContext2D drawing calls','canvas bounding rectangle 700 x 480','ResizeObserver','matchMedia false','requestAnimationFrame controlled clock','scrollIntoView','setPointerCapture','blob URL creation'],checkCount:checks.length,passedCount:checks.filter(c=>c.passed).length,failedCount:checks.filter(c=>!c.passed).length,checks,inputSha256:Object.fromEntries(['farm-carrier.html',...scripts].map(file=>[file,sha(path.join(root,file))]))};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));dom.window.close();process.exitCode=report.passed?0:1;
