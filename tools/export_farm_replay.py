#!/usr/bin/env python3
"""Export actual Java mission recordings for the static portfolio.

Usage: python tools/export_farm_replay.py --core ../farm_carrier_system
Requires Python 3 standard library and JDK 17+. Does not change the core.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
LABELS = {
    "normal": ("完整任务", "运输、卸载、多机作业、补给、断点续作、装载与返场。"),
    "low_battery": ("低电量起步", "robot_1 以 30% 电量出发，观察资源检查与服务调度。"),
    "harvest": ("满载回收", "收获任务把田间产出转入载具货舱，观察卸货与继续作业。"),
    "blocked_return": ("通道阻塞", "返程通道阻塞后任务冻结，演示脚本模拟操作员清障确认后恢复。"),
    "robot_fault": ("设备故障", "设备故障锁存后任务冻结，演示脚本模拟操作员解除故障后恢复。"),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, default=SITE.parent / "farm_carrier_system")
    args = parser.parse_args()
    core = args.core.resolve()
    source = core / "src/main/java/farm/sim/MissionEngine.java"
    jar = core / "farm-carrier.jar"
    map_file = core / "maps/farm_map.json"
    baseline_file = core / "reports/benchmark.json"
    for p in (source, jar, map_file, baseline_file):
        if not p.is_file():
            raise SystemExit(f"Required core file missing: {p}")
    with tempfile.TemporaryDirectory(prefix="farm-replay-") as tmp:
        raw = Path(tmp) / "replays.json"
        subprocess.run(["java", "--class-path", str(jar), str(HERE / "export_farm_replay.java"), str(map_file), str(raw)], check=True)
        data = json.loads(raw.read_text(encoding="utf-8"))

    dictionaries: dict[str, list[str]] = {k: [] for k in ("status", "carrierState", "robotState", "stripState", "returnReason")}
    robots = ["robot_1", "robot_2", "robot_3"]
    strips = [{k: s[k] for k in ("id", "fieldId", "start", "end", "total")} for s in data["strips"]]
    strip_ids = [s["id"] for s in strips]

    def symbol(key: str, value: str) -> int:
        if value not in dictionaries[key]:
            dictionaries[key].append(value)
        return dictionaries[key].index(value)

    def rid(value: str | None) -> int:
        return robots.index(value) if value in robots else -1

    def rounded(value: float | None, digits: int = 3):
        return round(value, digits) if value is not None else None

    recordings = {}
    scenarios = []
    validation = []
    bench = {x["scenario"]: x for x in json.loads(baseline_file.read_text())["results"]}
    all_states: set[str] = set()
    for record in data["recordings"]:
        sid = record["id"]
        frames = record["frames"]
        compact = []
        for frame in frames:
            c = frame["carrier"]
            carrier = [rounded(c["x"]), rounded(c["y"]), symbol("carrierState", c["state"]), rounded(c["battery"]), rounded(c["batteryKWh"], 6), rounded(c["supplyKg"]), rounded(c["cargoKg"]), [rid(r) for r in c["onboard"]], rid(c["handlingRobot"]), rid(c["serviceRobot"]), [[rounded(v) for v in p] for p in c["path"]]]
            rs = []
            for r in frame["robots"]:
                all_states.add(r["state"])
                # activePath is a remaining navigation route. It is not the nominal
                # round-robin preview and is hidden by consumers while WORKING.
                rs.append([rounded(r["x"]), rounded(r["y"]), symbol("robotState", r["state"]), rounded(r["battery"]), rounded(r["material"]), rounded(r["cargo"]), rounded(r["batteryKWh"], 6), rounded(r["materialKg"]), rounded(r["cargoKg"]), r["onboard"], strip_ids.index(r["task"]) if r["task"] else -1, rounded(r["breakpointM"]), symbol("returnReason", r["returnReason"]), rounded(r["distanceM"]), rounded(r["energyUsedKWh"], 6), r["queueWaitSeconds"], [[rounded(v) for v in p] for p in r["activePath"]], r["progress"]])
            cv = frame["coverage"]
            dynamics = [[symbol("stripState", s["state"]), rid(s["owner"]), rounded(s["completed"])] for s in cv["strips"]]
            compact.append([frame["time"], frame["replayTime"], symbol("status", frame["status"]), frame["reason"], carrier, rs, [cv["completed"], cv["fraction"], dynamics], [rid(r) for r in frame["queue"]], rid(frame["bayOwner"]), rid(frame["corridorOwner"]), frame["routeBlocked"], frame["eventIndex"], frame["scriptedOperator"]])
        metrics = record["metrics"]
        benchmark_at_pause = sid in ("blocked_return", "robot_fault")
        reference_frame = next((f for f in frames if f["status"] == "WAITING_RECOVERY"), None) if benchmark_at_pause else frames[-1]
        assert reference_frame is not None
        reference_time = bench[sid]["totalTimeSeconds"]
        assert abs(reference_frame["time"] - reference_time) < 1e-8, (sid, reference_frame["time"], reference_time)
        assert frames[-1]["status"] == "COMPLETED"
        assert metrics["coverageLengthM"] == metrics["plannedCoverageLengthM"]
        assert metrics["validation"]["onboardAtFinish"]
        assert not metrics["invariantViolations"]
        checks = {"referenceTimeMatched": True, "allStripsCompleted": True, "allThreeRobotsOnboardAtDepot": len(frames[-1]["carrier"]["onboard"]) == 3 and frames[-1]["carrier"]["state"] == "AT_DEPOT", "noInvariantViolations": True, "timeMonotonic": all(b["time"] >= a["time"] for a, b in zip(frames, frames[1:])), "replayTimeStrictlyIncreasing": all(b["replayTime"] > a["replayTime"] for a, b in zip(frames, frames[1:]))}
        assert all(checks.values()), (sid, checks)
        if not benchmark_at_pause:
            for key in ("totalTimeSeconds", "distanceM", "energyUsedKWh", "materialUsedKg", "harvestedKg", "serviceCycles", "queueWaitSeconds"):
                assert abs(metrics[key] - bench[sid][key]) < 1e-6, (sid, key)
            checks["terminalMetricsMatchedBaseline"] = True
        else:
            assert len(record["operatorActions"]) == 1
            holds = [f for f in frames if f["status"] == "WAITING_RECOVERY"]
            assert len(holds) >= 12 and len({f["time"] for f in holds}) == 1
            checks["simulatedClockFrozenDuringExplicitRecoveryWait"] = True
            checks["scriptedOperatorClearanceRecorded"] = True
        label, description = LABELS[sid]
        metadata = {k: record[k] for k in ("id", "duration", "simulationDuration", "frameCount", "status", "operatorActions", "metrics")}
        metadata.update(label=label, description=description, eventCount=len(record["events"]))
        scenarios.append(metadata)
        recordings[sid] = {"frames": compact, "events": record["events"]}
        validation.append({"scenario": sid, "frames": len(frames), "events": len(record["events"]), "referenceComparedAt": "first_waiting_recovery" if benchmark_at_pause else "terminal", "checks": checks, "metrics": metrics, "operatorActions": record["operatorActions"]})

    evidence = {
        "schemaVersion": 1,
        "project": "Farm Carrier System v1.0",
        "generatedBy": "tools/export_farm_replay.py + tools/export_farm_replay.java",
        "engine": "Unmodified farm.sim.MissionEngine from farm-carrier.jar",
        "sourceSha256": sha(source), "jarSha256": sha(jar), "mapSha256": sha(map_file),
        "sampling": {"coreTickSeconds": 0.25, "periodicSeconds": 5, "alsoCapture": "every end-of-tick state / resource owner / event-count change", "transitionDetection": "read-only reflection; all exported values are public snapshot/events/metrics", "positionPrecisionMetres": 0.001, "displayResourcePrecision": 0.001, "energyPrecisionKWh": 0.000001, "metricsPrecision": "exact engine output", "interpolation": "not performed in data API", "recoveryWaitSeconds": 12, "recoveryWaitClock": "replayTime only; mission time stays frozen"},
        "semantics": {"coverageUnit": "planned_strip_metres", "coverageDefinition": "Completed clipped strip centreline length / planned clipped strip centreline length; not independently measured swept-area coverage", "decisions": "Explicit Java rules, greedy pending-strip selection and finite state machines; tree views are explanatory mappings, not a BehaviorTree.CPP runtime", "replay": "Pre-recorded deterministic core runs; browser playback does not replan or control hardware", "operatorRecovery": "Fault and blocked-route cases contain one explicit exporter-scripted operator clearance after a 12 s presentation hold; the core does not recover automatically", "map": "Original field boundary transformed to local metres; near-field depot, access corridor and road are synthetic demonstration geometry", "coordinates": "Local metric linearization of WGS84; not UTM and not a SLAM map", "robot": "Point-robot planar kinematics; no chassis footprint or turning-radius dynamics", "resourceMutualExclusion": "Capacity-one corridor, loading ramp and FIFO service bay; no open-field multi-robot collision guarantee"},
        "parameters": data["parameters"], "modelLimits": data["modelLimits"],
        "benchmark": bench, "scenarioMetrics": {s["id"]: s["metrics"] for s in scenarios},
        "allObservedRobotStates": sorted(all_states), "scenarioCount": len(scenarios),
    }
    payload = {"schemaVersion": 1, "map": data["map"], "strips": strips, "robotIds": robots, "dict": dictionaries, "scenarios": scenarios, "recordings": recordings, "evidence": evidence}
    script = "/* Actual Java MissionEngine recordings. Generated by tools/export_farm_replay.py. */\n(function(global){\n'use strict';\nconst DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n" + API_JS + "\n})(window);\n"
    output = SITE / "assets/data/farm-replays.js"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(script, encoding="utf-8")
    evidence["replaySha256"] = sha(output)
    evidence["replayBytes"] = output.stat().st_size
    dump(SITE / "assets/data/farm-evidence.json", evidence)
    dump(SITE / "reports/farm-replay-validation.json", {"passed": True, "scenarios": validation, "totalFrames": sum(s["frameCount"] for s in scenarios), "replayBytes": output.stat().st_size, "replaySha256": sha(output), "sourceSha256": sha(source), "jarSha256": sha(jar), "mapSha256": sha(map_file), "allObservedRobotStates": sorted(all_states)})
    print(json.dumps({"output": str(output), "bytes": output.stat().st_size, "totalFrames": sum(s["frameCount"] for s in scenarios), "validation": "passed"}, ensure_ascii=False))


API_JS = r"""
const cache=new Map();
const robotId=i=>i<0?null:DATA.robotIds[i];
const total=DATA.evidence.scenarioMetrics.normal.plannedCoverageLengthM;
function scenario(id){const s=DATA.scenarios.find(x=>x.id===id);if(!s)throw new RangeError('Unknown replay scenario: '+id);return s;}
function getFrame(id,index){
  const raw=DATA.recordings[id];if(!raw)throw new RangeError('Unknown replay scenario: '+id);
  const n=Math.max(0,Math.min(raw.frames.length-1,Math.trunc(index)||0));
  const key=id+':'+n;if(cache.has(key))return cache.get(key);
  const a=raw.frames[n],c=a[4],d=DATA.dict,p=DATA.evidence.parameters;
  const carrier={id:'carrier',x:c[0],y:c[1],state:d.carrierState[c[2]],battery:c[3],batteryKWh:c[4],batteryCapacityKWh:p.carrier_battery_kwh,supply:c[5],supplyKg:c[5],supplyPercent:100*c[5]/p.carrier_supply_kg,supplyCapacityKg:p.carrier_supply_kg,cargo:c[6],cargoKg:c[6],cargoCapacityKg:p.carrier_cargo_kg,onboard:c[7].map(robotId),capacity:DATA.robotIds.length,handlingRobot:robotId(c[8]),serviceRobot:robotId(c[9]),path:c[10]};
  const robots=a[5].map((r,i)=>({id:DATA.robotIds[i],x:r[0],y:r[1],state:d.robotState[r[2]],battery:r[3],material:r[4],cargo:r[5],batteryKWh:r[6],materialKg:r[7],cargoKg:r[8],onboard:r[9],task:r[10]<0?null:DATA.strips[r[10]].id,breakpointM:r[11],returnReason:d.returnReason[r[12]],distanceM:r[13],energyUsedKWh:r[14],queueWaitSeconds:r[15],activePath:r[16],progress:r[17]}));
  const strips=DATA.strips.map((s,i)=>Object.assign({},s,{state:d.stripState[a[6][2][i][0]],owner:robotId(a[6][2][i][1]),completed:d.stripState[a[6][2][i][0]]==='COMPLETED'?s.total:Math.min(s.total,a[6][2][i][2])}));
  const frame={schema_version:1,index:n,scenario:id,time:a[0],replayTime:a[1],status:d.status[a[2]],reason:a[3],carrier,robots,coverage:{completed:a[6][0],total,fraction:a[6][1],unit:'planned_strip_metres',strips},queue:a[7].map(robotId),bayOwner:robotId(a[8]),corridorOwner:robotId(a[9]),routeBlocked:a[10],eventIndex:a[11],scriptedOperator:a[12],map:DATA.map,fieldId:DATA.map.fields[0].id,parameters:p};
  // A bounded cache supports scrubbing without retaining every decoded object.
  if(cache.size>160)cache.delete(cache.keys().next().value);cache.set(key,frame);return frame;
}
function getFrames(id){return DATA.recordings[id].frames.map((_,i)=>getFrame(id,i));}
function getEvents(id){scenario(id);return DATA.recordings[id].events;}
function getFrameAtTime(id,replayTime){
 const frames=DATA.recordings[id].frames;let lo=0,hi=frames.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid][1]<=replayTime)lo=mid;else hi=mid-1;}return getFrame(id,lo);
}
function getChapters(id){
 const ev=getEvents(id),all=[];
 const defs=[['MISSION_START','运输出发'],['FIELD_ARRIVAL','抵达农田'],['WORK_START','开始作业'],['RETURN_REQUEST','资源返航'],['SERVICE_START','进入服务位'],['SERVICE_DONE','补给完成'],['ROUTE_BLOCKED','通道阻塞'],['ROBOT_FAULT','设备故障'],['ROUTE_CLEARED','操作员清障'],['FAULT_CLEARED','操作员复位'],['LOAD_START','开始回收'],['RETURN_TO_DEPOT','载具返场'],['MISSION_COMPLETE','任务完成']];
 for(const [type,label] of defs){const e=ev.find(x=>x.type===type);if(e)all.push({type,label,time:e.time,replayTime:e.replayTime,actor:e.actor,seq:e.seq});}
 return all.sort((a,b)=>a.replayTime-b.replayTime||a.seq-b.seq);
}
global.FarmReplay=Object.freeze({schemaVersion:1,scenarios:DATA.scenarios,map:DATA.map,strips:DATA.strips,robotIds:DATA.robotIds,evidence:DATA.evidence,getFrames,getFrame,getEvents,getFrameAtTime,getChapters,getFrameCount:id=>scenario(id).frameCount,getScenario:scenario});
"""


if __name__ == "__main__":
    main()
