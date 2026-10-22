import farm.sim.MissionEngine;
import farm.sim.Json;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.lang.reflect.Field;

/**
 * Read-only recording adapter for the unchanged Farm Carrier Java core.
 * Run with JDK 17 source launcher; the core JAR itself remains Java 8.
 * A small reflection probe detects all end-of-tick state transitions without
 * allocating the core's full trail snapshot on every 0.25 s tick. All values
 * written to the recording come from public snapshot()/events()/metrics().
 */
class export_farm_replay {
    static final String[] SCENARIOS={"normal","low_battery","harvest","blocked_return","robot_fault"};
    static final Map<String,Field> FIELDS=new HashMap<String,Field>();
    static Object get(Object target,String name) throws Exception {
        String key=target.getClass().getName()+"."+name;
        Field f=FIELDS.get(key);
        if(f==null){f=target.getClass().getDeclaredField(name);f.setAccessible(true);FIELDS.put(key,f);}
        return f.get(target);
    }
    static String signature(MissionEngine e) throws Exception {
        StringBuilder b=new StringBuilder();
        for(String key:new String[]{"status","carrierState","routeBlocked"})b.append(get(e,key)).append('|');
        for(String key:new String[]{"bayOwner","corridorOwner","handlingRobot"}){
            Object r=get(e,key);b.append(r==null?"-":get(r,"id")).append('|');
        }
        for(Object r:(List<?>)get(e,"robots"))b.append(get(r,"state")).append('/').append(get(r,"onboard")).append('|');
        b.append(((List<?>)get(e,"eventLog")).size());return b.toString();
    }
    static Map<String,Object> obj(Object... pairs){
        Map<String,Object> m=new LinkedHashMap<String,Object>();
        for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;
    }
    @SuppressWarnings("unchecked") static Map<String,Object> map(Object o){return (Map<String,Object>)o;}
    static List<Object> list(Object o){return (List<Object>)o;}
    static double num(Object o){return ((Number)o).doubleValue();}
    static Map<String,Object> record(MissionEngine e,double offset,String action){
        Map<String,Object> f=e.snapshot();
        f.remove("map");f.remove("modelLimits");f.remove("parameters");f.remove("metrics");f.remove("events");
        Map<String,Object> carrier=map(f.get("carrier"));carrier.remove("trail");
        for(Object r:list(f.get("robots"))){map(r).remove("trail");map(r).remove("path");}
        f.put("replayTime",num(f.get("time"))+offset);
        f.put("eventIndex",e.events().size());
        f.put("scriptedOperator",action);
        return f;
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=2)throw new IllegalArgumentException("Usage: export_farm_replay.java MAP_JSON OUTPUT_JSON");
        Map<String,Object> input=Json.object(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
        List<Object> recordings=new ArrayList<Object>();Map<String,Object> first=new MissionEngine(input,"normal",3).snapshot();
        for(String scenario:SCENARIOS){
            MissionEngine e=new MissionEngine(input,scenario,3);
            List<Object> frames=new ArrayList<Object>(),actions=new ArrayList<Object>();
            Map<Integer,Double> eventPlayback=new HashMap<Integer,Double>();
            double offset=0,nextPeriodic=5;String oldSignature=signature(e);int seenEvents=0,steps=0,pauses=0;
            frames.add(record(e,offset,null));
            for(Map<String,Object> ev:e.events()){eventPlayback.put(((Number)ev.get("seq")).intValue(),num(ev.get("time"))+offset);seenEvents++;}
            while(!e.isTerminal()){
                if(++steps>240000)throw new IllegalStateException("Run exceeded bound: "+scenario);
                if(e.status().equals("WAITING_RECOVERY")){
                    if(++pauses>2)throw new IllegalStateException("Unexpected repeated pause: "+scenario);
                    Map<String,Object> before=e.snapshot();
                    double frozenTime=num(before.get("time"));
                    String command=scenario.equals("blocked_return")?"clear_route":"clear_fault";
                    String actor="robot_1";
                    if(command.equals("clear_fault"))for(Object r:list(before.get("robots")))if("FAULT".equals(map(r).get("state")))actor=(String)map(r).get("id");
                    // The 12 seconds below are presentation time, never simulated mission time.
                    // The Java engine remains frozen until the explicit scripted operator call.
                    for(int hold=1;hold<=11;hold++)frames.add(record(e,offset+hold,"WAITING_FOR_SCRIPTED_OPERATOR"));
                    offset+=12;
                    e.tick(1);
                    if(num(e.snapshot().get("time"))!=frozenTime)throw new IllegalStateException("Recovery wait did not freeze core time");
                    e.command(command,actor);
                    actions.add(obj("time",frozenTime,"replayTime",frozenTime+offset,"command",command,"robotId",actor,"source","exporter_scripted_operator","presentationWaitSeconds",12,"message",command.equals("clear_route")?"演示脚本模拟操作员确认通道清除；并非系统自动恢复。":"演示脚本模拟操作员确认设备故障已解除；并非系统自动修复。"));
                    frames.add(record(e,offset,"SCRIPTED_OPERATOR_"+command.toUpperCase(Locale.ROOT)));
                    for(Map<String,Object> ev:e.events()){
                        int seq=((Number)ev.get("seq")).intValue();
                        if(seq>seenEvents){eventPlayback.put(seq,num(ev.get("time"))+offset);seenEvents=seq;}
                    }
                    oldSignature=signature(e);continue;
                }
                e.tick(0.25);double t=num(get(e,"time"));
                String sig=signature(e);
                boolean due=t+1e-8>=nextPeriodic;
                if(due)while(nextPeriodic<=t+1e-8)nextPeriodic+=5;
                if(due||!sig.equals(oldSignature)||e.isTerminal()){
                    frames.add(record(e,offset,null));oldSignature=sig;
                    for(Map<String,Object> ev:e.events()){
                        int seq=((Number)ev.get("seq")).intValue();
                        if(seq>seenEvents){eventPlayback.put(seq,num(ev.get("time"))+offset);seenEvents=seq;}
                    }
                }
            }
            if(!e.status().equals("COMPLETED"))throw new IllegalStateException("Replay did not finish: "+scenario+" "+e.status());
            List<Object> events=new ArrayList<Object>();
            for(Map<String,Object> event:e.events()){
                Map<String,Object> copy=new LinkedHashMap<String,Object>(event);
                copy.put("replayTime",eventPlayback.get(((Number)event.get("seq")).intValue()));events.add(copy);
            }
            recordings.add(obj("id",scenario,"frames",frames,"events",events,"operatorActions",actions,"metrics",e.metrics(),"status",e.status(),"duration",num(e.snapshot().get("time"))+offset,"simulationDuration",e.snapshot().get("time"),"frameCount",frames.size()));
            System.err.println(scenario+": "+frames.size()+" frames, "+events.size()+" events, completed at "+e.snapshot().get("time")+" s");
        }
        Map<String,Object> out=obj("map",input,"strips",map(first.get("coverage")).get("strips"),"parameters",first.get("parameters"),"modelLimits",first.get("modelLimits"),"recordings",recordings);
        Files.write(Paths.get(args[1]),Json.stringify(out).getBytes(StandardCharsets.UTF_8));
    }
}
