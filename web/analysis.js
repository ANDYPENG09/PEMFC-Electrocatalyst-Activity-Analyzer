/* Pure offline analysis core. Keep numerical rules aligned with electrochem_analysis.py. */
const ECAnalysis = (() => {
  const defaults = {min_width_V:0.08,min_points:7,slope_fraction_per_V:0.15,max_gap_V:0.025,
    transport_ratio:0.8,stability_fraction:0.05,sensitivity_fraction:0.1};
  const resultFields=['sample_id','ecsa_m2_g','ehalf_V','jlim_mA_cm2','ma_0_9V_A_mg','sa_0_9V_mA_cm2_Pt','tafel_mV_dec','qc_status'];
  const cvFields=['sample_id','point_index','potential_V_RHE','j_mA_cm2'];
  const orrFields=['sample_id','point_index','potential_V_RHE','j_raw_mA_cm2','j_background_mA_cm2','j_corrected_mA_cm2','in_plateau'];
  const summaryFields=['record_type','sample_id','point_index','potential_V_RHE','j_mA_cm2','j_raw_mA_cm2','j_background_mA_cm2','j_corrected_mA_cm2','in_plateau','ecsa_m2_g','ehalf_V','jlim_mA_cm2','ma_0_9V_A_mg','sa_0_9V_mA_cm2_Pt','tafel_mV_dec','qc_status'];
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  function quantile(a,q){const b=[...a].sort((a,b)=>a-b),p=(b.length-1)*q,k=Math.floor(p);return b[k]+(b[Math.min(k+1,b.length-1)]-b[k])*(p-k);}
  const median=a=>quantile(a,0.5);
  function validateOptions(cfg){if(Object.values(cfg).some(v=>!Number.isFinite(v)||v<=0))throw Error('QC thresholds must be finite and positive');if(!Number.isInteger(cfg.min_points)||cfg.min_points<3||cfg.transport_ratio>=1)throw Error('Use min_points >=3 and transport_ratio <1');}
  function curve(E,j){
    if(!Array.isArray(E)||!Array.isArray(j)||E.length!==j.length||E.length<2||![...E,...j].every(Number.isFinite)) throw Error('A curve needs finite paired points');
    if(E.slice(1).every((v,i)=>v<E[i])) return [[...E].reverse(),[...j].reverse()];
    if(!E.slice(1).every((v,i)=>v>E[i])) throw Error('Use one monotonic sweep with unique potentials');
    return [[...E],[...j]];
  }
  function interp(x,y,t,gap=0.025){
    if(t<x[0]||t>x.at(-1))return null;
    let k=x.findIndex(v=>v>=t);
    if(Math.abs(x[k]-t)<1e-12)return y[k];
    if(k===0||x[k]-x[k-1]>gap)return null;
    return y[k-1]+(t-x[k-1])*(y[k]-y[k-1])/(x[k]-x[k-1]);
  }
  function plateau(E,j,options={}){
    const cfg={...defaults,...options},[x,y]=curve(E,j);
    validateOptions(cfg);
    const smooth=y.map((_,i)=>median(y.slice(Math.max(0,i-2),i+3)));
    const amplitude=-quantile(smooth,0.1);
    if(amplitude<=0||Math.max(...smooth)-Math.min(...smooth)<0.3*amplitude)return null;
    const mask=smooth.map((v,i)=>{const a=Math.max(0,i-2),b=Math.min(x.length-1,i+2);return Math.abs((smooth[b]-smooth[a])/(x[b]-x[a]))<=amplitude*cfg.slope_fraction_per_V&&v< -0.6*amplitude;});
    const candidates=[];let start=null;
    for(let i=0;i<=x.length;i++){
      const eligible=i<x.length&&mask[i],gap=i>0&&i<x.length&&x[i]-x[i-1]>cfg.max_gap_V;
      if(start!==null&&(!eligible||gap)){
        const end=i-1;
        if(end-start+1>=cfg.min_points&&x[end]-x[start]>=cfg.min_width_V){
          const vals=y.slice(start,end+1),med=median(vals),avg=mean(vals);
          candidates.push({start_V:x[start],end_V:x[end],jlim_mA_cm2:med,mad_mA_cm2:median(vals.map(v=>Math.abs(v-med))),std_mA_cm2:Math.sqrt(mean(vals.map(v=>(v-avg)**2))),count:vals.length});
        }start=null;
      }if(eligible&&start===null)start=i;
    }
    if(!candidates.length)return null;
    const best=candidates.reduce((a,b)=>b.end_V-b.start_V>a.end_V-a.start_V?b:a);
    return {...best,candidates,method:'contiguous_low_derivative_median'};
  }
  function halfWave(E,j,jl){
    const [x,y]=curve(E,j);if(jl===null||!Number.isFinite(jl)||jl>=0)return null;
    for(let i=0;i<x.length-1;i++)if(y[i]<=jl/2&&jl/2<y[i+1]&&x[i+1]-x[i]<=defaults.max_gap_V)return x[i]+(jl/2-y[i])*(x[i+1]-x[i])/(y[i+1]-y[i]);
    return null;
  }
  function kinetic(j,jl){return j===null||jl===null||j>=0||jl>=0||Math.abs(j)>=Math.abs(jl)?null:Math.abs(j)*Math.abs(jl)/(Math.abs(jl)-Math.abs(j));}
  function sweeps(x,y){
    if(x.length!==y.length||x.length<2||![...x,...y].every(Number.isFinite))throw Error('Invalid CV points');
    const out=[];let start=0,direction=0;
    for(let i=1;i<x.length;i++){const sign=Math.sign(x[i]-x[i-1]);if(sign&&direction&&sign!==direction){if(i-start>=3)out.push([x.slice(start,i),y.slice(start,i)]);start=i-1;}if(sign)direction=sign;}
    if(x.length-start>=3)out.push([x.slice(start),y.slice(start)]);return out;
  }
  function cvAnalysis(cv,loading){
    const empty={ecsa_m2_g:null,stability_fraction:null,anodic_sweeps:0};if(!cv)return empty;
    const [lo,hi]=cv.hupd_range_V||[0.05,0.4],rate=cv.scan_rate_V_s??0.02,q=cv.q_mC_cm2??0.21;
    if(![rate,q,lo,hi].every(Number.isFinite)||rate<=0||q<=0||lo>=hi)throw Error('Invalid CV integration parameters');
    const branches=sweeps(cv.E,cv.j).filter(([x])=>x.at(-1)>x[0]&&x[0]<=lo&&x.at(-1)>=hi).map(([x,y])=>{const keep=x.map((v,i)=>i===0||v>x[i-1]);return [x.filter((v,i)=>keep[i]),y.filter((v,i)=>keep[i])];});
    if(!branches.length)return empty;
    const [x,y]=branches.at(-1),baseline=cv.baseline_mA_cm2??interp(x,y,hi,Infinity);
    if(!Number.isFinite(baseline))throw Error('CV baseline must be finite');
    const xx=[lo,...x.filter(v=>v>lo&&v<hi),hi],yy=xx.map(v=>Math.max(0,interp(x,y,v,Infinity)-baseline));
    let sh=0;for(let i=1;i<xx.length;i++)sh+=(xx[i]-xx[i-1])*(yy[i]+yy[i-1])/2;
    let stability=null;
    if(branches.length>=2){const [a,b]=branches.slice(-2),l=Math.max(a[0][0],b[0][0]),h=Math.min(a[0].at(-1),b[0].at(-1)),grid=Array.from({length:101},(_,i)=>l+(h-l)*i/100),ya=grid.map(v=>interp(...a,v,Infinity)),yb=grid.map(v=>interp(...b,v,Infinity));stability=Math.sqrt(mean(ya.map((v,i)=>(v-yb[i])**2)))/Math.max(Math.sqrt(mean(yb.map(v=>v*v))),1e-12);}
    return {ecsa_m2_g:loading&&sh>0?100*sh/(q*rate*loading*1000):null,stability_fraction:stability,anodic_sweeps:branches.length,SH_mA_V_cm2:sh,baseline_mA_cm2:baseline};
  }
  function fitLine(x,y){
    const mx=mean(x),my=mean(y),den=x.reduce((s,v)=>s+(v-mx)**2,0);if(x.length<2||den<1e-24)throw Error('Insufficient independent fit points');
    const slope=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/den,intercept=my-slope*mx,total=y.reduce((s,v)=>s+(v-my)**2,0);
    return {slope,intercept,r2:total>1e-24?1-y.reduce((s,v,i)=>s+(v-slope*x[i]-intercept)**2,0)/total:null};
  }
  function klFit(traces,potential_V=0.9,D_cm2_s=null,nu_cm2_s=null,C_mol_cm3=null){
    if(!Number.isFinite(potential_V))throw Error('K-L potential must be finite');
    const rpm=[],currents=[];
    for(const t of traces){if(!Number.isFinite(t.rpm)||t.rpm<=0||rpm.includes(t.rpm))throw Error('K-L requires distinct positive rpm');const [x,y]=curve(t.E,t.j),j=interp(x,y,potential_V);if(j===null||j>=0)throw Error('K-L needs a covered potential and negative ORR current at every rpm');rpm.push(t.rpm);currents.push(j);}
    if(rpm.length<3)throw Error('K-L requires at least three distinct rpm');
    const xs=rpm.map(v=>(2*Math.PI*v/60)**-0.5),ys=currents.map(v=>1/v),fit=fitLine(xs,ys),valid=fit.slope< -1e-12&&fit.intercept< -1e-12,reasons=valid?[]:['Nonphysical slope/intercept; jk and n unavailable'];
    if(fit.r2===null||fit.r2<0.98)reasons.push('K-L R2 below 0.98 or undefined');
    let n=null;const params=[D_cm2_s,nu_cm2_s,C_mol_cm3];
    if(params.some(v=>v!==null&&(!Number.isFinite(v)||v<=0)))throw Error('Transport parameters must be finite and positive');
    if(valid&&params.every(v=>v!==null)){n=1/(Math.abs(fit.slope)*1000*0.620*96485.33212*D_cm2_s**(2/3)*nu_cm2_s**(-1/6)*C_mol_cm3);if(n>4.2||n<1)reasons.push('Estimated ORR electron number outside 1–4.2; review assumptions');}
    else if(params.some(v=>v===null))reasons.push('n unavailable: supply D, kinematic viscosity and oxygen concentration');
    return {...fit,potential_V,jk_mA_cm2:valid?1/fit.intercept:null,n,rpm,j_mA_cm2:currents,omega_inv_sqrt:xs,inverse_j:ys,status:!valid?'Invalid':reasons.length?'Check recommended':'Good',reasons,D_cm2_s,nu_cm2_s,C_mol_cm3};
  }
  function analyzeSample(sample){
    const sid=String(sample.sample_id),cfg={...defaults,...sample.qc_options},loading=sample.loading_mg_cm2??null;
    validateOptions(cfg);
    if(loading!==null&&(!Number.isFinite(loading)||loading<=0))throw Error('Pt loading must be finite and positive');
    const [x,raw]=curve(sample.orr.E,sample.orr.j),checks=[];
    const check=(code,status,reason,value=null)=>checks.push({code,status,reason,value});let bg=null;
    if(sample.n2){const [nx,ny]=curve(sample.n2.E,sample.n2.j),values=x.map(e=>interp(nx,ny,e));if(values.some(v=>v===null))check('n2_background','Invalid','N2 does not cover the full O2 sweep without gaps');else{bg=values;check('n2_background','Good','N2 background subtracted');}}
    else check('n2_background','Check recommended','N2 background unavailable; ORR remains uncorrected');
    const y=raw.map((v,i)=>v-(bg?bg[i]:0)),p=plateau(x,y,cfg),jl=p?p.jlim_mA_cm2:null;
    check('plateau',p?'Good':'Invalid',p?'Continuous low-derivative cathodic plateau detected':'No resolved diffusion plateau; no min(j) fallback',p);
    const cv=cvAnalysis(sample.cv,loading),stability=cv.stability_fraction;
    check('cv_stability',stability!==null&&stability<=cfg.stability_fraction?'Good':'Check recommended',stability!==null?'Last two comparable anodic sweeps RMS difference':'At least two complete anodic sweeps required',stability);
    const j09=interp(x,y,0.9),ratio=j09!==null&&jl?Math.abs(j09/jl):null,jk=kinetic(j09,jl);
    check('transport_0_9V',jk===null?'Invalid':ratio>=cfg.transport_ratio?'Check recommended':'Good',jk===null?'0.9 V missing, wrong current sign, or |j| >= |jlim|':'|j(0.9V)| / |jlim|; review at >=0.8',ratio);
    const variants=[];
    if(p){const vals=y.filter((_,i)=>x[i]>=p.start_V&&x[i]<=p.end_V);variants.push(quantile(vals,0.1),quantile(vals,0.9));for(const f of [0.5,1.5]){const alt=plateau(x,y,{...cfg,slope_fraction_per_V:cfg.slope_fraction_per_V*f});if(alt)variants.push(...alt.candidates.map(c=>c.jlim_mA_cm2));}}
    const jlSens=variants.length?Math.max(...variants.map(v=>Math.abs(v-jl)/Math.abs(jl))):null,ks=variants.map(v=>kinetic(j09,v)),goodKs=ks.filter(v=>v!==null),maSens=jk&&goodKs.length?Math.max(...goodKs.map(v=>Math.abs(v-jk)/jk)):null,singular=ks.length>0&&ks.some(v=>v===null);
    check('plateau_sensitivity',singular?'Invalid':maSens!==null&&Math.max(jlSens,maSens)<=cfg.sensitivity_fraction?'Good':'Check recommended','Compare plateau P10/P90 and derivative thresholds x0.5/x1.5; MA sensitivity equals jk sensitivity',{jlim_relative:jlSens,ma_relative:maSens,singular});
    const ecsa=cv.ecsa_m2_g;if(loading===null||ecsa===null)check('normalization','Check recommended','MA requires Pt loading; SA requires positive Hupd ECSA');
    const ehalf=halfWave(x,y,jl);check('ehalf',ehalf!==null?'Good':'Invalid',ehalf!==null?'Half-plateau rising crossing':'Half-wave crossing not resolved');
    const [lo,hi]=sample.tafel_range_V||[0.85,0.95],tx=[],ty=[];
    if(![lo,hi].every(Number.isFinite)||lo>=hi)throw Error('Invalid Tafel potential range');
    x.forEach((e,i)=>{const k=kinetic(y[i],jl);if(lo<=e&&e<=hi&&k&&Math.abs(y[i]/jl)<cfg.transport_ratio){tx.push(Math.log10(k));ty.push(e);}});
    let tf=null;if(tx.length>=5&&Math.max(...tx)-Math.min(...tx)>=0.3){const fit=fitLine(tx,ty);if(fit.slope<0)tf={...fit,slope_mV_dec:Math.abs(fit.slope)*1000,count:tx.length,range_V:[lo,hi]};}
    check('tafel',tf&&tf.r2!==null&&tf.r2>=0.98?'Good':'Check recommended','Kinetic-current Tafel fit; >=5 points and >=0.3 decades required',tf);
    if(p&&p.std_mA_cm2/Math.abs(jl)>0.05)check('plateau_dispersion','Check recommended','Plateau standard deviation exceeds 5% of |jlim|');
    const status=checks.some(c=>c.status==='Invalid')?'Invalid':checks.some(c=>c.status==='Check recommended')?'Check recommended':'Good';
    const metrics={ecsa_m2_g:ecsa,ehalf_V:ehalf,jlim_mA_cm2:jl,ma_0_9V_A_mg:jk&&loading?jk/1000/loading:null,sa_0_9V_mA_cm2_Pt:jk&&ecsa&&loading?jk/(ecsa*loading*10):null,tafel_mV_dec:tf?tf.slope_mV_dec:null};
    const row=(fields,vals)=>Object.fromEntries(fields.map((k,i)=>[k,vals[i]]));
    return {sample_id:sid,metrics,qc:{status,checks},plateau:p,cv,tafel:tf,metadata:sample.metadata||{},settings:{loading_mg_cm2:loading,qc_options:cfg,tafel_range_V:[lo,hi],cv:Object.fromEntries(Object.entries(sample.cv||{}).filter(([k])=>!['E','j'].includes(k)))},
      processed_cv:(sample.cv?.E||[]).map((e,i)=>row(cvFields,[sid,i,e,sample.cv.j[i]])),
      processed_orr:x.map((e,i)=>row(orrFields,[sid,i,e,raw[i],bg?bg[i]:null,y[i],!!(p&&p.start_V<=e&&e<=p.end_V)]))};
  }
  function analyzeBatch(samples){const ids=samples.map(s=>String(s.sample_id));if(!ids.length||ids.some(s=>!s.trim())||new Set(ids).size!==ids.length)throw Error('Provide nonempty, unique sample IDs');return {schema_version:'1.0.0',units:{potential:'V vs RHE',current_density:'mA/cm2',loading:'mgPt/cm2'},samples:samples.map(analyzeSample)};}
  function csv(fields,rows){const cell=v=>v===null||v===undefined?'':typeof v==='boolean'?(v?'True':'False'):'"'+String(v).replaceAll('"','""')+'"';return [fields.join(','),...rows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';}
  function summaryRows(analysis){
    const rows=[];
    for(const s of analysis.samples){
      rows.push({record_type:'metrics',sample_id:s.sample_id,...s.metrics,qc_status:s.qc.status});
      s.processed_cv.forEach(r=>rows.push({record_type:'cv_point',sample_id:s.sample_id,point_index:r.point_index,potential_V_RHE:r.potential_V_RHE,j_mA_cm2:r.j_mA_cm2}));
      s.processed_orr.forEach(r=>rows.push({record_type:'lsv_point',sample_id:s.sample_id,point_index:r.point_index,potential_V_RHE:r.potential_V_RHE,j_mA_cm2:r.j_corrected_mA_cm2,j_raw_mA_cm2:r.j_raw_mA_cm2,j_background_mA_cm2:r.j_background_mA_cm2,j_corrected_mA_cm2:r.j_corrected_mA_cm2,in_plateau:r.in_plateau}));
    }
    return rows;
  }
  function exports(analysis){return {'analysis.json':JSON.stringify(analysis,null,2),'results.csv':csv(resultFields,analysis.samples.map(s=>({sample_id:s.sample_id,...s.metrics,qc_status:s.qc.status}))),'processed_cv.csv':csv(cvFields,analysis.samples.flatMap(s=>s.processed_cv)),'processed_orr.csv':csv(orrFields,analysis.samples.flatMap(s=>s.processed_orr)),'summary.csv':csv(summaryFields,summaryRows(analysis))};}
  return {defaults,plateau,halfWave,kinetic,curve,interp,sweeps,cvAnalysis,klFit,analyzeSample,analyzeBatch,exports,resultFields,summaryFields,summaryRows};
})();
if(typeof module!=='undefined')module.exports=ECAnalysis;
