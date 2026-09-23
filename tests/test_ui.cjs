// Run: NODE_PATH=/path/to/node_modules node tests/test_ui.cjs (jsdom >= 26).
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const errors=[],alerts=[],draws=[],downloads=[],svgExports=[];
let canvases=[];
function start(saved){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://analyzer.test',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    if(saved)w.localStorage.setItem('pemfc-sample-history-v1',saved);
    w.alert=m=>alerts.push(m);w.confirm=()=>true;
    w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
    Object.defineProperty(w.SVGElement.prototype,'viewBox',{get(){const [x,y,width,height]=this.getAttribute('viewBox').split(' ').map(Number);return {baseVal:{x,y,width,height}};}});
    w.Image=class{set src(v){svgExports.push(Buffer.from(v.split(',')[1],'base64').toString());Promise.resolve().then(()=>this.onload());}};
    w.HTMLCanvasElement.prototype.getContext=function(){canvases.push(this);return {fillRect(){},drawImage(...args){draws.push(args);}};};
    w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['PNG']));};
  }});return dom;
}
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 let dom=start(),w=dom.window,d=w.document;
 const el=id=>d.getElementById(id),click=id=>el(id).click();
 assert.equal(el('lsvData').open,true);
 click('wbDemo');await tick();assert.equal(el('wbTable').rows.length,3);
 assert.equal(el('wbCvPlot').querySelectorAll('polyline').length,2);
 assert(el('wbCvPlot').textContent.includes('Demo-Pt-1'));
 // Selection controls update both plots and download selection, preserve after refresh.
 let pick=d.querySelector('[aria-label="Compare Demo-Pt-1"]');pick.click();await tick();
 assert.equal(el('wbCvPlot').querySelectorAll('polyline').length,1);
 let name=d.querySelector('[aria-label="Sample name Demo-PtCo-1"]');name.value='PtCo <A&B>';
 name.parentElement.querySelector('button').click();await tick();
 assert(el('wbCvPlot').textContent.includes('PtCo <A&B>'));
 assert.equal(el('wbCvPlot').querySelectorAll('a,script').length,0);
 const saved=w.localStorage.getItem('pemfc-sample-history-v1');dom.window.close();
 dom=start(saved);w=dom.window;d=w.document;await tick();
 assert.equal(el('wbTable').rows.length,3);assert.equal(el('wbCvPlot').querySelectorAll('polyline').length,1);
 assert(el('wbCvPlot').textContent.includes('PtCo <A&B>'));
 // Comparison export embeds names, and can export CV alone.
 el('wbExportLsv').checked=false;click('wbPlotDownload');await tick();
 assert.equal(downloads.at(-1),'comparison.png');assert(svgExports.at(-1).includes('PtCo &lt;A&amp;B&gt;'));
 assert.equal(canvases.at(-1).height,634);
 // Legacy example still calculates and default summary includes exactly CV + LSV.
 click('loadExample');click('cvBtn');click('lsvBtn');await tick();
 assert(el('cvPlotFull').querySelector('svg'));assert(el('lsvPlot').querySelector('svg'),el('lsvMsg').textContent);
 assert(Number(el('o_ecsa').textContent)>0);
 const n=svgExports.length;click('summaryPng');await tick();assert.equal(svgExports.length-n,2);
 assert(svgExports.slice(n).every(xml=>!xml.includes('data-annotation')));
 assert.equal(canvases.at(-1).height,1200);
 el('exportLayout').value='wide';el('exportHupd').checked=true;el('exportMetrics').checked=true;el('exportAnnotations').checked=true;
 click('summaryPng');await tick();assert.equal(canvases.at(-1).width,1920);assert.equal(canvases.at(-1).height,1080);
 // Capture, restore, backup and CV-only capture.
 el('wbName').value='Real example';click('wbCapture');await tick();
 assert.equal(el('wbTable').rows.length,4,el('wbMessage').textContent);
 click('cvClear');click('lsvClear');
 assert.equal(el('lsvPlot').querySelector('svg'),null);
 const old=downloads.length;click('lsvPng');await tick();assert.equal(downloads.length,old);assert(alerts.at(-1).includes('Generate'));
 const row=[...el('wbTable').rows].find(r=>r.querySelector('input[aria-label="Sample name Real example"]'));
 [...row.querySelectorAll('button')].find(b=>b.textContent.includes('Restore')).click();await tick();
 assert(el('cvText').value.length>100);assert(el('lsvPlot').querySelector('svg'));
 click('lsvClear');el('wbName').value='CV only';click('wbCapture');await tick();assert.equal(el('wbTable').rows.length,5,el('wbMessage').textContent);
 // Invalid N2 coverage must not extrapolate or retain the previous LSV.
 click('loadExample');el('n2Text').value='2,0\n2.01,0';click('lsvBtn');await tick();
 assert(el('lsvMsg').textContent.includes('does not cover'));assert.equal(el('lsvPlot').querySelector('svg'),null);assert.equal(el('o_ma').textContent,'—');
 // Unit/input changes immediately invalidate stale data.
 click('loadExample');click('lsvBtn');el('lsvText').dispatchEvent(new w.Event('input'));assert.equal(el('lsvPlot').querySelector('svg'),null);
 // Language toggle remains usable with saved history.
 click('langToggle');await tick();assert.equal(d.documentElement.lang,'zh-CN');click('langToggle');await tick();assert.equal(d.documentElement.lang,'en');
 // Raw-history round trip and duplicate-name suffixing.
 const backup=w.localStorage.getItem('pemfc-sample-history-v1');
 Object.defineProperty(el('wbFiles'),'files',{configurable:true,value:[{text:async()=>backup}]});
 el('wbFiles').dispatchEvent(new w.Event('change'));await tick();
 assert.equal(el('wbTable').rows.length,9,el('wbMessage').textContent);
 assert(d.querySelector('[aria-label="Sample name Real example (2)"]'));
 // Storage quota failure is visible and does not discard the working history.
 const before=el('wbTable').rows.length;
 w.Storage.prototype.setItem=function(){throw Error('quota');};click('wbDemo');await tick();
 assert.equal(el('wbTable').rows.length,before+2);assert(el('wbStorage').textContent.includes('unavailable or full'));
 // Single-sample ECSA shares the workbench core, including non-default bounds.
 click('loadExample');el('hhi').value='0.35';el('hlo').value='0.073';click('cvBtn');click('lsvBtn');
 const exact=w.eval(`(()=>{const rows=parse2col($('cvText').value,$('cvPotUnit').value,$('cvCurUnit').value);return ECAnalysis.cvAnalysis({E:rows.map(r=>r[0]),j:rows.map(r=>r[1]*1000/num('area')),hupd_range_V:[num('hlo'),num('hhi')],scan_rate_V_s:scanRateV(),q_mC_cm2:qspecCmC()},computePtLoad()/1000)})()`);
 assert.equal(el('o_ecsa').textContent,exact.ecsa_m2_g.toFixed(2));
 const expectedSA=w.eval(`(()=>{const j=Math.abs(num('jE')),jl=Math.abs(num('jlim'));return j*jl/(jl-j)/(ecsaResult.ecsa_m2_g*computePtLoad()/100)})()`);
 assert.equal(el('o_sa').textContent,expectedSA.toFixed(3));
 click('cvClear');assert.equal(el('o_sa').textContent,'—');assert.notEqual(el('o_ma').textContent,'—');
 click('loadExample');el('qspec').value='0';click('cvBtn');assert.equal(el('o_ecsa').textContent,'—');assert.equal(el('o_sa').textContent,'—');
 el('qspec').value='0.21';el('qUnit').value='mC/cm²';
 el('cvText').value='potential,current\n0.1,0.001\n0.2,broken\n0.3,0.001';click('cvBtn');assert(el('cvMsg').textContent.includes('line 3'));assert.equal(el('cvPlotFull').querySelector('svg'),null);
 el('cvText').value='0.1,0.001\n0.2,,0.002';click('cvBtn');assert(el('cvMsg').textContent.includes('line 2'));
 // A reversed axis cannot silently produce inverted data.
 click('loadExample');el('hhi').value='0.4';el('hlo').value='0.05';click('cvBtn');
 el('cvXmin').value='0.5';el('cvXmax').value='0.1';click('cvApplyX');assert(alerts.at(-1).includes('Axis minimum'));
 assert.deepEqual(errors,[]);
 console.log('UI regressions passed: default-open, naming, selection, persistence, safe legends, restore, CV-only, PNG panel/options/layout, stale clearing, N2 coverage, bilingual toggle.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1);});
