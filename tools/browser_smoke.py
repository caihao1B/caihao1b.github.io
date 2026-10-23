#!/usr/bin/env python3
"""Optional Playwright checks. Default: HTTP preview; --inline: authored files embedded locally.
Install Playwright and its Chromium only when browser automation is desired; not needed to view/edit the site.
"""
from __future__ import annotations
import argparse
import base64
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

def inline_document(name: str) -> str:
    """Embed authored assets without URL navigation or modifying browser policies."""
    html = (ROOT / name).read_text(encoding='utf-8')
    def css(match):
        return '<style>'+(ROOT/match.group(1)).read_text(encoding='utf-8')+'</style>'
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', css, html)
    scripts: list[str] = []
    def js(match):
        scripts.append((ROOT/match.group(1)).read_text(encoding='utf-8')); return ''
    html = re.sub(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>', js, html)
    def media(match):
        tag = match.group(0)
        def value(attr):
            ref = attr.group(2)
            if urlsplit(ref).scheme: return attr.group(0)
            path = ROOT/ref
            mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            encoded = base64.b64encode(path.read_bytes()).decode('ascii')
            return f'{attr.group(1)}="data:{mime};base64,{encoded}"'
        return re.sub(r'(src|poster)="([^"]+)"', value, tag)
    html = re.sub(r'<(?:img|source|video)\b[^>]*>', media, html)
    return html.replace('</body>', ''.join('<script>'+s+'</script>' for s in scripts)+'</body>')

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--inline', action='store_true')
    parser.add_argument('--executable', help='Optional local Chromium executable')
    parser.add_argument('--output', type=Path, default=ROOT/'reports/concise-browser-checks.json')
    parser.add_argument('--screenshots', type=Path, default=ROOT/'reports/screenshots')
    args = parser.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Playwright is optional and not installed. Run check_site.py for dependency-free checks.', file=sys.stderr)
        return 2
    checks: list[dict] = []
    def check(name, fn):
        try:
            value = fn()
            checks.append({'name':name,'passed':True,'details':value})
            print('PASS '+name, flush=True)
        except Exception as exc:
            checks.append({'name':name,'passed':False,'error':str(exc)})
            print('FAIL '+name+': '+str(exc), flush=True)
    def require(condition, msg):
        if not condition: raise AssertionError(msg)
    def seek(page, selector, val):
        page.locator(selector).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}', val)
    args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        kwargs = {'headless':True}
        if args.executable: kwargs['executable_path'] = args.executable
        browser = p.chromium.launch(**kwargs)
        context = browser.new_context(viewport={'width':1440,'height':1000}, device_scale_factor=1)
        def load(name):
            page = context.new_page(); errors: list[str] = []
            page.on('pageerror', lambda err: errors.append(str(err)))
            if args.inline: page.set_content(inline_document(name), wait_until='load', timeout=20000)
            else: page.goto(args.base_url.rstrip('/')+'/'+name, wait_until='load', timeout=20000)
            page.set_default_timeout(5000)
            page.wait_for_timeout(150)
            return page, errors
        for width, height in [(1440,1000),(390,844)]:
            for filename in ['index.html','projects.html','ccpp.html','farm-carrier.html']:
                def layout(filename=filename,width=width,height=height):
                    context.set_default_timeout(5000)
                    pg, errors = load(filename); pg.set_viewport_size({'width':width,'height':height}); pg.wait_for_timeout(180)
                    info = pg.evaluate('''()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
                        tables:document.querySelectorAll('table').length,images:[...document.images].every(x=>x.complete&&x.naturalWidth>0)})''')
                    require(not errors, str(errors)); require(info['tables']==0, 'Visible project document has tables')
                    require(info['scrollWidth']<=width+1, f'Horizontal overflow: {info}')
                    require(info['images'], 'Broken image')
                    if width < 500:
                        pg.locator('.menu-btn').click()
                        require(pg.locator('.menu-btn').get_attribute('aria-expanded')=='true','Mobile navigation failed')
                        pg.locator('.menu-btn').click()
                    pg.screenshot(path=str(args.screenshots/(filename.replace('.html','')+f'_{width}.png')), full_page=True)
                    pg.close(); return info
                check(f'{filename}: {width}px layout, images, no tables, no errors', layout)
        pg, errors = load('ccpp.html')
        def cases():
            ids = pg.locator('#caseSelect option').evaluate_all('(els)=>els.map(x=>x.value)')
            require(len(ids)==10, str(ids))
            for value in ids:
                pg.select_option('#caseSelect', value)
                require(pg.evaluate('CCPPReplay.state.data.id')==value, value)
                require(pg.evaluate('Number.isFinite(CCPP_CURRENT_POSE.x)&&Number.isFinite(CCPP_CURRENT_POSE.y)'), 'Invalid pose '+value)
            pg.select_option('#caseSelect','square_ga')
            return {'cases':ids}
        check('CCPP: all ten preserved cases initialize', cases)
        def stages():
            for mode in ['grid','order','curve']:
                pg.locator(f'[data-stage="{mode}"]').click()
                require(pg.evaluate('CCPPReplay.state.stage')==mode, mode)
            pg.locator('#playButton').click(); pg.wait_for_timeout(300)
            require(pg.evaluate('CCPPReplay.state.t')>0, 'Playback did not advance')
            pg.locator('#playButton').click()
            require(not pg.evaluate('CCPPReplay.state.playing'), 'Pause did not stop')
            seek(pg,'#timeSlider',float(pg.locator('#timeSlider').get_attribute('max'))/2)
            require(pg.evaluate('CCPPReplay.state.t')>0,'Seek failed')
            pg.locator('#resetButton').click()
            require(pg.evaluate('CCPPReplay.state.t')==0,'Reset failed')
            return {'modes':3,'playPauseSeekReset':True}
        check('CCPP: views and playback controls', stages)
        def curves():
            pg.locator('#loopButton').click(); require(pg.evaluate('!!CCPPReplay.state.focus'),'No loop focus')
            pg.locator('#fullButton').click(); require(pg.evaluate('!CCPPReplay.state.focus'),'Full view failed')
            pg.locator('.inline-options summary').click(); pg.locator('#curveButton').click()
            require(pg.evaluate('!!CCPPReplay.state.focus'),'No curve focus')
            pg.locator('#labelsCheck').check();pg.locator('#rawCheck').check()
            pg.locator('#fullButton').click()
            return {'loopFocus':True,'curveFocus':True,'overlays':True}
        check('CCPP: focused turns and optional overlays', curves)
        def videos():
            pg.wait_for_function('Array.from(document.querySelectorAll("video")).every(v=>v.readyState>=1)', timeout=8000)
            return pg.locator('video').evaluate_all('(els)=>els.map(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error}))')
        check('CCPP: both preserved videos load metadata', videos)
        check('CCPP: no JavaScript exceptions during interactions', lambda: require(not errors,str(errors)))
        pg.close()
        pg, errors = load('farm-carrier.html')
        def scenarios():
            ids = pg.locator('#farmScenario option').evaluate_all('(els)=>els.map(x=>x.value)'); counts={}
            for sid in ids:
                pg.select_option('#farmScenario',sid)
                require(pg.locator('#farmMap').get_attribute('data-scenario')==sid,sid)
                counts[sid]=pg.evaluate('(id)=>FarmReplay.getFrameCount(id)', sid)
                seek(pg,'#farmTimeline',pg.locator('#farmTimeline').get_attribute('max'))
                require('3 / 3' in pg.locator('#carrierOnboard').inner_text(),'Incomplete end: '+sid)
                require(pg.locator('#coverageMeter').evaluate('(x)=>x.value')==1,'Fraction progress mismatch')
            pg.select_option('#farmScenario','normal')
            return {'scenarioFrames':counts,'total':sum(counts.values())}
        check('Farm: five original scenarios reach all-aboard completion', scenarios)
        def playback():
            pg.locator('#replayReset').click(); pg.locator('#replayPlay').click();pg.wait_for_timeout(300)
            require(float(pg.locator('#farmTimeline').input_value())>0,'Playback frozen')
            pg.locator('#replayPlay').click(); require(pg.locator('#replayPlay').inner_text()=='播放','Pause failed')
            pg.locator('#farmChapters button').nth(3).click()
            for rid in ['robot_2','robot_3','robot_1']:
                pg.locator(f'[data-robot="{rid}"]').click()
                require(pg.locator(f'[data-robot="{rid}"]').get_attribute('aria-pressed')=='true','Selection failed')
                require(rid[-1] in pg.locator('#agentName').inner_text(),'Agent name failed')
            for sel in ['#showTrails','#showLabels','#showStrips']:
                pg.locator(sel).uncheck();pg.locator(sel).check()
            for sel in ['#zoomIn','#zoomOut','#zoomFit']: pg.locator(sel).click()
            return {'playPauseChaptersAgentsMap':True}
        check('Farm: playback, chapter jumps, agents and map controls', playback)
        def tree():
            require(pg.locator('#farmTree .fg-node').count()==27,'Missing mission nodes')
            initial=pg.locator('#farmTree .fg-node:visible').count();require(initial<27,'Tree not compact initially')
            pg.locator('#expandTree').click();require(pg.locator('#farmTree .fg-node:visible').count()==27,'Expand failed')
            pg.locator('#farmTree .fg-node').last.click();require(len(pg.locator('#farmInspector').inner_text())>30,'Inspector empty')
            pg.locator('[data-tree-mode="agent"]').click()
            require(pg.locator('#farmTree .fg-node').count()==35,'Missing Agent nodes')
            pg.locator('#expandTree').click();require(pg.locator('#farmTree .fg-node:visible').count()==35,'Agent expansion failed')
            pg.locator('#collapseTree').click();require(pg.locator('#farmTree .fg-node:visible').count()<35,'Collapse failed')
            pg.locator('[data-tree-mode="mission"]').click()
            return {'missionNodes':27,'agentNodes':35,'missionInitiallyVisible':initial}
        check('Farm: full trees retained, compact defaults and inspectors', tree)
        def fsm():
            pg.locator('#tab-fsm').click();require(pg.locator('#state-machine').is_visible(),'FSM tab failed')
            require(not pg.locator('#logic-tree').is_visible(),'Tree panel not hidden')
            require(pg.locator('#farmFsm .fg-state').count()==13,'Robot states missing')
            pg.locator('#farmFsm [data-state="WORKING"]').click()
            pg.locator('[data-fsm-mode="carrier"]').click();require(pg.locator('#farmFsm .fg-state').count()==6,'Carrier states missing')
            pg.locator('#farmFsm .fg-edge-index summary').click()
            require(pg.locator('#farmFsm .transition-rules li').count()>0,'Transition descriptions missing')
            require(pg.locator('table').count()==0,'FSM created table')
            pg.locator('#tab-fsm').focus();pg.keyboard.press('ArrowLeft')
            require(pg.locator('#tab-tree').get_attribute('aria-selected')=='true','Keyboard tabs failed')
            return {'robotStates':13,'carrierStates':6,'keyboardTabs':True}
        check('Farm: tabbed state machines and readable transition rules', fsm)
        def locks():
            result={}
            for sid in ['blocked_return','robot_fault']:
                pg.select_option('#farmScenario',sid)
                frozen=pg.evaluate('(id)=>FarmReplay.getFrames(id).find(f=>f.status==="WAITING_RECOVERY" || f.missionState==="WAITING_RECOVERY")', sid)
                # Obtain the actual schema if status is carried as mission.status in future versions.
                if not frozen:
                    frozen=pg.evaluate('(id)=>FarmReplay.getFrames(id).find(f=>JSON.stringify(f).includes("WAITING_RECOVERY"))',sid)
                require(frozen is not None,'Missing recovery record '+sid)
                seek(pg,'#farmTimeline',frozen['replayTime'])
                require(pg.locator('#recoveryNote').is_visible(),'Recovery boundary not visible')
                result[sid]={'frame':frozen['index'],'replayTime':frozen['replayTime']}
            pg.select_option('#farmScenario','normal')
            seek(pg,'#farmTimeline',pg.locator('#farmTimeline').get_attribute('max'))
            pg.locator('.operational-details summary').click()
            require(pg.locator('#farmEvents button').count()>0,'Events missing')
            pg.locator('#farmEvents button').first.click()
            pg.locator('#filterAgentEvents').check()
            return result
        check('Farm: explicit recovery records and event navigation', locks)
        check('Farm: no JavaScript exceptions during interactions', lambda: require(not errors,str(errors)))
        pg.close();context.close();browser.close()
    report={'version':'concise-v2','generatedAt':datetime.now(timezone.utc).isoformat(),
            'transport':'inline authored HTML/CSS/JS/media, no URL navigation' if args.inline else 'HTTP navigation to '+args.base_url,
            'browser':'Chromium','limitations':'Not a live GitHub Pages or Windows App deployment test. No new Java simulation runs.',
            'checks':checks,'passed':all(c['passed'] for c in checks)}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"{sum(c['passed'] for c in checks)}/{len(checks)} checks passed. {args.output}")
    return 0 if report['passed'] else 1
if __name__=='__main__': sys.exit(main())
