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
 // PAAX parsing: bundled file, multiple blocks, duplicate names, invalid arrays and units.
 const paax=fs.readFileSync('sample_data/synthetic-demo.paax','utf8');
 const parsed=w.PAAX.parse(paax);assert(parsed.length>=3);assert(parsed.every(t=>!t.error));
 Object.defineProperty(el('paaxFile'),'files',{configurable:true,value:[{name:'demo.paax',text:async()=>paax}]});
 el('paaxFile').dispatchEvent(new w.Event('change'));await tick();
 assert.equal(el('paaxGroup').value,'all');assert.equal(el('paaxTrace').options.length,parsed.length);
 assert.equal(el('paaxO2').disabled,true);
 const filter=group=>{el('paaxGroup').value=group;el('paaxGroup').dispatchEvent(new w.Event('change'));};
 filter('o2');assert.equal(el('paaxO2').disabled,false);assert.equal(el('paaxN2').disabled,true);
 click('paaxO2');assert.equal(el('o2PotUnit').value,'V');assert.equal(el('o2CurUnit').value,'A');
 assert.equal(el('lsvText').value.split('\n').length,parsed[0].X.length);
 click('lsvBtn');assert(el('lsvPlot').querySelector('svg'));assert(!el('n2Text').value);
 const trace='<DAB_node type="trace"><name encoding="mixed">Test%20%26%20LSV</name><X_units qty_kind="potential"><X_unit>mV</X_unit></X_units><Y_units qty_kind="current"><Y_unit>mA</Y_unit></Y_units><points quantity="2"><X_data>100,200</X_data><Y_data>1,2</Y_data></points><points quantity="1"><X_data>300</X_data><Y_data>3</Y_data></points></DAB_node>';
 const custom='<DAB>'+trace+trace+'</DAB>',dup=w.PAAX.parse(custom);
 assert.equal(dup[1].name,'Test & LSV (2)');assert.equal(dup[0].X.length,3);
 assert(w.PAAX.parse(custom.replace('<Y_data>1,2</Y_data>','<Y_data>1</Y_data>'))[0].error);
 assert(w.PAAX.parse(custom.replace('100,200','100,garbage'))[0].error);
 assert(w.PAAX.parse(custom.replace('<X_unit>mV','<X_unit>bogus'))[0].error);
 assert.throws(()=>w.PAAX.parse('<DAB>'));
 Object.defineProperty(el('paaxFile'),'files',{configurable:true,value:[{name:'units.paax',text:async()=>custom}]});
 el('paaxFile').dispatchEvent(new w.Event('change'));await tick();
 el('o2PotUnit').value='mV';el('lsvText').value='100,0.001\n200,0.002';el('o2CurUnit').value='A';
 click('paaxN2');assert.equal(el('lsvText').value,'0.1,0.001\n0.2,0.002');
 assert.equal(el('n2Text').value,'0.1,0.001\n0.2,0.002\n0.3,0.003');assert.equal(el('o2PotUnit').value,'V');
 assert.equal(el('paaxCv').disabled,true);assert.equal(el('cvText').value,'');
 const spec='<DAB_node type="X_spec" parent="3"><content><CV/></content></DAB_node>';
 const mislabeled=trace.replace('</name>','</name><experiment>3</experiment>');
 const withCopies=w.PAAX.catalog('<DAB>'+spec+mislabeled+mislabeled+mislabeled.replace('100,200','100,210')+'</DAB>');
 assert.equal(withCopies.duplicates,1);
 assert.deepEqual(Array.from(withCopies.candidates,t=>t.group),['cv','cv']);
 assert(!Object.hasOwn(withCopies.candidates[0],'X'));
 const axis='<X_units qty_kind="potential"/><Y_units qty_kind="current"/>';
 const x=Array.from({length:31},(_,i)=>.2+i/30);
 function datedTrace(label,hour,minute,values,rate){
   const time=`2026-01-01T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`;
   const rateXML=rate?`<metadata><object_map><map_pair><tag><exp_param_tag name="sweep_rate"/></tag><value><measurement_box><value><f64>${rate}</f64></value><unit><measurement_unit unit_name="volt_per_second"/></unit></measurement_box></value></map_pair></object_map></metadata>`:'';
   return `<DAB_node type="study"><name>${label}</name><created>${time}</created><DAB_node type="trace"><data>${axis}<points><X_data>${x}</X_data><Y_data>${values}</Y_data></points>${rateXML}</data></DAB_node></DAB_node>`;
 }
 const background=x.map((_,i)=>2e-6*Math.sin(i));
 const oxygen=x.map((_,i)=>i<16?-.001:-.0001);
 const chron='<DAB>'+[datedTrace('CV',9,0,background,.1),datedTrace('CV',9,3,background,.02),datedTrace('LSV',9,6,background),datedTrace('LSV',9,9,oxygen),datedTrace('CV',10,0,background,.1),datedTrace('CV',10,3,background,.02),datedTrace('LSV',10,6,background),datedTrace('LSV',10,9,oxygen)].reverse().join('')+'</DAB>';
 const grouped=w.PAAX.catalog(chron);
 assert.equal(grouped.batches.length,2);
 for(const batch of grouped.batches)assert.deepEqual(Array.from(batch.traces,t=>t.group),['cv-activation','cv-ecsa','n2','o2']);
 Object.defineProperty(el('paaxFile'),'files',{configurable:true,value:[{name:'chronological.paax',text:async()=>chron}]});
 await el('paaxFile').onchange();
 assert.equal(el('paaxBatch').value,'2');assert.equal(el('paaxTrace').options.length,4);
 assert(el('paaxTrace').selectedOptions[0].textContent.includes('20 mV/s'));
 el('paaxBatch').value='1';el('paaxBatch').onchange();filter('n2');
 assert.equal(el('paaxTrace').options.length,1);assert.equal(el('paaxN2').disabled,false);assert.equal(el('paaxO2').disabled,true);
 // AfterMath stores trace units and rate under data, and links studies by index.
 const pine='<DAB_node_list><DAB_node type="study" index="1"><name>CV%20test</name></DAB_node><DAB_node type="plot" index="2" parent="1"/><DAB_node type="trace" parent="2"><name>Current%20vs%20Potential</name><data><X_units qty_kind="potential"/><Y_units qty_kind="current"/><points quantity="5"><X_data>0.1,0.052,0.057,0.2,0.5</X_data><Y_data>0,0,0.00001,0.00002,0</Y_data></points><metadata><object_map><map_pair><tag><exp_param_tag name="sweep_rate"/></tag><value><measurement_box><value><f64>0.05</f64></value><unit><measurement_unit unit_name="volt_per_second" unit_prefix="milli"/></unit></measurement_box></value></map_pair></object_map></metadata></data></DAB_node><DAB_node type="trace" parent="2"/></DAB_node_list>';
 const pineTraces=w.PAAX.parse(pine);
 assert.equal(pineTraces[0].name,'CV test · Current vs Potential');
 assert.equal(pineTraces[1].error,'Missing X_units or Y_units');
 Object.defineProperty(el('paaxFile'),'files',{configurable:true,value:[{name:'pine.paax',text:async()=>pine}]});
 el('paaxFile').dispatchEvent(new w.Event('change'));await tick();
 assert.equal(el('paaxTrace').options.length,1);assert.equal(el('paaxTable'),null);
 click('paaxCv');assert.equal(el('vrate').value,'0.05');assert.equal(el('vUnit').value,'V/s');
 click('cvBtn');assert(el('cvMsg').textContent.includes('0.052–0.4 V'));
 assert.equal(el('hlo').value,'0.05');assert(el('cvMsg').textContent.includes('0.05–0.4 V'));
 assert(Number(el('o_ecsa').textContent)>0);assert.equal(el('cvUseCoveredRange').hidden,true);
 el('cvTrimBounds').checked=false;click('cvBtn');assert.equal(el('o_ecsa').textContent,'—');
 assert.equal(el('cvUseCoveredRange').hidden,false);assert(el('cvPlotFull').querySelector('svg'));
 click('cvUseCoveredRange');assert.equal(el('hlo').value,'0.052');assert(Number(el('o_ecsa').textContent)>0);
 el('cvTrimBounds').checked=true;el('hlo').value='0.04';click('cvBtn');
 assert.equal(el('cvUseCoveredRange').hidden,false);assert.equal(el('o_ecsa').textContent,'—');
 el('cvText').dispatchEvent(new w.Event('input'));assert.equal(el('cvUseCoveredRange').hidden,true);
 el('vrate').value='0.02';el('hlo').value='0.05';
 click('cvClear');click('lsvClear');click('n2Clear');

 // The plot and integration both use the second recorded pair, with all points retained.
 const cycleE=[0,.2,.4,.2,0,.2,.4,.2,0,.2,.4,.2,0];
 const cycleI=cycleE.map((_,i)=>({1:1e-4,5:2e-4,9:3e-4}[i]||0));
 const bounds=[1,3,5,7,9,11].map(id=>`<list_item point_ID="${id}" segment_boundary="yes"/>`).join('');
 const cyclesXML=`<DAB><DAB_node type="trace"><name>CV</name><data>${axis}<boundaries>${bounds}</boundaries><points><X_data>${cycleE}</X_data><Y_data>${cycleI}</Y_data></points></data></DAB_node></DAB>`;
 Object.defineProperty(el('paaxFile'),'files',{configurable:true,value:[{name:'cycles.paax',text:async()=>cyclesXML}]});
 await el('paaxFile').onchange();click('paaxCv');el('vrate').value='0.02';
 el('hlo').value='0';
 assert.equal(el('cvCycle').value,'2');assert.equal(el('cvText').value.split('\n').length,13);
 click('cvBtn');assert(el('cvMsg').textContent.includes('Cycle 2'));
 assert(el('cvPlotFull').textContent.includes('Cycle 2'));
 assert.equal(el('cvPlotFull').querySelector('polyline').getAttribute('points').split(' ').length,5);
 const secondArea=Number(el('o_SH').textContent);
 el('cvCycle').value='3';el('cvCycle').dispatchEvent(new w.Event('change'));
 assert(el('cvMsg').textContent.includes('Cycle 3'));
 assert(Math.abs(Number(el('o_SH').textContent)/secondArea-1.5)<.001);
 const pasted=el('cvText').value;
 el('cvText').dispatchEvent(new w.Event('input'));assert.equal(el('cvText').value,pasted);
 click('cvBtn');assert.equal(el('cvCycle').value,'2');
 click('cvClear');el('hlo').value='0.05';

 click('wbDemo');await tick();assert.equal(el('wbTable').rows.length,3);
 assert.equal(el('wbCvPlot').querySelectorAll('polyline').length,2);
 assert(el('wbCvPlot').textContent.includes('Demo-A-1'));
 // Selection controls update both plots and download selection, preserve after refresh.
 let pick=d.querySelector('[aria-label="Compare Demo-A-1"]');pick.click();await tick();
 assert.equal(el('wbCvPlot').querySelectorAll('polyline').length,1);
 let name=d.querySelector('[aria-label="Sample name Demo-B-1"]');name.value='PtCo <A&B>';
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
 const originalExample=JSON.parse(fs.readFileSync('web/example.json','utf8'));
 click('loadExample');
 assert.equal(el('wbName').value,'Example');
 assert.equal(el('cvText').value,originalExample.cv);
 assert.equal(el('n2Text').value,originalExample.n2);
 assert.equal(el('lsvText').value,originalExample.o2);
 click('cvBtn');click('lsvBtn');await tick();
 assert(el('cvPlotFull').querySelector('svg'));assert(el('lsvPlot').querySelector('svg'),el('lsvMsg').textContent);
 assert(Number(el('o_ecsa').textContent)>0);
 const n=svgExports.length;click('summaryPng');await tick();assert.equal(svgExports.length-n,2);
 assert(svgExports.slice(n).every(xml=>!xml.includes('data-annotation')));
 assert.equal(canvases.at(-1).height,1200);
 el('exportLayout').value='wide';el('exportHupd').checked=true;el('exportMetrics').checked=true;el('exportAnnotations').checked=true;
 click('summaryPng');await tick();assert.equal(canvases.at(-1).width,1920);assert.equal(canvases.at(-1).height,1080);
 // Capture, restore, backup and CV-only capture.
 el('wbName').value='Synthetic example';click('wbCapture');await tick();
 assert.equal(el('wbTable').rows.length,4,el('wbMessage').textContent);
 click('cvClear');click('lsvClear');
 assert.equal(el('lsvPlot').querySelector('svg'),null);
 const old=downloads.length;click('lsvPng');await tick();assert.equal(downloads.length,old);assert(alerts.at(-1).includes('Generate'));
 const row=[...el('wbTable').rows].find(r=>r.querySelector('input[aria-label="Sample name Synthetic example"]'));
 [...row.querySelectorAll('button')].find(b=>b.textContent.includes('Restore')).click();await tick();
 assert(el('cvText').value.length>100);assert(el('lsvPlot').querySelector('svg'));
 click('lsvClear');el('wbName').value='CV only';click('wbCapture');await tick();assert.equal(el('wbTable').rows.length,5,el('wbMessage').textContent);
 // Invalid N2 coverage must not extrapolate or retain the previous LSV.
 click('loadExample');el('n2Text').value='2,0\n2.01,0';click('lsvBtn');await tick();
 assert(el('lsvMsg').textContent.includes('does not cover'));assert.equal(el('lsvPlot').querySelector('svg'),null);assert.equal(el('o_ma').textContent,'—');
 // Each clear action preserves the other raw dataset and invalidates results.
 click('loadExample');click('lsvBtn');
 const retainedN2=el('n2Text').value;click('lsvClear');
 assert.equal(el('lsvText').value,'');assert.equal(el('n2Text').value,retainedN2);
 assert.equal(el('lsvPlot').querySelector('svg'),null);assert.equal(el('o_ma').textContent,'—');
 click('loadExample');click('lsvBtn');
 const retainedO2=el('lsvText').value;click('n2Clear');
 assert.equal(el('n2Text').value,'');assert.equal(el('lsvText').value,retainedO2);
 assert.equal(el('lsvPlot').querySelector('svg'),null);assert.equal(el('o_ma').textContent,'—');
 // Unit/input changes immediately invalidate stale data.
 click('loadExample');click('lsvBtn');el('lsvText').dispatchEvent(new w.Event('input'));assert.equal(el('lsvPlot').querySelector('svg'),null);
 // Language toggle remains usable with saved history.
 click('langToggle');await tick();assert.equal(d.documentElement.lang,'zh-CN');click('langToggle');await tick();assert.equal(d.documentElement.lang,'en');
 // Raw-history round trip and duplicate-name suffixing.
 const backup=w.localStorage.getItem('pemfc-sample-history-v1');
 Object.defineProperty(el('wbFiles'),'files',{configurable:true,value:[{text:async()=>backup}]});
 el('wbFiles').dispatchEvent(new w.Event('change'));await tick();
 assert.equal(el('wbTable').rows.length,9,el('wbMessage').textContent);
 assert(d.querySelector('[aria-label="Sample name Synthetic example (2)"]'));
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
 // The plotted line stays measured below the baseline; only the fill is clipped.
 el('cvText').value=[0,.1,.2,.3,.4].map((e,i)=>[e,[-1,1,-1,1,-1][i]*Number(el('area').value)/1000].join(',')).join('\n');
 el('hlo').value='0';el('hhi').value='.4';el('baselineMode').value='manual';el('baseline').value='0';click('cvBtn');
 const region=w.eval('lastCvZoom.region');
 assert(Math.abs(region.current[0]+1)<1e-12);assert.equal(region.upper[0],0);
 assert(Math.abs(region.area-.1)<1e-12);
 assert(el('cvPlotZoom').textContent.includes('Input anodic sweep'));
 assert(el('cvPlotZoom').querySelector('[data-annotation="fill"]'));
 el('cvXmin').value='0';el('cvXmax').value='.4';click('cvApplyX');
 assert(el('cvPlotZoom').textContent.includes('Input anodic sweep'));
 // A sloped manual background is used for both the fill and saved samples.
 el('cvXmin').value='';el('cvXmax').value='';
 el('cvText').value=[0,.1,.2].map((e,i)=>[e,[-1,1.1,-.8][i]*Number(el('area').value)/1000].join(',')).join('\n');
 el('hlo').value='0';el('hhi').value='.2';el('baselineMode').value='linear';
 el('baselineMode').dispatchEvent(new w.Event('input'));
 assert.notEqual(el('linearBaselineFields').style.display,'none');
 el('baselineStart').value='0';el('baselineEnd').value='';click('cvBtn');
 assert(el('cvMsg').textContent.includes('both finite baseline endpoint'));
 el('baselineEnd').value='.2';click('cvBtn');
 const slopeRegion=w.eval('lastCvZoom.region');
 assert(Math.abs(slopeRegion.area-.05)<1e-12);
 assert.equal(slopeRegion.baseline[0],0);assert(Math.abs(slopeRegion.baseline.at(-1)-.2)<1e-12);
 el('wbName').value='Sloped synthetic';click('wbCapture');await tick();
 const slopeRow=[...el('wbTable').rows].find(r=>r.querySelector('input[aria-label="Sample name Sloped synthetic"]'));
 assert(slopeRow,el('wbMessage').textContent);click('cvClear');
 [...slopeRow.querySelectorAll('button')].find(b=>b.textContent.includes('Restore')).click();await tick();
 assert.equal(el('baselineMode').value,'linear');assert.equal(Number(el('baselineStart').value),0);assert.equal(Number(el('baselineEnd').value),.2);
 assert(Math.abs(w.eval('lastCvZoom.region.area')-.05)<1e-12);
 el('cvXmin').value='';el('cvXmax').value='';el('baselineMode').value='origin';
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
