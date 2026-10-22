(function (global) {
  'use strict';
  var M = global.FarmDecisionModel;
  var SVG = 'http://www.w3.org/2000/svg';
  var kinds = {root:'调度',guard:'条件',sequence:'顺序',selector:'选择',action:'动作',resource:'互斥',terminal:'终态'};
  function el(tag, cls, text) { var n=document.createElement(tag); if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; }
  function sv(tag, attrs) {var n=document.createElementNS(SVG,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});return n;}
  function list(root,out) {out.push(root);root.children.forEach(function(n){list(n,out);});return out;}
  function num(v){return typeof v==='number'&&isFinite(v)?v.toFixed(1):'—';}
  function deriveActive(frame,robotId){
      var f=frame,r=f&&f.robots?(f.robots.find(function(x){return x.id===robotId;})||f.robots[0]):null,a=new Set();if(!f)return a;
      var c=f.carrier||{},rs=f.robots||[],cs=c.state,s=r&&r.state,reason=r&&r.returnReason;
      var inReturn=['WAIT_RETURN_CORRIDOR','RETURNING','WAIT_SERVICE','SERVICING','WAIT_LOAD'].indexOf(s)>=0;
      function add(key,cond){if(cond)a.add(key);}
      function any(arr){return rs.some(function(x){return arr.indexOf(x.state)>=0;});}
      add('mission',true);add('mission_gate',f.status!=='RUNNING');add('route_lock',!!f.routeBlocked);add('fault_lock',any(['FAULT']));add('failed',f.status==='FAILED');add('terminal',f.status==='COMPLETED'||f.status==='CANCELLED');
      if(f.status!=='RUNNING'){add('agent_root',true);add('robot_fault',r&&r.state==='FAULT');add('work_fault_injection',r&&r.state==='FAULT'&&f.scenario==='robot_fault');add('return_lock',!!f.routeBlocked);return a;}
      add('carrier_transit',/^TRANSIT/.test(cs));add('to_field',cs==='TRANSIT_TO_FIELD');add('to_depot',cs==='TRANSIT_TO_DEPOT');add('field_cycle',['DEPLOYING','OPERATING','COLLECTING'].indexOf(cs)>=0&&f.status==='RUNNING');
      add('handling',!!c.handlingRobot);add('unloading',any(['UNLOADING']));add('loading',any(['LOADING']));add('deploy',cs==='DEPLOYING');add('agents',rs.some(function(x){return !x.onboard&&['LOADING','UNLOADING'].indexOf(x.state)<0;}));
      add('agent_assign',any(['READY','WAIT_CORRIDOR']));add('agent_work',any(['TO_WORK','WORKING']));add('agent_return',any(['RETURNING','WAIT_RETURN_CORRIDOR']));add('bay',!!f.bayOwner||!!c.serviceRobot||(f.queue||[]).length>0);add('bay_queue',(f.queue||[]).length>0);add('bay_transfer',any(['SERVICING']));add('bay_release',false);
      var map=f.map||(global.FarmReplay&&global.FarmReplay.map),firstField=map&&map.fields&&map.fields[0];
      add('collect',any(['WAIT_LOAD','LOADING']));add('depart_guard',cs==='COLLECTING'||cs==='TRANSIT_TO_DEPOT');add('next_field',cs==='TRANSIT_TO_FIELD'&&firstField&&f.fieldId&&f.fieldId!==firstField.id);add('return_depot',cs==='TRANSIT_TO_DEPOT');add('invariants',f.status==='RUNNING'||f.status==='COMPLETED');
      if(!r)return a;
      var strip=(f.coverage&&f.coverage.strips||[]).find(function(t){return t.id===r.task;});
      add('agent_root',true);add('robot_fault',s==='FAULT');add('robot_handling',['ONBOARD','UNLOADING','LOADING'].indexOf(s)>=0);add('ready',s==='READY');add('ready_recall',s==='READY'&&reason==='RECALL');add('task',s==='READY');add('task_none',inReturn&&reason==='WORK_COMPLETE');add('task_select',s==='READY'&&strip&&strip.state==='ASSIGNED');add('precheck',s==='READY');
      add('precheck_service',['WAIT_SERVICE','SERVICING'].indexOf(s)>=0&&reason==='PRECHECK');add('corridor_out',s==='WAIT_CORRIDOR'||s==='TO_WORK'&&f.corridorOwner===r.id);add('inside_move',s==='TO_WORK'&&f.corridorOwner!==r.id);add('wait_out',s==='WAIT_CORRIDOR');add('to_work',s==='TO_WORK');add('transit_return',false);add('reach_work',s==='WORKING');add('working',s==='WORKING');
      add('work_recall',inReturn&&reason==='RECALL');add('work_fault_injection',s==='FAULT'&&f.scenario==='robot_fault');add('battery',inReturn&&reason==='LOW_BATTERY');add('material',inReturn&&reason==='LOW_MATERIAL');add('cargo',inReturn&&reason==='CARGO_FULL');add('work_step',s==='WORKING'&&f.status==='RUNNING');add('return',inReturn&&reason!=='PRECHECK');add('save_breakpoint',inReturn&&strip&&strip.state==='SUSPENDED');add('return_lock',!!f.routeBlocked);add('wait_return',s==='WAIT_RETURN_CORRIDOR');add('return_move',s==='RETURNING');add('return_route',['WAIT_LOAD','WAIT_SERVICE'].indexOf(s)>=0&&reason!=='PRECHECK');
      add('service',['WAIT_SERVICE','SERVICING'].indexOf(s)>=0);add('service_wait',s==='WAIT_SERVICE');add('service_run',s==='SERVICING');add('resume',s==='READY'&&Number(r.breakpointM)>0);add('service_final',s==='WAIT_LOAD'&&(reason==='WORK_COMPLETE'||reason==='RECALL'));add('wait_load',['WAIT_LOAD','LOADING'].indexOf(s)>=0);
      return a;
    }

  function mount(options) {
    if(!M)throw new Error('farm-decision-model.js must load before farm-graphs.js');
    var treeRoot=options.treeRoot, fsmRoot=options.fsmRoot, inspectorRoot=options.inspectorRoot;
    if(!treeRoot||!fsmRoot||!inspectorRoot)throw new Error('FarmGraphs requires treeRoot, fsmRoot and inspectorRoot');
    var state={frame:null,robotId:'robot_1',treeMode:'mission',fsmMode:'robot',selected:{type:'tree',id:'mission'},treeNodes:new Map(),fsmNodes:new Map(),fsmEdges:[],fsmRows:[],closed:new Set(),destroyed:false};
    treeRoot.classList.add('fg-tree-root');fsmRoot.classList.add('fg-fsm-root');inspectorRoot.classList.add('fg-inspector');
    function robot(){var f=state.frame;return f&&f.robots?f.robots.find(function(r){return r.id===state.robotId;})||f.robots[0]:null;}
    function setSelected(type,id){state.selected={type:type,id:id};drawSelection();showInspector();showFsmDetail();}
    function makeTree(n,depth){
      var li=el('li','fg-branch'),row=el('div','fg-tree-row'),childList=null;
      li.dataset.node=n.id;
      var toggle=el('button','fg-toggle');toggle.type='button';toggle.setAttribute('aria-label','展开或收起：'+n.label);
      if(n.children.length){toggle.textContent='−';toggle.setAttribute('aria-expanded','true');toggle.addEventListener('click',function(){setClosed(n.id,!state.closed.has(n.id));});}
      else{toggle.classList.add('fg-toggle-empty');toggle.tabIndex=-1;toggle.disabled=true;toggle.setAttribute('aria-hidden','true');}
      var button=el('button','fg-node');button.type='button';button.dataset.node=n.id;
      var top=el('span','fg-node-top');top.appendChild(el('span','fg-kind fg-kind-'+n.kind,kinds[n.kind]||n.kind));top.appendChild(el('span','fg-node-label',n.label));
      var activeLabel=el('span','fg-now','当前');activeLabel.setAttribute('aria-hidden','true');top.appendChild(activeLabel);
      button.appendChild(top);button.appendChild(el('span','fg-node-summary',n.summary));button.addEventListener('click',function(){setSelected('tree',n.id);});
      row.appendChild(toggle);row.appendChild(button);li.appendChild(row);
      if(n.children.length){childList=el('ul','fg-children');n.children.forEach(function(ch){childList.appendChild(makeTree(ch,depth+1));});li.appendChild(childList);}
      state.treeNodes.set(n.id,{model:n,li:li,button:button,toggle:toggle,children:childList,depth:depth});
      return li;
    }
    function setClosed(id,closed){var v=state.treeNodes.get(id);if(!v||!v.children)return;if(closed)state.closed.add(id);else state.closed.delete(id);v.children.hidden=closed;v.toggle.textContent=closed?'+':'−';v.toggle.setAttribute('aria-expanded',String(!closed));v.li.classList.toggle('fg-collapsed',closed);}
    function drawTree(){
      state.treeNodes.clear();treeRoot.replaceChildren();var note=el('p','fg-tree-note','连线表示规则层次；“当前”标出快照对应分支。点击任意节点查看条件、动作与源码。');note.dataset.baseNote=note.textContent;treeRoot.appendChild(note);
      var scroll=el('div','fg-tree-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label',(state.treeMode==='mission'?'整体调度':'Robot Agent')+'完整决策树，可滚动');
      var ul=el('ul','fg-tree');ul.appendChild(makeTree(M[state.treeMode],0));scroll.appendChild(ul);treeRoot.appendChild(scroll);
      state.treeNodes.forEach(function(v,id){if(state.closed.has(id))setClosed(id,true);});
      var count=list(M[state.treeMode],[]).length;treeRoot.appendChild(el('p','fg-caption',count+' 个解释节点 · 所有分支均可展开 · Java 规则 / FSM 为实际实现'));
      applyActive();drawSelection();
    }
    function defaultPath(a,b){
      var dx=b.x-a.x,dy=b.y-a.y;
      if(Math.abs(dx)>Math.abs(dy)){var sx=a.x+(dx>0?100:-100),tx=b.x+(dx>0?-100:100);if(Math.abs(dy)<3)return'M '+sx+' '+a.y+' L '+tx+' '+b.y;var mx=(sx+tx)/2;return'M '+sx+' '+a.y+' C '+mx+' '+a.y+', '+mx+' '+b.y+', '+tx+' '+b.y;}
      var sy=a.y+(dy>0?32:-32),ty=b.y+(dy>0?-32:32);if(Math.abs(dx)<3)return'M '+a.x+' '+sy+' L '+b.x+' '+ty;var my=(sy+ty)/2;return'M '+a.x+' '+sy+' C '+a.x+' '+my+', '+b.x+' '+my+', '+b.x+' '+ty;
    }
    function drawFsm(){
      fsmRoot.replaceChildren();state.fsmNodes.clear();state.fsmEdges=[];state.fsmRows=[];
      var model=M[state.fsmMode],isRobot=state.fsmMode==='robot';
      var caption=el('p','fg-fsm-note',isRobot?'13 个机器人执行状态。实线为正常条件转换，虚线为召回等中断路径。故障可打断任意状态，并保存故障前状态。':'6 个母车执行状态。母车离开地块前，必须同时满足全员在车上和坡道空闲。');caption.dataset.baseNote=caption.textContent;fsmRoot.appendChild(caption);
      var scroll=el('div','fg-fsm-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','状态机图，可在窄屏左右滚动');
      var svg=sv('svg',{viewBox:isRobot?'0 0 840 635':'0 0 660 495',role:'group','aria-label':isRobot?'Robot Agent 有限状态机':'Carrier 有限状态机',class:'fg-fsm-svg'});
      var defs=sv('defs'),marker=sv('marker',{id:'fg-arrow-'+state.fsmMode,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.appendChild(sv('path',{d:'M 1 1 L 9 5 L 1 9 z',fill:'context-stroke'}));defs.appendChild(marker);svg.appendChild(defs);
      var lookup=new Map();model.states.forEach(function(s){lookup.set(s.id,s);});
      model.edges.forEach(function(e,index){
        var from=lookup.get(e.from),to=lookup.get(e.to);if(!from||!to)return;
        var path=sv('path',{d:e.path||defaultPath(from,to),class:'fg-edge'+(e.kind==='exception'?' fg-edge-exception':''),'marker-end':'url(#fg-arrow-'+state.fsmMode+')'});var title=sv('title');title.textContent=e.from+' → '+e.to+'：'+e.label;path.appendChild(title);svg.appendChild(path);state.fsmEdges.push({el:path,edge:e,index:index});
      });
      if(isRobot){var rule=sv('path',{d:'M 45 535 L 45 565 L 290 565 M 490 565 L 785 565 L 785 535',class:'fg-interrupt-rule'});svg.appendChild(rule);var text=sv('text',{x:420,y:617,'text-anchor':'middle',class:'fg-interrupt-text'});text.textContent='任意状态 → FAULT · clear_fault → previousState · 其他恢复锁也必须解除';svg.appendChild(text);}
      model.states.forEach(function(s){
        var g=sv('g',{transform:'translate('+(s.x-100)+','+(s.y-32)+')',class:'fg-state',role:'button',tabindex:0,'data-state':s.id,'aria-label':s.label+'，'+s.id+'。点击查看转换条件'});
        g.appendChild(sv('rect',{width:200,height:64,rx:8}));var title=sv('text',{x:100,y:25,'text-anchor':'middle',class:'fg-state-label'});title.textContent=s.label;g.appendChild(title);var id=sv('text',{x:100,y:46,'text-anchor':'middle',class:'fg-state-id'});id.textContent=s.id;g.appendChild(id);
        var dot=sv('circle',{cx:185,cy:12,r:4,class:'fg-state-dot'});g.appendChild(dot);
        function select(){setSelected('state',s.id);}g.addEventListener('click',select);g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});svg.appendChild(g);state.fsmNodes.set(s.id,g);
      });
      scroll.appendChild(svg);fsmRoot.appendChild(scroll);
      var legend=el('div','fg-legend');legend.appendChild(el('span','fg-legend-current','当前真实状态'));legend.appendChild(el('span','fg-legend-selected','已选中查看'));legend.appendChild(el('span','fg-legend-edge','箭头代表允许的条件转换，不是每帧执行轨迹'));fsmRoot.appendChild(legend);
      fsmRoot.appendChild(el('div','fg-fsm-detail','点击状态节点，查看它的职责和所有后续转换。'));
      var detail=el('details','fg-edge-index'),summary=el('summary',null,'查看完整转换表（'+model.edges.length+' 条规则）');detail.appendChild(summary);
      var tableWrap=el('div','fg-edge-table-wrap'),table=el('table','fg-edge-table'),thead=el('thead'),tr=el('tr');['起始状态','后续状态','触发条件 / 事件','源码方法'].forEach(function(label){tr.appendChild(el('th',null,label));});thead.appendChild(tr);table.appendChild(thead);var body=el('tbody');
      model.edges.forEach(function(e){var row=el('tr');row.appendChild(el('td','fg-code',e.from));row.appendChild(el('td','fg-code',e.to));row.appendChild(el('td',null,e.label));row.appendChild(el('td','fg-code',e.source));body.appendChild(row);state.fsmRows.push({el:row,edge:e});});table.appendChild(body);tableWrap.appendChild(table);detail.appendChild(tableWrap);detail.appendChild(el('p','fg-caption','ANY / PREVIOUS 表示故障中断及恢复；人工召回在 command() 中还会根据当前位置、货箱和资源占用调用统一返航分支。'));fsmRoot.appendChild(detail);
      applyActive();drawSelection();showFsmDetail();
    }
    function showFsmDetail(){
      var target=fsmRoot.querySelector('.fg-fsm-detail');if(!target||state.selected.type!=='state')return;
      var n=M[state.fsmMode].states.find(function(s){return s.id===state.selected.id;});if(!n)return;
      target.replaceChildren();target.appendChild(el('strong',null,n.label+' · '+n.id));target.appendChild(el('p',null,n.description));
      var edges=M[state.fsmMode].edges.filter(function(e){return e.from===n.id;});var ul=el('ul');edges.forEach(function(e){ul.appendChild(el('li',null,e.to+'：'+e.label));});
      if(state.fsmMode==='robot'&&n.id!=='FAULT')ul.appendChild(el('li',null,'FAULT：显式故障中断保存本状态；clear_fault 后恢复，并检查所有恢复锁。'));
      if(edges.length||state.fsmMode==='robot')target.appendChild(ul);target.appendChild(el('code',null,n.source));
    }
    function applyActive(){
      var frozen=!!state.frame&&state.frame.status==='WAITING_RECOVERY';
      [treeRoot,fsmRoot].forEach(function(root){root.classList.toggle('fg-frozen',frozen);});
      [treeRoot.querySelector('.fg-tree-note'),fsmRoot.querySelector('.fg-fsm-note')].forEach(function(note){if(note){var message=(frozen?'任务时钟冻结：保留各 Agent 状态，所有动作均未推进。 ':'')+note.dataset.baseNote;if(note.textContent!==message)note.textContent=message;}});
      var active=deriveActive(state.frame,state.robotId);state.treeNodes.forEach(function(v,id){var on=active.has(id);v.button.classList.toggle('fg-active',on);v.button.dataset.active=String(on);var hasChild=list(v.model,[]).some(function(n){return active.has(n.id);});v.li.classList.toggle('fg-active-descendant',hasChild);});
      var f=state.frame,r=robot(),current=state.fsmMode==='carrier'?f&&f.carrier&&f.carrier.state:r&&r.state;var selected=state.selected.type==='state'?state.selected.id:null;
      state.fsmNodes.forEach(function(g,id){g.classList.toggle('fg-current',id===current);g.setAttribute('aria-label',(M[state.fsmMode].states.find(function(s){return s.id===id;})||{label:id}).label+'，'+id+(id===current?'，当前真实状态':'')+'。点击查看转换条件');});
      state.fsmEdges.forEach(function(v){v.el.classList.toggle('fg-edge-current',v.edge.from===current&&f&&f.status==='RUNNING');v.el.classList.toggle('fg-edge-focus',v.edge.from===selected);});
      state.fsmRows.forEach(function(v){v.el.classList.toggle('fg-row-current',v.edge.from===current);});
      var context=inspectorRoot.querySelector('.fg-current-context');if(context)context.textContent=contextText();
    }
    function contextText(){var f=state.frame,r=robot();if(!f)return'等待实际回放快照';return'仿真 '+num(f.time)+' s · '+f.status+(f.status==='WAITING_RECOVERY'?'（时钟冻结 / 状态保留）':'')+' · '+(r?r.id+' / '+r.state:'');}
    function drawSelection(){
      state.treeNodes.forEach(function(v,id){var yes=state.selected.type==='tree'&&state.selected.id===id;v.button.classList.toggle('fg-selected',yes);v.button.setAttribute('aria-pressed',String(yes));});
      state.fsmNodes.forEach(function(g,id){var yes=state.selected.type==='state'&&state.selected.id===id;g.classList.toggle('fg-selected',yes);g.setAttribute('aria-pressed',String(yes));});applyActive();
    }
    function showInspector(){
      var sel=state.selected,n=sel.type==='tree'?list(M.mission,[]).concat(list(M.agent,[])).find(function(v){return v.id===sel.id;}):M[state.fsmMode].states.find(function(v){return v.id===sel.id;});
      if(!n)return;inspectorRoot.replaceChildren();inspectorRoot.appendChild(el('p','fg-inspector-eyebrow',sel.type==='tree'?'DECISION NODE · 决策节点':'STATE NODE · 执行状态'));inspectorRoot.appendChild(el('h3','fg-inspector-title',n.label));
      inspectorRoot.appendChild(el('div','fg-inspector-id',n.id));
      function section(title,text){inspectorRoot.appendChild(el('h4',null,title));inspectorRoot.appendChild(el('p',null,text));}
      if(sel.type==='tree'){section('触发条件',n.guard);section('行动与结果',n.action);}
      else{
        section('状态职责',n.description);var edges=M[state.fsmMode].edges.filter(function(e){return e.from===n.id;});inspectorRoot.appendChild(el('h4',null,'后续转换'));
        var ul=el('ul','fg-inspector-transitions');edges.forEach(function(e){var li=el('li');var target=el('button','fg-target-link',e.to);target.type='button';target.disabled=!M[state.fsmMode].states.some(function(s){return s.id===e.to;});target.addEventListener('click',function(){setSelected('state',e.to);});li.appendChild(target);li.appendChild(el('span',null,' — '+e.label));ul.appendChild(li);});if(!edges.length)ul.appendChild(el('li',null,'任务终点；结果由 finishMission() 判定。'));inspectorRoot.appendChild(ul);
        if(state.fsmMode==='robot'&&n.id!=='FAULT')section('全局中断','fault_robot 可进入 FAULT，保存本状态；clear_fault 恢复后仍检查道路及其他设备锁。');
      }
      inspectorRoot.appendChild(el('h4',null,'实现位置'));inspectorRoot.appendChild(el('code','fg-source-method',n.source));var source=el('a','fg-source-link','查看 Java 核心源码 ↗');source.href='assets/source/MissionEngine.java';source.target='_blank';source.rel='noopener';inspectorRoot.appendChild(source);
      inspectorRoot.appendChild(el('p','fg-current-context',contextText()));inspectorRoot.appendChild(el('p','fg-inspector-caveat','状态与高亮来自回放快照。此处的行为树是完整规则的解释视图，不记录或执行 BT 的返回状态。'));
    }
    drawTree();drawFsm();showInspector();
    return {
      update:function(frame,robotId){if(state.destroyed)return;state.frame=frame;if(robotId)state.robotId=robotId;applyActive();},
      setTreeMode:function(mode){if(mode!=='mission'&&mode!=='agent')return;state.treeMode=mode;state.selected={type:'tree',id:mode==='mission'?'mission':'agent_root'};drawTree();showInspector();},
      setFsmMode:function(mode){if(mode!=='robot'&&mode!=='carrier')return;state.fsmMode=mode;var r=robot(),f=state.frame;state.selected={type:'state',id:mode==='robot'?(r?r.state:'ONBOARD'):(f&&f.carrier?f.carrier.state:'TRANSIT_TO_FIELD')};drawFsm();showInspector();},
      expandAll:function(){state.treeNodes.forEach(function(v,id){setClosed(id,false);});},
      collapseAll:function(){state.treeNodes.forEach(function(v,id){if(v.depth>0)setClosed(id,true);else setClosed(id,false);});},
      selectNode:function(id){if(state.treeNodes.has(id)){setSelected('tree',id);var v=state.treeNodes.get(id);var parent=v.li.parentElement;while(parent&&parent!==treeRoot){if(parent.classList.contains('fg-branch'))setClosed(parent.dataset.node,false);parent=parent.parentElement;}v.button.scrollIntoView({block:'nearest',behavior:'smooth'});}},
      getModel:function(){return M;},
      destroy:function(){state.destroyed=true;treeRoot.replaceChildren();fsmRoot.replaceChildren();inspectorRoot.replaceChildren();}
    };
  }
  global.FarmGraphs={mount:mount,getActiveNodeIds:function(frame,robotId){return Array.from(deriveActive(frame,robotId));}};
})(window);
