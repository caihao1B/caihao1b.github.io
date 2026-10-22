#!/usr/bin/env node
'use strict';
// Contract checks use every exported frame, including pause and recovery holds.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const site=path.resolve(__dirname,'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(site,'assets/data/farm-replays.js'),'utf8'),context);
const api=context.window.FarmReplay;
const results=[];
for(const s of api.scenarios){
 const frames=api.getFrames(s.id),events=api.getEvents(s.id);
 assert.equal(frames.length,s.frameCount);
 const first=frames[0],last=frames.at(-1);
 assert.equal(first.time,0);assert.equal(last.status,'COMPLETED');
 assert.equal(last.carrier.state,'AT_DEPOT');assert.equal(last.carrier.onboard.length,3);
 assert.equal(last.coverage.fraction,1);assert.equal(last.coverage.completed,last.coverage.total);
 assert(last.coverage.strips.every(x=>x.state==='COMPLETED'&&x.completed===x.total));
 let previousEvents=0,lastTime=-1;
 for(const f of frames){
  assert(f.replayTime>lastTime);lastTime=f.replayTime;
  assert(f.eventIndex>=previousEvents&&f.eventIndex<=events.length);previousEvents=f.eventIndex;
  assert.equal(f.robots.length,3);
  assert(f.robots.every(r=>r.battery>=0&&r.battery<=100&&r.material>=0&&r.material<=100&&r.cargo>=0&&r.cargo<=100));
  assert.equal(f.robots.filter(r=>r.state==='SERVICING').length,f.bayOwner?1:0);
  assert.equal(f.carrier.serviceRobot,f.bayOwner);
  for(const [i,r] of f.robots.entries())assert.equal(r.id,api.robotIds[i]);
  assert.equal(api.getFrameAtTime(s.id,f.replayTime).index,f.index);
  assert(f.coverage.strips.every(x=>x.completed>=0&&x.completed<=x.total));
 }
 assert.equal(last.eventIndex,events.length);
 assert.equal(api.getChapters(s.id).at(-1).type,'MISSION_COMPLETE');
 if(s.operatorActions.length){
  const wait=frames.filter(x=>x.status==='WAITING_RECOVERY');
  assert(wait.length>=12);assert(wait.every(x=>x.time===wait[0].time));
  assert(wait.some(x=>x.scriptedOperator));
 }
 results.push({scenario:s.id,frames:frames.length,events:events.length,duration:s.duration,simulationDuration:s.simulationDuration});
}
const report={passed:true,checks:['API decode','terminal state','complete strips','resource ranges','service ownership','frame binary search','event count','recovery holds'],results,states:api.evidence.allObservedRobotStates};
console.log(JSON.stringify(report,null,2));
const validationPath=path.join(site,'reports/farm-replay-validation.json');
const validation=JSON.parse(fs.readFileSync(validationPath,'utf8'));
validation.browserDataApiCheck=report;
fs.writeFileSync(validationPath,JSON.stringify(validation,null,2)+'\n');
