package farm.sim;

import java.util.*;
import static farm.sim.Geometry.*;

/**
 * Self-contained deterministic Java 8 mission model. Not a real robot safety controller.
 * Distances m, time s, energy kWh, material/cargo kg. Movement is point kinematics.
 * A single service bay and access corridor have mutual exclusion. Open-field collision
 * avoidance, terrain, turning radii, localisation, communications and charging curves
 * are intentionally outside this model; snapshot.modelLimits declares these limits.
 */
public final class MissionEngine {
    private final Map<String,Object> map;
    private final String scenario;
    private final List<Field> fields=new ArrayList<Field>();
    private final List<Robot> robots=new ArrayList<Robot>();
    private final List<List<Point>> roads=new ArrayList<List<Point>>();
    private final List<Map<String,Object>> eventLog=new ArrayList<Map<String,Object>>();
    private final List<String> invariantViolations=new ArrayList<String>();
    private final Deque<Robot> serviceQueue=new ArrayDeque<Robot>();
    private final Set<String> queueIds=new HashSet<String>();
    private final Config config;
    private final Point depot;
    private Point carrierPosition;
    private List<Point> carrierPath=new ArrayList<Point>(),carrierTrail=new ArrayList<Point>();
    private int carrierNext=1,fieldIndex=0;
    private Field field;
    private Robot corridorOwner,bayOwner,handlingRobot;
    private double handlingRemaining,time,carrierEnergy,carrierSupply,carrierCargo;
    private double robotDistance,carrierDistance,energyUsed,chargingLoss,materialUsed,harvestedKg;
    private double queueWait,initialEnergy,initialMaterial,workLength;
    private int serviceCycles,returnCount,completedFields,eventSequence;
    private String status="RUNNING",carrierState="TRANSIT_TO_FIELD",pauseReason="";
    private boolean recalled,routeBlocked,injectedFault,injectedBlock;

