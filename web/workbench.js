/* Workbench UI: source embedded by build_html.py, no external runtime dependency. */
(() => {
  let samples=[],analysis=null,kl=null;
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
    if($('n2Text').value.trim()){
      let n=read('n2Text','o2PotUnit','n2CurUnit');
      // Preserve the original N2 full-CV workflow by selecting the last forward branch.
      if(!n.E.slice(1).every((v,i)=>v>n.E[i])&&!n.E.slice(1).every((v,i)=>v<n.E[i])){
        const branches=ECAnalysis.sweeps(n.E,n.j).filter(([x])=>x.at(-1)>x[0]);
        if(!branches.length)throw Error('No forward N2 sweep');const [E,j]=branches.at(-1);n={E,j};s.metadata.n2_selection='last_anodic_sweep';
      }s.n2=n;
    }
    if($('cvText').value.trim()){
      s.cv={...read('cvText','cvPotUnit','cvCurUnit'),scan_rate_V_s:scanRateV(),q_mC_cm2:qspecCmC(),hupd_range_V:[num('hlo'),num('hhi')]};
      if($('baselineMode').value==='manual'&&$('baseline').value.trim())s.cv.baseline_mA_cm2=num('baseline');
    }return s;
  }
  function render(){
    $('wbTable').replaceChildren();$('wbQC').replaceChildren();$('wbLegend').replaceChildren();$('wbDownloads').replaceChildren();
    for(const id of ['wbCvPlot','wbOrrPlot'])$(id).replaceChildren();
    if(!analysis)return;
    const head=text('tr','',$('wbTable'));
    ['Sample','ECSA (m²/gPt)','E1/2 (V)','jlim (mA/cm²)','MA@0.9V (A/mgPt)','SA@0.9V (mA/cm²Pt)','Tafel (mV/dec)','QC',''].forEach(v=>text('th',v,head));
    analysis.samples.forEach((s,i)=>{
      const row=text('tr','',$('wbTable'));
      [s.sample_id,...ECAnalysis.resultFields.slice(1,-1).map(k=>s.metrics[k]),s.qc.status].forEach(v=>text('td',display(v),row));
      const remove=text('button','Remove',text('td','',row));remove.className='btn btn-secondary';remove.onclick=()=>commit(samples.filter(t=>t.sample_id!==s.sample_id));
      const legend=text('span',`${s.sample_id}  `,$('wbLegend'));legend.style.color=colors[i%colors.length];
      const detail=text('details','',$('wbQC'));text('summary',`${s.sample_id} — ${s.qc.status}`,detail);
      if(s.plateau)text('p',`Plateau: ${display(s.plateau.start_V)}–${display(s.plateau.end_V)} V; median ${display(s.plateau.jlim_mA_cm2)}; MAD ${display(s.plateau.mad_mA_cm2)}; SD ${display(s.plateau.std_mA_cm2)} mA/cm²`,detail);
      const list=text('ul','',detail);s.qc.checks.forEach(c=>text('li',`${c.status}: ${c.reason}${checkDetail(c)}`,list));
    });
    for(const [id,key,jkey,title] of [['wbCvPlot','processed_cv','j_mA_cm2','CV comparison'],['wbOrrPlot','processed_orr','j_corrected_mA_cm2','ORR comparison']]){
      const series=analysis.samples.map((s,i)=>({x:s[key].map(r=>r.potential_V_RHE),y:s[key].map(r=>r[jkey]),color:colors[i%colors.length]})).filter(s=>s.x.length);
      if(series.length)svgChart($(id),series,{title,xlabel:'E (V vs RHE)',ylabel:'j (mA/cm²)'});
    }
    for(const name of ['analysis.json','results.csv','processed_cv.csv','processed_orr.csv','summary.csv']){
      const b=text('button',`Download ${name}`,$('wbDownloads'));b.className='btn btn-secondary';b.onclick=()=>download(name,ECAnalysis.exports({...analysis,...(kl?{kl}:{})})[name]);
    }
  }
  function commit(next){const result=next.length?ECAnalysis.analyzeBatch(next):null;samples=next;analysis=result;render();$('wbMessage').textContent=`${samples.length} sample(s) analyzed. Results are snapshots.`;}
  function guarded(fn){return async()=>{try{await fn();}catch(e){$('wbMessage').textContent=e.message;}};}
  $('wbCapture').onclick=guarded(()=>{const s=snapshot();if(samples.some(t=>t.sample_id===s.sample_id))throw Error('Sample ID already exists. Remove it or use a new ID.');commit([...samples,s]);});
  $('wbClear').onclick=()=>commit([]);
  $('wbFiles').onchange=guarded(async()=>{const added=[];for(const f of $('wbFiles').files){const p=JSON.parse(await f.text());added.push(...(p.samples||[p]));}commit([...samples,...added]);$('wbFiles').value='';});
  $('wbPlotDownload').onclick=()=>{if(analysis)exportPNGCombined([$('wbCvPlot'),$('wbOrrPlot')],'comparison.png');};
  function demoSample(id,center){
    const E=Array.from({length:201},(_,i)=>0.2+i*0.004),j=E.map(e=>-6/(1+Math.exp((e-center)/0.025)));
    const ce=[],cj=[];for(let cycle=0;cycle<3;cycle++){for(let i=0;i<100;i++){const e=i/100;ce.push(e);cj.push(0.08+0.7*Math.exp(-(((e-0.18)/0.07)**2)));}for(let i=100;i>0;i--){ce.push(i/100);cj.push(-0.08);}}ce.push(0);cj.push(0.08);
    return {sample_id:id,orr:{E,j},n2:{E,j:E.map(()=>0)},cv:{E:ce,j:cj,scan_rate_V_s:0.02},loading_mg_cm2:0.02,metadata:{synthetic:true}};
  }
  $('wbDemo').onclick=guarded(()=>commit([demoSample('Demo-Pt',0.85),demoSample('Demo-PtCo',0.87)]));
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
