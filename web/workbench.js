/* Workbench UI: source embedded by build_html.py, no external runtime dependency. */
(() => {
  let samples=[],analysis=null,kl=null,selected=new Set();
  const historyKey='pemfc-sample-history-v1';
  const inputIds=['cvText','lsvText','n2Text','cvPotUnit','cvCurUnit','o2PotUnit','o2CurUnit','n2CurUnit','vrate','vUnit','qspec','qUnit','area','inkConc','dropVol','ptFrac','hlo','hhi','baselineMode','baseline','Ep','jlimMode','jlimE','wbRef','wbPH','wbRu','wbWidth','wbSlope','wbTafelLo','wbTafelHi'];
  const T=(en,zh)=>window.uiT?window.uiT(en,zh):en+' · '+zh;
  function saveHistory(){
    try{localStorage.setItem(historyKey,JSON.stringify({history_version:1,samples,selected:[...selected]}));$('wbStorage').textContent=T('History saved locally.','历史已保存在本地。');}
    catch(e){$('wbStorage').textContent=T('Local storage unavailable or full. Back up history JSON now; current samples remain in memory.','本地存储不可用或已满；请立即备份历史 JSON。当前样品仍在内存中。');}
  }
  function analyzeSaved(s){
    if(s.orr)return ECAnalysis.analyzeSample(s);
    if(!s.cv)throw Error(T('Provide CV or O2 data.','请提供 CV 或 O₂ 数据。'));
    if(s.loading_mg_cm2!=null&&!(Number.isFinite(s.loading_mg_cm2)&&s.loading_mg_cm2>0))throw Error('Invalid Pt loading');
    const cv=ECAnalysis.cvAnalysis(s.cv,s.loading_mg_cm2);
    return {sample_id:s.sample_id,metrics:{ecsa_m2_g:cv.ecsa_m2_g,ehalf_V:null,jlim_mA_cm2:null,ma_0_9V_A_mg:null,sa_0_9V_mA_cm2_Pt:null,tafel_mV_dec:null},qc:{status:'Check recommended',checks:[{code:'cv_only',status:'Check recommended',reason:'CV only; ORR data unavailable',value:null}]},cv,plateau:null,tafel:null,settings:{loading_mg_cm2:s.loading_mg_cm2??null,cv:Object.fromEntries(Object.entries(s.cv).filter(([k])=>!['E','j'].includes(k)))},metadata:s.metadata||{},processed_cv:s.cv.E.map((e,i)=>({sample_id:s.sample_id,point_index:i,potential_V_RHE:e,j_mA_cm2:s.cv.j[i]})),processed_orr:[]};
  }
  function selectedAnalysis(){return analysis?{...analysis,samples:analysis.samples.filter(s=>selected.has(s.sample_id))}:null;}
  function nextName(){let n=1;while(samples.some(s=>s.sample_id===`Sample-${n}`))n++;$('wbName').value=`Sample-${n}`;}
  function restoreInputs(sample){
    if(!sample.input_state){$('wbMessage').textContent=T('This imported sample has no original input form; its curves remain available for comparison.','此导入样品没有原始输入表单；仍可参与曲线比较。');return;}
    $('cvClear').click();$('lsvClear').click();$('n2Clear').click();
    for(const id of inputIds)if(Object.hasOwn(sample.input_state,id))$(id).value=sample.input_state[id];
    $('wbName').value=sample.sample_id;computePtLoad();
    if($('cvText').value.trim())calcECSA();if($('lsvText').value.trim())$('lsvBtn').click();
    $('wbMessage').textContent=T('Inputs restored. Change the name to save a new snapshot.','已恢复输入；如需另存快照，请修改样品名称。');
  }
  const colors=['#0071e3','#d70015','#00875a','#8b42bd','#b07800','#007f8b'];
  const text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;};
  const display=v=>v===null||v===undefined?'—':typeof v==='number'?v.toPrecision(6):String(v);
  function checkDetail(c){
    const v=c.value;if(v===null||c.code==='plateau')return '';
    if(c.code==='cv_stability')return ` Difference: ${(100*v).toFixed(2)}%.`;
    if(c.code==='transport_0_9V')return ` Ratio: ${(100*v).toFixed(2)}%.`;
    if(c.code==='plateau_sensitivity')return ` jlim change: ${v.jlim_relative===null?'unavailable':(100*v.jlim_relative).toFixed(2)+'%'}; MA change: ${v.ma_relative===null?'unavailable':(100*v.ma_relative).toFixed(2)+'%'}${v.singular?'; singular correction encountered':''}.`;
    if(c.code==='tafel')return ` ${display(v.slope_mV_dec)} mV/dec; R² ${display(v.r2)}; ${v.count} points.`;
    return '';
  }
  function download(name,content){const url=URL.createObjectURL(new Blob([content],{type:name.endsWith('.json')?'application/json':'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function snapshot(){
    const area=num('area'),loading=computePtLoad()/1000,ref=$('wbRef').value,pH=num('wbPH'),ru=num('wbRu');
    if(!(area>0)||!Number.isFinite(pH)||!(ru>=0))throw Error('Check area, pH and Ru');
    const offsets={RHE:0,SHE:0,AgAgCl_satKCl:0.197,AgAgCl_3M:0.210,SCE:0.241,MSE:0.640};
    const shift=ref==='RHE'?0:offsets[ref]+8.314462618*298.15/96485.33212*2.302585093*pH;
    const read=(id,pot,cur)=>{const rows=parse2col($(id).value,$(pot).value,$(cur).value);return {E:rows.map(r=>r[0]+shift-r[1]*ru),j:rows.map(r=>r[1]*1000/area)};};
    const s={sample_id:$('wbName').value.trim(),loading_mg_cm2:loading,orr:read('lsvText','o2PotUnit','o2CurUnit'),
      qc_options:{min_width_V:num('wbWidth'),slope_fraction_per_V:num('wbSlope')},tafel_range_V:[num('wbTafelLo'),num('wbTafelHi')],
      metadata:{source:'browser_capture',reference:ref,pH,temperature_K:298.15,additional_Ru_ohm:ru,area_cm2:area}};
    if(!$('lsvText').value.trim())delete s.orr;
    if(s.orr&&$('n2Text').value.trim()){
      let n=read('n2Text','o2PotUnit','n2CurUnit');
      // Preserve the original N2 full-CV workflow by selecting the last forward branch.
      if(!n.E.slice(1).every((v,i)=>v>n.E[i])&&!n.E.slice(1).every((v,i)=>v<n.E[i])){
        const branches=ECAnalysis.sweeps(n.E,n.j).filter(([x])=>x.at(-1)>x[0]);
        if(!branches.length)throw Error('No forward N2 sweep');const [E,j]=branches.at(-1);n={E,j};s.metadata.n2_selection='last_anodic_sweep';
      }
      const [nx,ny]=ECAnalysis.curve(n.E,n.j);s.n2={E:nx,j:ny};
      const keep=s.orr.E.map((e,i)=>({e,j:s.orr.j[i]})).filter(p=>p.e>=nx[0]&&p.e<=nx.at(-1));
      s.metadata.o2_points_outside_n2=s.orr.E.length-keep.length;
      s.orr={E:keep.map(p=>p.e),j:keep.map(p=>p.j)};
      if(s.orr.E.length<2)throw Error('N2 does not cover the O2 sweep');

    }
    if($('cvText').value.trim()){
      s.cv={...read('cvText','cvPotUnit','cvCurUnit'),scan_rate_V_s:scanRateV(),q_mC_cm2:qspecCmC(),hupd_range_V:[num('hlo'),num('hhi')]};
      if($('baselineMode').value==='manual'){if(!Number.isFinite(num('baseline')))throw Error('Enter a finite manual baseline / 请填写有效手动基线');s.cv.baseline_mA_cm2=num('baseline');}
    }s.input_state=Object.fromEntries(inputIds.map(id=>[id,$(id).value]));s.saved_at=new Date().toISOString();return s;
  }
  function render(){
    $('wbTable').replaceChildren();$('wbQC').replaceChildren();$('wbLegend').replaceChildren();$('wbDownloads').replaceChildren();
    for(const id of ['wbCvPlot','wbOrrPlot'])$(id).replaceChildren();
    if(!analysis)return;
    const head=text('tr','',$('wbTable'));
    ['Compare · 比较','Sample','ECSA (m²/gPt)','E1/2 (V)','jlim (mA/cm²)','MA@0.9V (A/mgPt)','SA@0.9V (mA/cm²Pt)','Tafel (mV/dec)','QC','Actions · 操作'].forEach(v=>text('th',v,head));
    analysis.samples.forEach((s,i)=>{
      const row=text('tr','',$('wbTable')),pick=document.createElement('input');pick.type='checkbox';pick.style.width='auto';pick.checked=selected.has(s.sample_id);pick.setAttribute('aria-label','Compare '+s.sample_id);
      pick.onchange=()=>{if(pick.checked)selected.add(s.sample_id);else selected.delete(s.sample_id);saveHistory();render();};text('td','',row).append(pick);
      const nameCell=text('td','',row),name=document.createElement('input');name.value=s.sample_id;name.maxLength=80;name.style.minWidth='140px';name.setAttribute('aria-label','Sample name '+s.sample_id);nameCell.append(name);
      const rename=text('button',T('Rename','重命名'),nameCell);rename.className='btn btn-secondary';rename.onclick=guarded(()=>{
        const value=name.value.trim();
        const next=samples.map(t=>t.sample_id===s.sample_id?{...t,sample_id:value}:t);
        commit(next,new Set([...selected].map(id=>id===s.sample_id?value:id)));
      });
      [...ECAnalysis.resultFields.slice(1,-1).map(k=>s.metrics[k]),s.qc.status].forEach(v=>text('td',display(v),row));
      const actions=text('td','',row),restore=text('button',T('Restore inputs','恢复输入'),actions);restore.className='btn btn-secondary';restore.onclick=()=>restoreInputs(samples[i]);restore.disabled=!samples[i].input_state;
      const remove=text('button','Remove',actions);remove.className='btn btn-secondary';remove.onclick=guarded(()=>commit(samples.filter(t=>t.sample_id!==s.sample_id)));
      if(!selected.has(s.sample_id))return;
      const detail=text('details','',$('wbQC'));text('summary',`${s.sample_id} — ${s.qc.status}`,detail);
      if(s.plateau)text('p',`Plateau: ${display(s.plateau.start_V)}–${display(s.plateau.end_V)} V; median ${display(s.plateau.jlim_mA_cm2)}; MAD ${display(s.plateau.mad_mA_cm2)}; SD ${display(s.plateau.std_mA_cm2)} mA/cm²`,detail);
      if(s.metadata?.o2_points_outside_n2)text('p',`${s.metadata.o2_points_outside_n2} O2 endpoint(s) outside N2 coverage omitted · 已省略 N₂ 范围外的 O₂ 端点。`,detail);
      const list=text('ul','',detail);s.qc.checks.forEach(c=>text('li',`${c.status}: ${c.reason}${checkDetail(c)}`,list));
    });
    for(const [id,key,jkey,title] of [['wbCvPlot','processed_cv','j_mA_cm2','CV comparison'],['wbOrrPlot','processed_orr','j_corrected_mA_cm2','ORR comparison']]){
      const series=analysis.samples.map((s,i)=>({name:s.sample_id,x:s[key].filter(r=>Number.isFinite(r[jkey])).map(r=>r.potential_V_RHE),y:s[key].filter(r=>Number.isFinite(r[jkey])).map(r=>r[jkey]),color:colors[i%colors.length]})).filter(s=>selected.has(s.name)&&s.x.length);
      if(series.length)svgChart($(id),series,{title,xlabel:'E (V vs RHE)',ylabel:'j (mA/cm²)'});
    }
    for(const name of ['analysis.json','results.csv','processed_cv.csv','processed_orr.csv','summary.csv']){
      const b=text('button',`Download ${name}`,$('wbDownloads'));b.className='btn btn-secondary';b.disabled=!selected.size;b.onclick=()=>download(name,ECAnalysis.exports({...selectedAnalysis(),...(kl?{kl}:{})})[name]);
    }
  }
  function commit(next,selection=null,persist=true){
    const ids=next.map(s=>s?.sample_id);
    if(ids.some(id=>typeof id!=='string'||!id.trim()||id.length>80)||new Set(ids).size!==ids.length)throw Error(T('Use unique, nonempty sample names (up to 80 characters).','样品名称不能为空、不能重复，最多 80 字符。'));
    const result=next.length?{schema_version:'1.0.0',units:{potential:'V vs RHE',current_density:'mA/cm2',loading:'mgPt/cm2'},samples:next.map(analyzeSaved)}:null;
    const previous=new Set(samples.map(s=>s.sample_id));
    selected=selection||new Set(ids.filter(id=>selected.has(id)||!previous.has(id)));
    selected=new Set([...selected].filter(id=>ids.includes(id)));
    samples=next;analysis=result;render();if(persist)saveHistory();$('wbMessage').textContent=`${samples.length} sample(s) analyzed. Results are snapshots.`;
  }
  function guarded(fn){return async()=>{try{await fn();}catch(e){$('wbMessage').textContent=e.message;}};}
  $('wbCapture').onclick=guarded(()=>{commit([...samples,snapshot()]);nextName();});
  $('wbClear').onclick=()=>{if(confirm(T('Clear all saved samples? Back up history first.','清空全部历史样品？请先备份历史。')))commit([]);};
  $('wbSelectAll').onclick=()=>{selected=new Set(samples.map(s=>s.sample_id));saveHistory();render();};
  $('wbSelectNone').onclick=()=>{selected.clear();saveHistory();render();};
  $('wbBackup').onclick=()=>download('sample_history.json',JSON.stringify({history_version:1,samples,selected:[...selected]},null,2));
  $('wbFiles').onchange=guarded(async()=>{
    try {
      const added=[];
      for(const f of $('wbFiles').files){
        const p=JSON.parse(await f.text()),items=p.samples||[p];if(!Array.isArray(items))throw Error('Invalid samples JSON');
        for(const item of items){
          if(item?.qc?.checks?.some(c=>c.code==='n2_background'&&c.status==='Invalid'))throw Error('Invalid N2 analysis cannot be reconstructed; import the raw history backup / N₂ 无效分析无法重建，请导入原始历史备份');
          let raw=item;
          // Reimport analysis.json as well as raw history; retain original raw O2/N2 when present.
          if(!item.orr&&Array.isArray(item.processed_orr)){
            raw={sample_id:item.sample_id,loading_mg_cm2:item.settings?.loading_mg_cm2??null,metadata:item.metadata||{}};
            if(item.processed_orr.length){raw.orr={E:item.processed_orr.map(r=>r.potential_V_RHE),j:item.processed_orr.map(r=>r.j_raw_mA_cm2)};
              if(item.processed_orr.every(r=>Number.isFinite(r.j_background_mA_cm2)))raw.n2={E:raw.orr.E,j:item.processed_orr.map(r=>r.j_background_mA_cm2)};}
            if(item.processed_cv?.length)raw.cv={...item.settings?.cv,E:item.processed_cv.map(r=>r.potential_V_RHE),j:item.processed_cv.map(r=>r.j_mA_cm2)};
            raw.qc_options=item.settings?.qc_options;raw.tafel_range_V=item.settings?.tafel_range_V;
          }
          const original=String(raw.sample_id||'Imported').slice(0,70);let name=original,n=2;
          while([...samples,...added].some(s=>s.sample_id===name))name=`${original} (${n++})`;
          added.push({...raw,sample_id:name});
        }
      }
      commit([...samples,...added]);nextName();
    }finally{$('wbFiles').value='';}
  });
  $('wbPlotDownload').onclick=()=>{
    const els=[];if($('wbExportCv').checked)els.push($('wbCvPlot'));if($('wbExportLsv').checked)els.push($('wbOrrPlot'));
    exportPNGCombined(els,'comparison.png');
  };
  function demoSample(id,center){
    const E=Array.from({length:201},(_,i)=>0.2+i*0.004),j=E.map(e=>-6/(1+Math.exp((e-center)/0.025)));
    const ce=[],cj=[];for(let cycle=0;cycle<3;cycle++){for(let i=0;i<100;i++){const e=i/100;ce.push(e);cj.push(0.08+0.7*Math.exp(-(((e-0.18)/0.07)**2)));}for(let i=100;i>0;i--){ce.push(i/100);cj.push(-0.08);}}ce.push(0);cj.push(0.08);
    return {sample_id:id,orr:{E,j},n2:{E,j:E.map(()=>0)},cv:{E:ce,j:cj,scan_rate_V_s:0.02},loading_mg_cm2:0.02,metadata:{synthetic:true}};
  }
  $('wbDemo').onclick=guarded(()=>{let suffix=1;while(samples.some(s=>s.sample_id===`Demo-Pt-${suffix}`||s.sample_id===`Demo-PtCo-${suffix}`))suffix++;commit([...samples,demoSample(`Demo-Pt-${suffix}`,0.85),demoSample(`Demo-PtCo-${suffix}`,0.87)]);});
  try{
    const saved=JSON.parse(localStorage.getItem(historyKey)||'null');
    if(saved){if(saved.history_version!==1||!Array.isArray(saved.samples))throw Error('Unsupported history');commit(saved.samples,new Set(saved.selected||saved.samples.map(s=>s.sample_id)),false);nextName();}
  }catch(e){$('wbStorage').textContent=T('Could not restore local history; import your backup JSON. Existing storage has not been overwritten.','无法恢复本地历史；请导入 JSON 备份。原存储尚未覆盖。');}

  function parseKL(input){
    const groups=new Map();
    for(const [index,line] of input.trim().split(/\r?\n/).entries()){
      if(!line.trim()||/^rpm[,\s]/i.test(line.trim()))continue;
      const values=line.trim().split(/[,\s]+/).map(Number);if(values.length!==3||!values.every(Number.isFinite))throw Error(`Invalid K-L CSV row ${index+1}`);
      const [rpm,e,j]=values;if(!groups.has(rpm))groups.set(rpm,{rpm,E:[],j:[]});groups.get(rpm).E.push(e);groups.get(rpm).j.push(j);
    }return [...groups.values()];
  }
  function invalidateKL(){kl=null;$('klPlot').replaceChildren();$('klResult').textContent='Inputs changed. Run Fit K–L to refresh results.';}
  ['klText','klE','klD','klNu','klC'].forEach(id=>$(id).addEventListener('input',invalidateKL));
  $('klFiles').onchange=async()=>{try{const rows=[];for(const f of $('klFiles').files)rows.push(await f.text());$('klText').value=rows.join('\n');invalidateKL();}catch(e){$('klResult').textContent=e.message;}};
  $('klRun').onclick=()=>{
    invalidateKL();try{const optional=id=>$(id).value.trim()?num(id):null;kl=ECAnalysis.klFit(parseKL($('klText').value),num('klE'),optional('klD'),optional('klNu'),optional('klC'));
      $('klResult').textContent=`${kl.status}\nslope: ${display(kl.slope)} (cm²/mA)(rad/s)^½\nintercept: ${display(kl.intercept)} cm²/mA\nR²: ${display(kl.r2)}\njk: ${display(kl.jk_mA_cm2)} mA/cm² (signed)\nn: ${display(kl.n)}\n${kl.reasons.join('\n')}`;
      const x=[...kl.omega_inv_sqrt].sort((a,b)=>a-b);svgChart($('klPlot'),[{x:kl.omega_inv_sqrt,y:kl.inverse_j,color:'#0071e3'},{x,y:x.map(v=>kl.slope*v+kl.intercept),color:'#d70015',dashed:true}],{title:'Koutecky–Levich fit',xlabel:'omega^(-1/2) (rad/s)^(-1/2)',ylabel:'1/j (cm²/mA)'});
    }catch(e){$('klResult').textContent=e.message;}
  };
  $('klDemo').onclick=()=>{const lines=['rpm,potential_V_RHE,j_mA_cm2'];for(const rpm of [400,900,1600,2500])for(const e of [0.895,0.9,0.905]){const jl=1000*0.620*4*96485.33212*(1.9e-5)**(2/3)*0.01**(-1/6)*1.2e-6*Math.sqrt(2*Math.PI*rpm/60);lines.push([rpm,e,-1/(1/10+1/jl)].join(','));}$('klText').value=lines.join('\n');$('klD').value='0.000019';$('klNu').value='0.01';$('klC').value='0.0000012';$('klE').value='0.9';$('klRun').click();};
  $('klDownload').onclick=()=>{if(kl)download('kl_analysis.json',JSON.stringify({schema_version:'1.0.0',kl},null,2));};
})();