    private static final class Config {
        double swath=9,workSpeed=1.6,travelSpeed=3,carrierSpeed=5;
        double batteryCapacity=0.45,reserve=0.055,workPower=0.9,travelPower=0.45,idlePower=0.012;
        double materialCapacity=8,materialPerMetre=0.006,cargoCapacity=12,cargoPerMetre=0.012;
        double carrierBattery=40,carrierSupply=250,carrierCargoCapacity=1000,carrierKWhPerMetre=0.002;
        double chargePower=4,chargeEfficiency=0.9,materialRate=0.25,cargoRate=0.5;
        double unloadSeconds=18,loadSeconds=18,serviceMinSeconds=15,predictionSeconds=4;
        Config(Map<String,Object> map){
            Object raw=map.get("simulation");if(!(raw instanceof Map))return;Map<?,?> m=(Map<?,?>)raw;
            swath=num(m,"swath_m",swath);workSpeed=num(m,"work_speed_mps",workSpeed);travelSpeed=num(m,"travel_speed_mps",travelSpeed);carrierSpeed=num(m,"carrier_speed_mps",carrierSpeed);
            batteryCapacity=num(m,"robot_battery_kwh",batteryCapacity);reserve=num(m,"battery_reserve_kwh",reserve);workPower=num(m,"work_power_kw",workPower);travelPower=num(m,"travel_power_kw",travelPower);idlePower=num(m,"idle_power_kw",idlePower);
            materialCapacity=num(m,"robot_material_kg",materialCapacity);materialPerMetre=num(m,"material_kg_per_m",materialPerMetre);cargoCapacity=num(m,"robot_cargo_kg",cargoCapacity);cargoPerMetre=num(m,"harvest_kg_per_m",cargoPerMetre);
            carrierBattery=num(m,"carrier_battery_kwh",carrierBattery);carrierSupply=num(m,"carrier_supply_kg",carrierSupply);carrierCargoCapacity=num(m,"carrier_cargo_kg",carrierCargoCapacity);carrierKWhPerMetre=num(m,"carrier_kwh_per_m",carrierKWhPerMetre);
            chargePower=num(m,"charge_power_kw",chargePower);chargeEfficiency=num(m,"charge_efficiency",chargeEfficiency);materialRate=num(m,"refill_rate_kgps",materialRate);cargoRate=num(m,"offload_rate_kgps",cargoRate);
            unloadSeconds=num(m,"unload_seconds",unloadSeconds);loadSeconds=num(m,"load_seconds",loadSeconds);serviceMinSeconds=num(m,"service_min_seconds",serviceMinSeconds);
        }
        void validate(){
            double[] positive={swath,workSpeed,travelSpeed,carrierSpeed,batteryCapacity,reserve,workPower,travelPower,materialCapacity,cargoCapacity,chargePower,chargeEfficiency,materialRate,cargoRate,unloadSeconds,loadSeconds,carrierBattery,carrierCargoCapacity};
            for(double p:positive)if(!Double.isFinite(p)||p<=0)throw new IllegalArgumentException("Simulation parameters must be finite and positive");
            double[] nonnegative={carrierSupply,materialPerMetre,cargoPerMetre,idlePower,carrierKWhPerMetre,serviceMinSeconds};for(double p:nonnegative)if(!Double.isFinite(p)||p<0)throw new IllegalArgumentException("Resource rates must be finite and nonnegative");
            if(reserve>=batteryCapacity||chargeEfficiency>1)throw new IllegalArgumentException("Invalid resource parameters");
            if(materialCapacity+EPS<materialPerMetre*workSpeed*predictionSeconds||cargoCapacity+EPS<cargoPerMetre*workSpeed*predictionSeconds)throw new IllegalArgumentException("Payload capacity is below the configured safe-work lookahead requirement");
        }
    }
    private static double num(Map<?,?> m,String key,double fallback){Object v=m.get(key);return v instanceof Number?((Number)v).doubleValue():fallback;}
    private static String str(Map<?,?> m,String key,String fallback){Object v=m.get(key);return v==null?fallback:String.valueOf(v);}
    private static Map<String,Object> obj(Object...pairs){Map<String,Object> m=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
    private static final class Field {
        String id,name;List<Point> polygon,access,corridor;Point staging,entry,anchor;
        List<Task> tasks=new ArrayList<Task>();double length,area;
    }
    private static final class Task {
        String id,owner;Point start,end;double length,done;int index;String state="PENDING";
        Point current(){return lerp(start,end,length<EPS?1:done/length);}
    }
    private static final class Robot {
        String id,state="ONBOARD",previousState="",afterMove="",returnReason="";
        Point position;double battery,material,cargo,serviceElapsed,distance,energy,workLength,queueSeconds;
        List<Point> path=new ArrayList<Point>(),trail=new ArrayList<Point>();int next;
        Task task;boolean finalReturn,onboard=true;String fieldId="";
    }

    public MissionEngine(Map<String,Object> map,String scenario,int robotCount){
        if(map==null)throw new IllegalArgumentException("Map is required");
        if(robotCount<1||robotCount>8)throw new IllegalArgumentException("robotCount must be 1..8");
        this.map=map;this.scenario=scenario==null?"normal":scenario;
        if(!Arrays.asList("normal","low_battery","blocked_return","robot_fault","harvest","baseline").contains(this.scenario))throw new IllegalArgumentException("Unknown scenario: "+this.scenario);
        config=new Config(map);config.validate();depot=point(map.get("depot"));carrierPosition=depot;carrierTrail.add(depot);
        Object roadData=map.get("roads");if(roadData instanceof List)for(Object raw:(List<?>)roadData)roads.add(readPolyline(((Map<?,?>)raw).get("points")));
        if(map.get("obstacles") instanceof List && !((List<?>)map.get("obstacles")).isEmpty())throw new IllegalArgumentException("This engine requires obstacle-free fields; obstacles must not silently be ignored");
        Object fieldData=map.get("fields");if(!(fieldData instanceof List)||((List<?>)fieldData).isEmpty())throw new IllegalArgumentException("At least one field is required");
        int fi=0;
        for(Object raw:(List<?>)fieldData){
            Map<?,?> m=(Map<?,?>)raw;Field f=new Field();f.id=str(m,"id","field_"+(++fi));f.name=str(m,"name",f.id);f.polygon=points(m.get("polygon"));validateSimplePolygon(f.polygon);f.area=area(f.polygon);
            f.staging=point(m.get("staging"));f.entry=point(m.get("entry"));f.corridor=points(m.get("access_corridor"));
            f.access=readPolyline(m.get("access_path"));if(f.access.isEmpty())f.access=new ArrayList<Point>(Arrays.asList(f.staging,f.entry));
            if(distance(f.access.get(0),f.staging)>EPS)throw new IllegalArgumentException("access_path must start at staging for "+f.id);
            f.anchor=f.access.get(f.access.size()-1);if(!inside(f.anchor,f.polygon))throw new IllegalArgumentException("access_path must end inside field for "+f.id);
            List<List<Point>> regions=new ArrayList<List<Point>>();regions.add(f.polygon);if(f.corridor.size()>=3){validateSimplePolygon(f.corridor);regions.add(f.corridor);}
            for(int i=1;i<f.access.size();i++)if(!segmentInsideUnion(f.access.get(i-1),f.access.get(i),regions))throw new IllegalArgumentException("Access segment outside field and declared corridor for "+f.id);
            int ti=0;for(List<Point> line:strips(f.polygon,config.swath)){Task t=new Task();t.id=f.id+"_strip_"+ti;t.index=ti++;t.start=line.get(0);t.end=line.get(1);t.length=distance(t.start,t.end);f.tasks.add(t);f.length+=t.length;}
            if(f.tasks.isEmpty())throw new IllegalArgumentException("No coverage strips for "+f.id);
            // Verify road access eagerly: disconnected routes must never become straight-line shortcuts.
            roadPath(depot,f.staging,roads);fields.add(f);
        }
        for(int i=1;i<fields.size();i++)roadPath(fields.get(i-1).staging,fields.get(i).staging,roads);
        carrierEnergy=config.carrierBattery;carrierSupply=config.carrierSupply;
        for(int i=0;i<robotCount;i++){Robot r=new Robot();r.id="robot_"+(i+1);r.position=depot;r.battery=config.batteryCapacity;r.material=config.materialCapacity;r.trail.add(depot);if(this.scenario.equals("low_battery")&&i==0)r.battery=config.batteryCapacity*0.30;robots.add(r);}
        initialEnergy=carrierEnergy;initialMaterial=carrierSupply;for(Robot r:robots){initialEnergy+=r.battery;initialMaterial+=r.material;}
        field=fields.get(0);setCarrierPath(roadPath(depot,field.staging,roads));
        log("MISSION_START","carrier","Carrier transporting robots to field",obj("scenario",this.scenario,"robots",robotCount));
        checkInvariants();
    }
    private static List<Point> readPolyline(Object data){List<Point> result=new ArrayList<Point>();if(data instanceof List)for(Object p:(List<?>)data)result.add(point(p));return result;}

    public synchronized void tick(double seconds){
        if(!Double.isFinite(seconds)||seconds<0||seconds>86400)throw new IllegalArgumentException("tick seconds must be finite and between 0 and 86400");
        // Fixed upper bound avoids jumping across resource thresholds at high UI time scales.
        double left=seconds;while(left>1e-9&&status.equals("RUNNING")){double dt=Math.min(0.25,left);step(dt);left-=dt;}
    }
    private void step(double dt){
        time+=dt;
        if(carrierState.equals("TRANSIT_TO_FIELD")||carrierState.equals("TRANSIT_TO_DEPOT")){
            moveCarrier(dt);if(!status.equals("RUNNING"))return;
            if(carrierNext>=carrierPath.size()){
                if(carrierState.equals("TRANSIT_TO_DEPOT")){carrierState="AT_DEPOT";finishMission();}
                else {carrierState="DEPLOYING";log("FIELD_ARRIVAL","carrier","Carrier reached field staging",obj("field",field.id));}
            }
        }else{
            updateHandling(dt);if(!status.equals("RUNNING"))return;
            if(carrierState.equals("DEPLOYING")&&handlingRobot==null)startNextUnload();
            for(Robot r:robots){updateRobot(r,dt);if(!status.equals("RUNNING"))break;}
            if(!status.equals("RUNNING"))return;
            updateBay(dt);if(!status.equals("RUNNING"))return;
            if(handlingRobot==null)startNextLoad();
            if(allOnboard()&&handlingRobot==null&&(!carrierState.equals("DEPLOYING"))){
                if(allFieldDone(field)||recalled){
                    if(!recalled){completedFields++;log("FIELD_COMPLETE","carrier","All planned strips complete and every robot loaded",obj("field",field.id));}
                    if(!recalled&&fieldIndex+1<fields.size()){field=fields.get(++fieldIndex);carrierState="TRANSIT_TO_FIELD";setCarrierPath(roadPath(carrierPosition,field.staging,roads));for(Robot r:robots){r.finalReturn=false;r.task=null;}}
                    else{carrierState="TRANSIT_TO_DEPOT";setCarrierPath(roadPath(carrierPosition,depot,roads));log("RETURN_TO_DEPOT","carrier","All robots accounted for; returning on declared roads",null);}
                }else fail("All robots loaded with unfinished assigned coverage");
            }
        }
        checkInvariants();
    }
    private void setCarrierPath(List<Point> path){carrierPath=path;carrierNext=1;}
    private void moveCarrier(double dt){
        double budget=config.carrierSpeed*dt;
        while(budget>EPS&&carrierNext<carrierPath.size()){
            Point target=carrierPath.get(carrierNext);double d=distance(carrierPosition,target);double s=Math.min(d,budget);double cost=s*config.carrierKWhPerMetre;
            if(carrierEnergy+EPS<cost){fail("Carrier energy insufficient for declared road route");return;}
            carrierEnergy-=cost;energyUsed+=cost;carrierDistance+=s;carrierPosition=d<EPS?target:lerp(carrierPosition,target,s/d);budget-=s;
            if(d<=s+EPS){carrierPosition=target;carrierNext++;}
        }
        appendTrail(carrierTrail,carrierPosition);for(Robot r:robots)if(r.onboard){r.position=carrierPosition;appendTrail(r.trail,r.position);}
    }
    private void startNextUnload(){
        if(recalled){carrierState="COLLECTING";return;}
        for(Robot r:robots)if(r.onboard){
            handlingRobot=r;handlingRemaining=config.unloadSeconds;r.state="UNLOADING";r.fieldId=field.id;log("UNLOAD_START",r.id,"Unloading from carrier",null);return;
        }
        carrierState="OPERATING";
    }
    private void updateHandling(double dt){
        if(handlingRobot==null)return;handlingRemaining-=dt;if(handlingRemaining>EPS)return;
        Robot r=handlingRobot;handlingRobot=null;
        if(r.state.equals("UNLOADING")){r.onboard=false;r.state="READY";r.position=field.staging;log("UNLOAD_DONE",r.id,"Unloaded and ready",null);}
        else if(r.state.equals("LOADING")){r.onboard=true;r.state="ONBOARD";r.position=carrierPosition;log("LOAD_DONE",r.id,"Secured on carrier",null);}
        else fail("Handling state changed unexpectedly for "+r.id);
    }
    private void startNextLoad(){
        if(carrierState.equals("DEPLOYING"))return;
        for(Robot r:robots)if(r.state.equals("WAIT_LOAD")){
            handlingRobot=r;handlingRemaining=config.loadSeconds;r.state="LOADING";log("LOAD_START",r.id,"Loading onto carrier",null);return;
        }
    }
    private void updateRobot(Robot r,double dt){
        if(r.onboard||r.state.equals("LOADING")||r.state.equals("UNLOADING"))return;
        if(r.state.equals("READY")){
            if(recalled){requestReturn(r,"RECALL",true);return;}
            if(r.task==null){r.task=chooseTask(r);if(r.task==null){requestReturn(r,"WORK_COMPLETE",true);return;}r.task.owner=r.id;r.task.state="ASSIGNED";log("TASK_ASSIGNED",r.id,"Coverage strip assigned",obj("task",r.task.id));}
            if(nearStaging(r.position)){
                // A deployment with a low battery is serviced before leaving the safe dock.
                double trip=length(fromStaging(r.task.current()))+length(toStaging(r.task.current()));
                double need=trip/config.travelSpeed*config.travelPower/3600+config.reserve+Math.max(0.02,config.workPower*config.predictionSeconds/3600);
                if(need>config.batteryCapacity+EPS){fail("Task cannot be reached and returned from within battery capacity and reserve: "+r.task.id);return;}
                if(r.battery<need||(!isHarvest()&&r.material<Math.min(config.materialCapacity,0.5))){enqueue(r,false,"PRECHECK");return;}
                if(corridorOwner!=null&&corridorOwner!=r){r.state="WAIT_CORRIDOR";return;}
                corridorOwner=r;startMove(r,fromStaging(r.task.current()),"WORK");
            }else startMove(r,pathInside(r.position,r.task.current(),field.polygon),"WORK");
            return;
        }
        if(r.state.equals("WAIT_CORRIDOR")){if(corridorOwner==null){r.state="READY";}idle(r,dt);return;}
        if(r.state.equals("WAIT_RETURN_CORRIDOR")){
            idle(r,dt);if(corridorOwner==null||corridorOwner==r)startReturn(r);return;
        }
        if(r.state.equals("TO_WORK")||r.state.equals("RETURNING")){
            if(recalled&&r.state.equals("TO_WORK")&&inside(r.position,field.polygon)){requestReturn(r,"RECALL",true);return;}
            if(r.state.equals("TO_WORK")&&inside(r.position,field.polygon)&&r.battery<returnEnergy(r.position)+config.reserve+0.003){requestReturn(r,"LOW_BATTERY",false);return;}
            moveRobot(r,dt,config.travelSpeed,config.travelPower);return;
        }
        if(r.state.equals("WORKING")){
            if(recalled){requestReturn(r,"RECALL",true);return;}
            if(scenario.equals("robot_fault")&&!injectedFault&&workLength>80){injectedFault=true;fault(r,"Injected device fault: operator acknowledgement required");return;}
            double ret=returnEnergy(r.position),nextWork=config.workPower*config.predictionSeconds/3600;
            if(r.battery<=ret+config.reserve+nextWork){requestReturn(r,"LOW_BATTERY",false);return;}
            double ds=Math.min(config.workSpeed*dt,r.task.length-r.task.done);
            if(!isHarvest()&&r.material<Math.max(config.materialPerMetre*config.workSpeed*config.predictionSeconds,config.materialPerMetre*ds)){requestReturn(r,"LOW_MATERIAL",false);return;}
            if(isHarvest()&&config.cargoCapacity-r.cargo<Math.max(config.cargoPerMetre*config.workSpeed*config.predictionSeconds,config.cargoPerMetre*ds)){requestReturn(r,"CARGO_FULL",false);return;}
            double actualTime=ds/config.workSpeed;consumeEnergy(r,config.workPower*actualTime/3600);if(!status.equals("RUNNING"))return;
            r.task.done=Math.min(r.task.length,r.task.done+ds);r.position=r.task.current();r.distance+=ds;robotDistance+=ds;r.workLength+=ds;workLength+=ds;
            if(isHarvest()){double q=ds*config.cargoPerMetre;r.cargo+=q;harvestedKg+=q;}else{double q=ds*config.materialPerMetre;r.material-=q;materialUsed+=q;}
            appendTrail(r.trail,r.position);
            if(r.task.done>=r.task.length-EPS){r.task.done=r.task.length;r.task.state="COMPLETED";log("STRIP_COMPLETE",r.id,"Coverage strip completed",obj("task",r.task.id));r.task=null;r.state="READY";}
            return;
        }
        if(r.state.equals("WAIT_SERVICE")){queueWait+=dt;r.queueSeconds+=dt;idle(r,dt);return;}
        if(r.state.equals("WAIT_LOAD"))idle(r,dt);
    }
    private Task chooseTask(Robot r){
        Task best=null;double score=Double.POSITIVE_INFINITY;int robotIndex=robots.indexOf(r);
        for(Task t:field.tasks){if(!t.state.equals("PENDING"))continue;if(scenario.equals("baseline")&&t.index%robots.size()!=robotIndex)continue;
            if(scenario.equals("baseline"))return t;
            double d=nearStaging(r.position)?length(fromStaging(t.start)):length(pathInside(r.position,t.start,field.polygon));if(d<score){score=d;best=t;}}
        return best;
    }
    private void startMove(Robot r,List<Point> path,String after){
        r.path=path;r.next=1;r.afterMove=after;r.state=after.equals("DOCK")?"RETURNING":"TO_WORK";
        validateRobotPath(path);if(r.next>=r.path.size())arrived(r);
    }
    private void validateRobotPath(List<Point> path){
        List<List<Point>> regions=new ArrayList<List<Point>>();regions.add(field.polygon);if(field.corridor.size()>=3)regions.add(field.corridor);
        for(int i=1;i<path.size();i++)if(!segmentInsideUnion(path.get(i-1),path.get(i),regions))throw new IllegalStateException("Robot route leaves declared traversable region");
    }
    private void moveRobot(Robot r,double dt,double speed,double power){
        double budget=speed*dt;
        while(budget>EPS&&r.next<r.path.size()){
            Point target=r.path.get(r.next);double d=distance(r.position,target),s=Math.min(d,budget);
            consumeEnergy(r,power*(s/speed)/3600);if(!status.equals("RUNNING"))return;
            r.position=d<EPS?target:lerp(r.position,target,s/d);r.distance+=s;robotDistance+=s;budget-=s;
            if(d<=s+EPS){r.position=target;r.next++;if(corridorOwner==r&&r.state.equals("TO_WORK")&&distance(target,field.anchor)<EPS)corridorOwner=null;}
        }
        appendTrail(r.trail,r.position);if(r.next>=r.path.size())arrived(r);
    }
    private void arrived(Robot r){
        if(r.afterMove.equals("DOCK")){if(corridorOwner==r)corridorOwner=null;r.position=field.staging;log("RETURN_ARRIVAL",r.id,"Reached carrier staging",obj("reason",r.returnReason));enqueue(r,r.finalReturn,r.returnReason);}
        else {if(corridorOwner==r)corridorOwner=null;r.state="WORKING";r.task.state="WORKING";r.position=r.task.current();log("WORK_START",r.id,"Starting or resuming coverage at saved breakpoint",obj("task",r.task.id,"offset_m",r.task.done));}
    }
    private List<Point> fromStaging(Point goal){return fromStaging(field,goal);}
    private List<Point> fromStaging(Field f,Point goal){List<Point> out=new ArrayList<Point>(f.access);appendPath(out,pathInside(f.anchor,goal,f.polygon));return out;}
    private List<Point> toStaging(Point from){
        if(nearStaging(from))return new ArrayList<Point>(Arrays.asList(from,field.staging));
        List<Point> out;
        if(inside(from,field.polygon)){out=pathInside(from,field.anchor,field.polygon);List<Point> back=new ArrayList<Point>(field.access);Collections.reverse(back);appendPath(out,back);}
        else {
            // A robot already in the access corridor returns along its own travelled access prefix.
            out=new ArrayList<Point>();out.add(from);int segment=-1;for(int i=1;i<field.access.size();i++)if(onSegment(from,field.access.get(i-1),field.access.get(i))){segment=i;break;}
            if(segment<0)throw new IllegalStateException("Robot outside field and access path");for(int i=segment-1;i>=0;i--)out.add(field.access.get(i));
        }return out;
    }
    private static void appendPath(List<Point> a,List<Point> b){for(Point p:b)if(a.isEmpty()||distance(a.get(a.size()-1),p)>EPS)a.add(p);}
    private double returnEnergy(Point p){return length(toStaging(p))/config.travelSpeed*config.travelPower/3600;}
    private boolean nearStaging(Point p){return distance(p,field.staging)<1e-6;}
    private void requestReturn(Robot r,String why,boolean last){
        if(r.task!=null)r.task.state="SUSPENDED";r.returnReason=why;r.finalReturn=last;r.path=new ArrayList<Point>();r.next=0;returnCount++;
        log("RETURN_REQUEST",r.id,"Return requested: "+why,obj("battery_kwh",r.battery,"estimated_return_kwh",returnEnergy(r.position),"reserve_kwh",config.reserve,"task",r.task==null?null:r.task.id,"offset_m",r.task==null?0:r.task.done));
        if(scenario.equals("blocked_return")&&!injectedBlock){injectedBlock=true;routeBlocked=true;status="WAITING_RECOVERY";pauseReason="Return corridor blocked; clear_route required";r.state="WAIT_RETURN_CORRIDOR";log("ROUTE_BLOCKED",r.id,pauseReason,null);return;}
        if(nearStaging(r.position)){if(corridorOwner==r)corridorOwner=null;enqueue(r,last,why);return;}
        if(corridorOwner!=null&&corridorOwner!=r){r.state="WAIT_RETURN_CORRIDOR";return;}
        startReturn(r);
    }
    private void startReturn(Robot r){
        if(routeBlocked){status="WAITING_RECOVERY";pauseReason="Return corridor blocked";return;}
        double required=returnEnergy(r.position);if(r.battery+EPS<required){fail("Insufficient energy for safe return of "+r.id);return;}
        corridorOwner=r;startMove(r,toStaging(r.position),"DOCK");
    }
    private void enqueue(Robot r,boolean last,String why){
        r.finalReturn=last;r.returnReason=why;
        if(last&&r.cargo<EPS){r.state="WAIT_LOAD";if(allFieldDone(field)||recalled)carrierState="COLLECTING";return;}
        if(queueIds.add(r.id)){serviceQueue.addLast(r);r.state="WAIT_SERVICE";log("SERVICE_QUEUE",r.id,"Joined single-bay FIFO service queue",obj("position",serviceQueue.size()));}
    }
    private void updateBay(double dt){
        if(bayOwner==null&&!serviceQueue.isEmpty()){
            bayOwner=serviceQueue.removeFirst();queueIds.remove(bayOwner.id);bayOwner.state="SERVICING";bayOwner.serviceElapsed=0;log("SERVICE_START",bayOwner.id,"Single service bay acquired",null);
        }
        if(bayOwner==null)return;
        Robot r=bayOwner;r.serviceElapsed+=dt;
        if(!r.finalReturn){
            double delta=Math.min(config.batteryCapacity-r.battery,config.chargePower*dt/3600);delta=Math.max(0,delta);double draw=delta/config.chargeEfficiency;
            if(draw>carrierEnergy+EPS){fail("Carrier battery cannot support requested recharge");return;}carrierEnergy-=draw;r.battery+=delta;chargingLoss+=draw-delta;energyUsed+=draw-delta;
            if(!isHarvest()){
                double refill=Math.min(config.materialCapacity-r.material,config.materialRate*dt);refill=Math.max(0,refill);
                if(refill>carrierSupply+EPS){fail("Carrier material depleted; external refill not modelled");return;}carrierSupply-=refill;r.material+=refill;
            }
        }
        double offload=Math.min(r.cargo,config.cargoRate*dt);
        if(carrierCargo+offload>config.carrierCargoCapacity+EPS){fail("Carrier cargo capacity reached");return;}r.cargo-=offload;carrierCargo+=offload;
        boolean full=r.finalReturn||(r.battery>=config.batteryCapacity-EPS&&(isHarvest()||r.material>=config.materialCapacity-EPS));
        if(full&&r.cargo<EPS&&r.serviceElapsed>=config.serviceMinSeconds){
            r.cargo=0;serviceCycles++;log("SERVICE_DONE",r.id,"Resource transfer complete",obj("battery_kwh",r.battery,"material_kg",r.material,"cargo_kg",r.cargo));bayOwner=null;
            if(r.finalReturn){r.state="WAIT_LOAD";if(allFieldDone(field)||recalled)carrierState="COLLECTING";}else r.state="READY";
        }
    }
    private void consumeEnergy(Robot r,double e){if(e<0||!Double.isFinite(e)){fail("Invalid energy increment");return;}if(r.battery+EPS<e){fail("Robot battery exhausted: "+r.id);return;}r.battery-=e;r.energy+=e;energyUsed+=e;}
    private void idle(Robot r,double dt){consumeEnergy(r,config.idlePower*dt/3600);}
    private static void appendTrail(List<Point> list,Point p){if(list.isEmpty()||distance(list.get(list.size()-1),p)>=2){list.add(p);if(list.size()>2000)list.remove(1);}}
    private boolean isHarvest(){return scenario.equals("harvest");}
    private boolean allOnboard(){for(Robot r:robots)if(!r.onboard)return false;return true;}
    private boolean allFieldDone(Field f){for(Task t:f.tasks)if(!t.state.equals("COMPLETED"))return false;return true;}
    private double totalLength(){double n=0;for(Field f:fields)n+=f.length;return n;}
    private double doneLength(){double n=0;for(Field f:fields)for(Task t:f.tasks)n+=t.done;return n;}
    private void finishMission(){
        if(!allOnboard()){fail("Cannot finish with unloaded robots");return;}
        if(recalled){status="CANCELLED";log("MISSION_RECALLED","carrier","Recall complete; all robots returned safely, coverage may be incomplete",null);}
        else {for(Field f:fields)if(!allFieldDone(f)){fail("Cannot complete unfinished coverage");return;}status="COMPLETED";log("MISSION_COMPLETE","carrier","Coverage complete; all robots aboard at depot",null);}
    }
    private void fail(String message){if(status.equals("FAILED"))return;status="FAILED";pauseReason=message;log("MISSION_FAILED","system",message,null);}
    private void fault(Robot r,String message){r.previousState=r.state;r.state="FAULT";status="WAITING_RECOVERY";pauseReason=message;log("ROBOT_FAULT",r.id,message,null);}
    private void log(String type,String actor,String message,Map<String,Object> details){Map<String,Object> e=obj("seq",++eventSequence,"time",round(time),"type",type,"actor",actor,"message",message);if(details!=null)e.put("details",details);eventLog.add(e);}

    public synchronized void command(String command,String robotId){
        if(command==null)throw new IllegalArgumentException("command is required");Robot chosen=robotId==null?robots.get(0):findRobot(robotId);
        if(command.equals("recall")){
            if(isTerminal())return;recalled=true;log("RECALL_COMMAND","operator","Recall requested; faults and blocked routes still require explicit clearance",null);
            if(carrierState.equals("TRANSIT_TO_FIELD")&&allOnboard()){carrierState="TRANSIT_TO_DEPOT";setCarrierPath(roadPath(carrierPosition,depot,roads));}
            else if(status.equals("RUNNING"))for(Robot r:robots)if(!r.onboard&&!r.state.equals("LOADING")&&!r.state.equals("UNLOADING")&&!r.state.equals("RETURNING")&&!r.state.equals("WAIT_RETURN_CORRIDOR")&&!r.state.equals("WAIT_LOAD")){
                if(r==bayOwner){r.finalReturn=true;}else if(queueIds.contains(r.id)){r.finalReturn=true;}else requestReturn(r,"RECALL",true);
            }
        }else if(command.equals("block_route")){
            if(isTerminal())return;routeBlocked=true;status="WAITING_RECOVERY";pauseReason="Route blocked by operator; clear_route required";log("ROUTE_BLOCKED","operator",pauseReason,null);
        }else if(command.equals("clear_route")){
            routeBlocked=false;log("ROUTE_CLEARED","operator","Operator cleared route; device faults remain latched",null);resumeIfSafe();
        }else if(command.equals("fault_robot")){
            if(isTerminal())return;if(!chosen.state.equals("FAULT"))fault(chosen,"Device fault latched for "+chosen.id+"; clear_fault required");
        }else if(command.equals("clear_fault")){
            if(!chosen.state.equals("FAULT"))return;chosen.state=chosen.previousState;chosen.previousState="";log("FAULT_CLEARED",chosen.id,"Operator acknowledged and cleared device fault",null);resumeIfSafe();
        }else throw new IllegalArgumentException("Unknown command: "+command);
    }
    private void resumeIfSafe(){if(status.equals("FAILED")||isTerminal())return;if(routeBlocked)return;for(Robot r:robots)if(r.state.equals("FAULT"))return;status="RUNNING";pauseReason="";}
    private Robot findRobot(String id){for(Robot r:robots)if(r.id.equals(id))return r;throw new IllegalArgumentException("Unknown robot: "+id);}
    public synchronized boolean isTerminal(){return status.equals("COMPLETED")||status.equals("FAILED")||status.equals("CANCELLED");}
    public synchronized String status(){return status;}
    public synchronized List<Map<String,Object>> events(){return new ArrayList<Map<String,Object>>(eventLog);}

    private void checkInvariants(){
        double stored=carrierEnergy,mat=carrierSupply,cargo=carrierCargo;Set<String> ids=new HashSet<String>();
        for(Robot r:robots){stored+=r.battery;mat+=r.material;cargo+=r.cargo;
            if(!ids.add(r.id))violation("Duplicate robot id");
            if(r.battery<-1e-7||r.battery>config.batteryCapacity+1e-7)violation("Robot battery out of bounds: "+r.id);
            if(r.material<-1e-7||r.material>config.materialCapacity+1e-7||r.cargo<-1e-7||r.cargo>config.cargoCapacity+1e-7)violation("Robot payload out of bounds: "+r.id);
            if(!r.onboard&&!insideUnion(r.position,traversable()))violation("Robot outside traversable field/corridor: "+r.id);
        }
        if(Math.abs(initialEnergy-stored-energyUsed)>1e-6)violation("Energy balance error");
        if(Math.abs(initialMaterial-mat-materialUsed)>1e-6)violation("Material balance error");
        if(Math.abs(harvestedKg-cargo)>1e-6)violation("Harvest cargo balance error");
        if(carrierEnergy<-1e-7||carrierSupply<-1e-7||carrierCargo>config.carrierCargoCapacity+1e-7)violation("Carrier resource out of bounds");
        if(!invariantViolations.isEmpty()&&!status.equals("FAILED"))fail("Invariant violation: "+invariantViolations.get(0));
    }
    private List<List<Point>> traversable(){List<List<Point>> out=new ArrayList<List<Point>>();for(Field f:fields){out.add(f.polygon);if(f.corridor.size()>=3)out.add(f.corridor);}return out;}
    private void violation(String v){if(!invariantViolations.contains(v))invariantViolations.add(v);}
    private static double round(double x){return Math.rint(x*1e6)/1e6;}
    private static double percent(double x,double cap){return cap<=EPS?0:round(Math.max(0,Math.min(100,100*x/cap)));}
    private List<Object> remainingPath(Robot r){List<Point> out=new ArrayList<Point>();out.add(r.position);for(int i=r.next;i<r.path.size();i++)out.add(r.path.get(i));return Geometry.json(out);}
    private List<Object> previewPath(int index){List<Point> p=new ArrayList<Point>();for(Field f:fields)for(Task t:f.tasks)if(t.index%robots.size()==index){p.add(t.start);p.add(t.end);}return Geometry.json(p);}
    private List<Object> taskSnapshots(){List<Object> result=new ArrayList<Object>();for(Field f:fields)for(Task t:f.tasks)result.add(obj("id",t.id,"fieldId",f.id,"start",t.start.json(),"end",t.end.json(),"state",t.state,"owner",t.owner,"completed",round(t.done),"total",round(t.length)));return result;}

    public synchronized Map<String,Object> snapshot(){
        List<Object> rs=new ArrayList<Object>();List<String> aboard=new ArrayList<String>();int i=0;
        for(Robot r:robots){if(r.onboard)aboard.add(r.id);double assigned=0;for(Field f:fields)for(Task t:f.tasks)if(r.id.equals(t.owner))assigned+=t.length;
            rs.add(obj("id",r.id,"x",round(r.position.x),"y",round(r.position.y),"state",r.state,"battery",percent(r.battery,config.batteryCapacity),"batteryKWh",round(r.battery),"material",percent(r.material,config.materialCapacity),"materialKg",round(r.material),"cargo",percent(r.cargo,config.cargoCapacity),"cargoKg",round(r.cargo),"onboard",r.onboard,"progress",assigned>0?round(r.workLength/assigned):0,"path",previewPath(i++),"activePath",remainingPath(r),"trail",Geometry.json(r.trail),"task",r.task==null?null:r.task.id,"breakpointM",r.task==null?null:round(r.task.done),"returnReason",r.returnReason,"distanceM",round(r.distance),"energyUsedKWh",round(r.energy),"queueWaitSeconds",round(r.queueSeconds)));
        }
        List<String> queue=new ArrayList<String>();for(Robot r:serviceQueue)queue.add(r.id);
        Map<String,Object> carrier=obj("id","carrier","x",round(carrierPosition.x),"y",round(carrierPosition.y),"state",carrierState,"battery",percent(carrierEnergy,config.carrierBattery),"batteryKWh",round(carrierEnergy),"batteryCapacityKWh",config.carrierBattery,"supply",round(carrierSupply),"supplyKg",round(carrierSupply),"supplyPercent",percent(carrierSupply,config.carrierSupply),"supplyCapacityKg",config.carrierSupply,"cargo",round(carrierCargo),"cargoKg",round(carrierCargo),"cargoCapacityKg",config.carrierCargoCapacity,"onboard",aboard,"capacity",robots.size(),"path",Geometry.json(carrierPath),"trail",Geometry.json(carrierTrail),"serviceRobot",bayOwner==null?null:bayOwner.id,"handlingRobot",handlingRobot==null?null:handlingRobot.id);
        List<Map<String,Object>> latest=new ArrayList<Map<String,Object>>(eventLog.subList(Math.max(0,eventLog.size()-60),eventLog.size()));
        return obj("schema_version",1,"time",round(time),"status",status,"reason",pauseReason,"scenario",scenario,"map",map,"fieldId",field.id,"carrier",carrier,"robots",rs,"coverage",obj("completed",round(doneLength()),"total",round(totalLength()),"fraction",round(doneLength()/totalLength()),"unit","planned_strip_metres","strips",taskSnapshots()),"queue",queue,"bayOwner",bayOwner==null?null:bayOwner.id,"corridorOwner",corridorOwner==null?null:corridorOwner.id,"routeBlocked",routeBlocked,"events",latest,"metrics",metrics(),"parameters",parameters(),"modelLimits",Arrays.asList("Point-robot planar kinematics; no turning-radius or terrain model","Single FIFO service bay and one reserved field-access corridor; no open-field fleet collision guarantee","Coverage metric is completed clipped strip centreline length; swath/overlap and physical tool footprints are not independently certified","Charging and loading are configurable constant-rate/time abstractions","Fault or blocked route freezes mission progression until explicit operator clearance","ROS2 and AnyLogic adapters exchange plans/telemetry only; no real robot execution is claimed"));
    }
    private Map<String,Object> parameters(){return obj("swath_m",config.swath,"work_speed_mps",config.workSpeed,"travel_speed_mps",config.travelSpeed,"carrier_speed_mps",config.carrierSpeed,"robot_battery_kwh",config.batteryCapacity,"reserve_kwh",config.reserve,"work_power_kw",config.workPower,"travel_power_kw",config.travelPower,"idle_power_kw",config.idlePower,"robot_material_kg",config.materialCapacity,"material_kg_per_m",config.materialPerMetre,"robot_cargo_kg",config.cargoCapacity,"harvest_kg_per_m",config.cargoPerMetre,"charge_power_kw",config.chargePower,"charge_efficiency",config.chargeEfficiency,"refill_rate_kgps",config.materialRate,"offload_rate_kgps",config.cargoRate,"unload_seconds",config.unloadSeconds,"load_seconds",config.loadSeconds,"service_min_seconds",config.serviceMinSeconds,"carrier_battery_kwh",config.carrierBattery,"carrier_supply_kg",config.carrierSupply,"carrier_cargo_kg",config.carrierCargoCapacity,"carrier_kwh_per_m",config.carrierKWhPerMetre);}
    public synchronized Map<String,Object> metrics(){
        double stored=carrierEnergy,mat=carrierSupply,cargo=carrierCargo;for(Robot r:robots){stored+=r.battery;mat+=r.material;cargo+=r.cargo;}
        double totalArea=0;for(Field f:fields)totalArea+=f.area;
        return obj("totalTime",round(time),"totalTimeSeconds",round(time),"distance",round(robotDistance+carrierDistance),"distanceM",round(robotDistance+carrierDistance),"robotDistanceM",round(robotDistance),"carrierDistanceM",round(carrierDistance),"energyUsed",round(energyUsed),"energyUsedKWh",round(energyUsed),"chargingLossKWh",round(chargingLoss),"materialUsedKg",round(materialUsed),"harvestedKg",round(harvestedKg),"serviceCycles",serviceCycles,"returnCount",returnCount,"queueWaitTime",round(queueWait),"queueWaitSeconds",round(queueWait),"coverageLengthM",round(doneLength()),"plannedCoverageLengthM",round(totalLength()),"coveredArea",round(totalArea*doneLength()/totalLength()),"modeledCoveredAreaM2",round(totalArea*doneLength()/totalLength()),"fieldAreaM2",round(totalArea),"completedFields",completedFields,"invariantViolations",new ArrayList<String>(invariantViolations),"validation",obj("allRobotsAccounted",robots.size(),"onboardAtFinish",allOnboard(),"resourceConservationErrorKWh",round(initialEnergy-stored-energyUsed),"materialConservationErrorKg",round(initialMaterial-mat-materialUsed),"cargoConservationErrorKg",round(harvestedKg-cargo),"allPlannedPathsValid",true,"coverageIsCenterlineModel",true));
    }
    public synchronized Map<String,Object> exportPlan(){
        List<Object> rs=new ArrayList<Object>();
        for(int ri=0;ri<robots.size();ri++){
            List<Object> segments=new ArrayList<Object>();
            for(Field f:fields){
                Point previous=null;
                for(Task t:f.tasks)if(t.index%robots.size()==ri){
                    List<Point> connector=previous==null?fromStaging(f,t.start):pathInside(previous,t.start,f.polygon);
                    segments.add(obj("segment_id",t.id+"_approach","kind","transit","field_id",f.id,"points",Geometry.json(connector),"status","PLANNED"));
                    segments.add(obj("segment_id",t.id,"kind","coverage","field_id",f.id,"points",Arrays.asList(t.start.json(),t.end.json()),"status",t.state,"completed_m",round(t.done)));
                    previous=t.end;
                }
                if(previous!=null){List<Point> home=pathInside(previous,f.anchor,f.polygon);List<Point> reverse=new ArrayList<Point>(f.access);Collections.reverse(reverse);appendPath(home,reverse);
                    segments.add(obj("segment_id",f.id+"_return_"+ri,"kind","return","field_id",f.id,"points",Geometry.json(home),"status","PLANNED"));}
            }
            rs.add(obj("robot_id",robots.get(ri).id,"frame_id","map","segments",segments));
        }
        return obj("schema_version",1,"frame_id","map","plan_type","nominal_geometric_plan","origin_wgs84",map.get("origin_wgs84"),"units",obj("distance","m","time","s","energy","kWh","mass","kg"),"assignment",scenario.equals("baseline")?"fixed_round_robin":"preview_round_robin_dynamic_runtime","description","Static coverage with valid in-field connectors and declared access paths. Runtime mission adds resource-based returns, queueing and resumed breakpoints; this nominal plan alone is not a resource-safe or collision-free fleet controller.","swath_m",config.swath,"robots",rs,"map",map,"parameters",parameters());
    }
}
