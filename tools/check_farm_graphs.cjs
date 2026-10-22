#!/usr/bin/env node
'use strict';
// Read-only model/replay validation, plus one generated JSON report. No browser or dependencies.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const report = {
  schemaVersion: 1,
  validationType: 'static source/model contracts and deterministic replay-to-highlight mapping',
  browserExecuted: false,
  limitation: 'Does not verify browser DOM rendering, Canvas appearance, responsive layout or pointer interactions.',
  checks,
  passed: false
};
function check(name, run) {
  try {const result = run(); checks.push({name, passed:true, details:result || null});}
  catch (error) {checks.push({name, passed:false, error:error.message});}
}
const context = vm.createContext({window:{}});
let model, replay, graph;
check('JavaScript syntax and data-module loading', () => {
  const files = ['assets/data/farm-decision-model.js','assets/farm-graphs.js','assets/data/farm-replays.js'];
  for (const file of files) new vm.Script(read(file), {filename:file}).runInContext(context);
  new vm.Script(read('assets/farm.js'), {filename:'assets/farm.js'});
  model = context.window.FarmDecisionModel;
  replay = context.window.FarmReplay;
  graph = context.window.FarmGraphs;
  assert.equal(typeof graph.mount,'function');
  assert.equal(typeof graph.getActiveNodeIds,'function');
  return {loaded:files,syntaxOnly:['assets/farm.js']};
});
function walk(node, result=[]) {result.push(node);node.children.forEach(child=>walk(child,result));return result;}
let nodes = [], ids = new Set();
check('Decision-tree unique IDs and complete explanation fields', () => {
  const mission=walk(model.mission), agent=walk(model.agent);nodes=mission.concat(agent);ids=new Set(nodes.map(n=>n.id));
  assert.equal(ids.size,nodes.length);
  for (const n of nodes) for (const key of ['id','label','kind','guard','action','source']) assert.ok(typeof n[key]==='string'&&n[key].length>0,n.id+': missing '+key);
  return {missionNodes:mission.length,agentNodes:agent.length,total:nodes.length};
});
check('FSM counts and edge endpoints', () => {
  const result={};
  for (const type of ['robot','carrier']) {
    const states=model[type].states, edges=model[type].edges, stateIds=new Set(states.map(s=>s.id));
    assert.equal(stateIds.size,states.length);
    assert.equal(states.length,type==='robot'?13:6);
    for (const e of edges) {
      assert.ok(stateIds.has(e.from)||e.from==='ANY',type+': '+e.from);
      assert.ok(stateIds.has(e.to)||e.to==='PREVIOUS',type+': '+e.to);
      assert.ok(e.label&&e.source);
    }
    result[type]={states:states.length,transitionRules:edges.length};
  }
  return result;
});
check('Java source fingerprint, referenced methods and state names', () => {
  const source=read('assets/source/MissionEngine.java');
  const sha256=crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(model.sourceSha256,sha256,'The explanation model must be reviewed when source changes.');
  const methods=new Set();
  for (const item of [...nodes,...model.robot.states,...model.carrier.states,...model.robot.edges,...model.carrier.edges]) {
    for (const match of item.source.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\(\)/g)) {
      methods.add(match[1]);assert.ok(source.includes(match[1]+'('),'Missing source method '+match[1]);
    }
  }
  const robotStates=new Set([...source.matchAll(/r\.state(?:\s*=\s*|\s*\.equals\(\s*)"([A-Z_]+)"/g)].map(m=>m[1]));
  const carrierStates=new Set([...source.matchAll(/carrierState(?:\s*=\s*|\s*\.equals\(\s*)"([A-Z_]+)"/g)].map(m=>m[1]));
  assert.deepEqual([...robotStates].sort(),Array.from(model.robot.states,s=>s.id).sort());
  assert.deepEqual([...carrierStates].sort(),Array.from(model.carrier.states,s=>s.id).sort());
  return {sha256,referencedMethodCount:methods.size,robotStateNames:[...robotStates].sort(),carrierStateNames:[...carrierStates].sort()};
});
check('Page script order, literal element IDs and replay API contract', () => {
  const html=read('farm-carrier.html'), app=read('assets/farm.js');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1]);
  const expected=['assets/data/farm-replays.js','assets/data/farm-decision-model.js','assets/farm-graphs.js','assets/farm.js'];
  assert.deepEqual(scripts.filter(s=>expected.includes(s)),expected);
  scripts.forEach(file=>assert.ok(fs.existsSync(path.join(root,file)),file+' missing'));
  const pageIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]), pageIdSet=new Set(pageIds);
  assert.equal(pageIdSet.size,pageIds.length,'Duplicate HTML id');
  const literalIds=new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m=>m[1]));
  for(const prefix of ['battery','material','cargo']) for(const suffix of ['Value','Meter'])literalIds.add(prefix+suffix);
  for(const id of literalIds)assert.ok(pageIdSet.has(id),'Missing page element '+id);
  for(const name of ['getScenario','getFrames','getEvents','getChapters','getFrameAtTime'])assert.equal(typeof replay[name],'function',name+' absent');
  return {checkedElementIds:literalIds.size,scriptOrder:scripts};
});
check('All replay states and selected-agent highlights resolve to model nodes', () => {
  const robotStates=new Set(model.robot.states.map(s=>s.id)), carrierStates=new Set(model.carrier.states.map(s=>s.id));
  const observed=new Set(), pausedAllowed=new Set(['mission','mission_gate','route_lock','fault_lock','agent_root','robot_fault','work_fault_injection','return_lock']);
  let frames=0, robotEvaluations=0, pausedFrames=0, workingFrames=0;
  const scenarios=[];
  for(const scenario of replay.scenarios) {
    let count=0,holds=0;
    for(const f of replay.getFrames(scenario.id)) {
      frames++;count++;assert.ok(carrierStates.has(f.carrier.state));
      if(f.status==='WAITING_RECOVERY'){pausedFrames++;holds++;}
      for(const r of f.robots) {
        observed.add(r.state);assert.ok(robotStates.has(r.state),r.state);robotEvaluations++;
        const active=new Set(graph.getActiveNodeIds(f,r.id));for(const id of active)assert.ok(ids.has(id),'Unknown highlight id '+id);
        if(f.status==='WAITING_RECOVERY') {
          for(const id of active)assert.ok(pausedAllowed.has(id),'Frozen mission must not highlight ongoing action '+id);
          assert.ok(active.has('mission_gate'));
          if(f.routeBlocked)assert.ok(active.has('route_lock'));
          if(r.state==='FAULT')assert.ok(active.has('robot_fault'));
        } else if(f.status==='RUNNING'&&r.state==='WORKING') {
          workingFrames++;assert.ok(active.has('working'));assert.ok(active.has('work_step'));
        }
      }
    }
    scenarios.push({id:scenario.id,frames:count,pausedFrames:holds});
  }
  assert.ok(pausedFrames>0,'Expected real recovery snapshots');assert.ok(workingFrames>0);
  return {frames,robotEvaluations,pausedFrames,workingFrames,scenarios,observedRobotStates:[...observed].sort(),unobservedRobotStates:[...robotStates].filter(s=>!observed.has(s)),note:'No adjacent-frame edge assertion: a core step can contain transient states such as WAIT_LOAD immediately followed by LOADING. The complete event log preserves those actions.'};
});
report.passed=checks.every(c=>c.passed);
report.summary={passed:checks.filter(c=>c.passed).length,total:checks.length};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/farm-graph-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
