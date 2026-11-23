/* Pine AfterMath PAAX import, embedded in the standalone offline workbench. */
(() => {
  const byId=id=>document.getElementById(id);
  const T=(en,zh)=>window.uiT?window.uiT(en,zh):en+' · '+zh;
  const potentialUnits={V:1,mV:1e-3,uV:1e-6,'µV':1e-6,'μV':1e-6};
  const currentUnits={A:1,mA:1e-3,uA:1e-6,'µA':1e-6,'μA':1e-6,nA:1e-9};
  function child(node,name){
    for(let item=node?.firstElementChild;item;item=item.nextElementSibling){
      if(item.localName===name)return item;
    }
  }
  function nodeName(node){
    const name=child(node,'name'),encoded=name?.textContent;
    if(!encoded)return '';
    try{
      if(name.getAttribute('encoding')!=='mixed')return decodeURIComponent(encoded);
      return decodeURIComponent(encoded.replace(/\[(?:%20| )([\da-f]{2})\]/gi,'%$1')).replace(/\$([\da-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    }catch{return encoded;}
  }
  function scanRate(data){
    const pairs=child(child(data,'metadata'),'object_map')?.children??[];
    for(const pair of pairs){
      if(child(child(pair,'tag'),'exp_param_tag')?.getAttribute('name')!=='sweep_rate')continue;
      const box=child(child(pair,'value'),'measurement_box');
      const unit=child(child(box,'unit'),'measurement_unit');
      const rate=Number(child(child(box,'value'),'f64')?.textContent);
      // AfterMath stores the value in SI. The prefix controls its display.
      if(unit?.getAttribute('unit_name')==='volt_per_second'&&Number.isFinite(rate)&&rate>0)return rate;
    }
    return null;
  }
  function numbers(node){
    if(!node)throw Error('Missing X_data or Y_data');
    const raw=node.textContent.trim();
    if(!raw)return [];
    return raw.split(',').map(token=>{
      const value=Number(token);
      if(!Number.isFinite(value)||!token.trim())throw Error('Non-numeric or empty data value');
      return value;
    });
  }
  function unit(node,axis,kind){
    return child(node,axis+'_unit')?.textContent.trim()||node?.getAttribute('unit')||node?.getAttribute('symbol')||
      ({potential:'V',current:'A'}[kind]??'?');
  }
  function decode(trace){
    if(trace.error)return trace;
    const X=[],Y=[];
    try{
      for(const block of trace.blocks){
        const x=numbers(child(block,'X_data')),y=numbers(child(block,'Y_data'));
        if(x.length!==y.length)throw Error('X/Y point counts differ');
        const quantity=block.getAttribute('quantity');
        if(quantity!==null&&(!/^\d+$/.test(quantity)||Number(quantity)!==x.length))throw Error('Declared point count differs from data');
        for(let i=0;i<x.length;i++){X.push(x[i]);Y.push(y[i]);}
      }
      if(X.length<2)throw Error('Fewer than two points');
      return {...trace,X,Y};
    }catch(error){return {...trace,error:error.message};}
  }
  function sweepType(trace){
    const points=decode(trace);
    if(points.error)return null;
    let low=Infinity,high=-Infinity,up=0,down=0;
    for(const x of points.X){
      low=Math.min(low,x);high=Math.max(high,x);
      up=Math.max(up,x-low);down=Math.max(down,high-x);
    }
    const excursion=(high-low)*0.05;
    if(!excursion)return null;
    return up>excursion&&down>excursion?'CV':'LSV';
  }
  function cvGroup(rate){
    if(rate===null)return 'cv';
    if(rate<=0.03)return 'cv-ecsa';
    if(rate>=0.075)return 'cv-activation';
    return 'cv';
  }
  const median=values=>{
    const sorted=values.sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
    return (sorted[mid]+sorted[Math.ceil(sorted.length/2)-1])/2;
  };
  function lsvSignal(trace){
    const {X,Y,error}=decode(trace);
    if(error){trace.error=error;return null;}
    let low=Infinity,high=-Infinity;
    const xScale=potentialUnits[trace.xunit],yScale=currentUnits[trace.yunit];
    for(const x of X){low=Math.min(low,x*xScale);high=Math.max(high,x*xScale);}
    const span=high-low;
    if(span<=0)return null;
    const lowCurrent=[],highCurrent=[];
    for(let i=0;i<X.length;i++){
      const fraction=(X[i]*xScale-low)/span;
      const j=Y[i]*yScale;
      if(fraction>=0.10&&fraction<=0.45)lowCurrent.push(j);
      if(fraction>=0.65&&fraction<=0.85)highCurrent.push(j);
    }
    if(lowCurrent.length<5||highCurrent.length<5)return null;
    const cathodic=-median(lowCurrent),amplitude=median(lowCurrent.map(Math.abs)),highAmplitude=median(highCurrent.map(Math.abs));
    const scatter=median(lowCurrent.map(j=>Math.abs(j+cathodic)));
    const plateau=cathodic>0&&scatter<=0.25*cathodic&&median(highCurrent)>-0.65*cathodic;
    return {low,high,span,cathodic,amplitude,highAmplitude,plateau};
  }
  function classifyGas(traces){
    const lsves=traces.filter(trace=>trace.group==='lsv'&&!trace.error);
    for(const trace of lsves)trace.signal=lsvSignal(trace);
    const oxygenLike=lsves.filter(trace=>trace.signal?.plateau&&(trace.gasHint==='o2'||trace.signal.cathodic>=0.00005));
    const references=oxygenLike.filter(trace=>trace.gasHint!=='n2');
    for(const trace of lsves){
      const signal=trace.signal;
      const comparable=signal&&references.filter(other=>{
        const ref=other.signal,span=Math.max(signal.span,ref.span);
        return other!==trace&&Math.abs(signal.low-ref.low)<=0.15*span&&Math.abs(signal.high-ref.high)<=0.15*span;
      });
      // Background is low relative to a comparable cathodic limiting-current trace.
      const predicted=oxygenLike.includes(trace)?'o2':comparable?.some(ref=>
        signal.amplitude<=0.15*ref.signal.cathodic&&signal.highAmplitude<=0.30*ref.signal.cathodic)?'n2':null;
      if(predicted&&trace.gasHint&&predicted!==trace.gasHint)continue;
      trace.group=predicted||trace.gasHint||'lsv';
    }
  }
  function testBatches(traces){
    const dated=traces.filter(trace=>!trace.error&&Number.isFinite(Date.parse(trace.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const batches=[];
    let batch;
    for(const trace of dated){
      const type=trace.group;
      const restart=type==='cv-activation'&&batch?.traces.some(t=>t.group!=='cv-activation');
      const nextECSA=type==='cv-ecsa'&&batch?.traces.some(t=>['o2','n2','lsv'].includes(t.group));
      if(!batch||restart||nextECSA){
        batch={id:String(batches.length+1),start:trace.date,traces:[]};
        batches.push(batch);
      }
      batch.traces.push(trace);batch.end=trace.date;trace.batch=batch.id;
    }
    return batches;
  }
  function catalog(xml,{includeUnsupported=false}={}){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported XML declaration');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid PAAX XML');
    const archive=Array.from(doc.getElementsByTagName('DAB_node'));
    const byIndex=new Map(archive.filter(n=>n.hasAttribute('index')).map(n=>[n.getAttribute('index'),n]));
    const specifications=new Map(archive.filter(n=>n.getAttribute('type')==='X_spec').map(n=>[n.getAttribute('parent'),child(n,'content')?.firstElementChild?.localName.toUpperCase()]));
    const candidates=[];
    const copies=new Map(),used=new Set();
    let ignored=0,duplicates=0;
    for(const node of archive){
      if(node.getAttribute('type')!=='trace')continue;
      const data=child(node,'data')||node;
      const xu=child(data,'X_units')||child(node,'X_units'),yu=child(data,'Y_units')||child(node,'Y_units');
      const xkind=xu?.getAttribute('qty_kind')||'?',ykind=yu?.getAttribute('qty_kind')||'?';
      const xunit=unit(xu,'X',xkind),yunit=unit(yu,'Y',ykind);
      let error=null;
      if(!xu||!yu)error='Missing X_units or Y_units';
      else if(xkind!=='potential'||ykind!=='current')error='Not a potential/current trace';
      else if(!Object.hasOwn(potentialUnits,xunit)||!Object.hasOwn(currentUnits,yunit))error='Unsupported potential/current units';
      if(error&&!includeUnsupported){ignored++;continue;}
      const experiment=child(node,'experiment')?.textContent.trim();
      const known=specifications.get(experiment);
      if(known&&!['CV','LSV'].includes(known)&&!includeUnsupported){ignored++;continue;}
      const parents=[],visited=new Set();
      for(let item=node;item&&!visited.has(item);item=byIndex.get(item.getAttribute('parent'))||item.parentElement){
        visited.add(item);
        if(item.localName==='DAB_node')parents.push(item);
      }
      const study=parents.find(parent=>parent.getAttribute('type')==='study');
      const studyName=nodeName(study),traceName=nodeName(node)||'Unnamed trace';
      const label=studyName||traceName;
      const blocks=error?[]:Array.from(data.getElementsByTagName('points')).filter(block=>{
        let parent=block.parentElement;
        while(parent&&parent!==data&&parent.localName!=='DAB_node')parent=parent.parentElement;
        return parent===data;
      });
      if(!error&&!blocks.length)error='No sampled points';
      if(error&&!includeUnsupported){ignored++;continue;}
      if(experiment&&!includeUnsupported){
        const key=[experiment,xunit,yunit,blocks.length].join('|');
        const seen=copies.get(key)??[];
        if(seen.some(other=>other.every((block,i)=>
          block.getAttribute('quantity')===blocks[i].getAttribute('quantity')&&
          child(block,'X_data')?.textContent===child(blocks[i],'X_data')?.textContent&&
          child(block,'Y_data')?.textContent===child(blocks[i],'Y_data')?.textContent))){
          duplicates++;continue;
        }
        seen.push(blocks);copies.set(key,seen);
      }
      const base=studyName?`${studyName} · ${traceName}`:traceName;
      let name=base,n=2;
      while(used.has(name))name=`${base} (${n++})`;
      used.add(name);
      const date=child(byIndex.get(experiment),'start_time')?.textContent||child(study,'created')?.textContent||'';
      const trace={name,label,date,xkind,ykind,xunit,yunit,scanRateV_s:scanRate(data),blocks,error};
      const names=parents.map(nodeName).filter(Boolean).join(' / ').replaceAll('₂','2');
      const hint=names.match(/\b(CV|LSV|cyclic voltammogram|linear sweep voltammogram)\b/i)?.[0].toUpperCase();
      const type=known||(hint&&(hint==='CV'||hint.startsWith('CYCLIC')?'CV':'LSV'))||(!error&&sweepType(trace))||'';
      const oxygen=/(?:^|[^a-z0-9])(?:O2|ORR)(?=$|[^a-z0-9])|氧气|氧还原/i.test(names);
      const nitrogen=/(?:^|[^a-z0-9])N2(?=$|[^a-z0-9])|氮气/i.test(names);
      trace.group=type==='CV'?cvGroup(trace.scanRateV_s):type==='LSV'?'lsv':'unknown';
      trace.gasHint=type==='LSV'&&oxygen!==nitrogen?(oxygen?'o2':'n2'):null;
      trace.pointCount=blocks.reduce((total,block)=>total+(Number(block.getAttribute('quantity'))||0),0);
      candidates.push(trace);
    }
    if(!includeUnsupported)classifyGas(candidates);
    const batches=includeUnsupported?[]:testBatches(candidates);
    return {candidates,ignored,duplicates,batches};
  }

  window.PAAX={catalog,decode,parse:xml=>{
    const {candidates}=catalog(xml,{includeUnsupported:true});
    if(!candidates.length)throw Error('No PAAX traces found');
    return candidates.map(trace=>{
      const {blocks,...decoded}=decode(trace);
      return {X:[],Y:[],...decoded};
    });
  }};
  const groups=[
    ['cv-ecsa','ECSA CV','ECSA CV'],
    ['cv-activation','Activation CV','活化 CV'],
    ['cv','Other CV','其他 CV'],
    ['n2','N₂ LSV','N₂ LSV'],
    ['o2','O₂ LSV','O₂ LSV'],
    ['lsv','LSV gas unconfirmed','LSV 气氛待确认'],
    ['unknown','Technique unconfirmed','类型待确认']
  ];
  const targets=[['paaxCv','cv','CV'],['paaxO2','o2','O₂ LSV'],['paaxN2','n2','N₂ LSV']];
  const groupOrder=['cv-activation','cv-ecsa','n2','o2','cv','lsv','unknown'];
  const timeFormat=new Intl.DateTimeFormat(undefined,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const time=date=>Number.isFinite(Date.parse(date))?timeFormat.format(new Date(date)):'';
  let traces=[],request=0;
  function selected(){
    const value=byId('paaxTrace').value;
    return value===''?null:traces[Number(value)];
  }
  function allowed(trace,target){
    if(!trace||trace.error)return false;
    if(trace.group==='unknown')return true;
    if(target==='cv')return trace.group.startsWith('cv');
    return trace.group===target||trace.group==='lsv';
  }
  function update(){
    const trace=selected();
    targets.forEach(([id,target])=>byId(id).disabled=!allowed(trace,target));
  }
  function options(preferECSA=false){
    const batch=byId('paaxBatch').value;
    const filter=byId('paaxGroup').value;
    const select=byId('paaxTrace');
    select.replaceChildren();
    let ecsa=null,firstCv=null;
    for(const type of groupOrder){
      const [,label,zh]=groups.find(group=>group[0]===type);
      if(filter!=='all'&&filter!==type)continue;
      const group=document.createElement('optgroup');
      group.label=T(label,zh);
      traces.forEach((trace,index)=>{
        if(trace.group!==type||trace.error||(batch!=='all'&&trace.batch!==batch))return;
        const option=document.createElement('option');
        option.value=String(index);
        const rate=trace.scanRateV_s?` · ${Number((trace.scanRateV_s*1000).toPrecision(8))} mV/s`:'';
        const timestamp=time(trace.date);
        const date=timestamp?' · '+timestamp:'';
        const count=trace.pointCount?T(` · ${trace.pointCount} points`,` · ${trace.pointCount} 点`):'';
        const current=trace.signal?` · median |I| ${(trace.signal.amplitude*1e6).toPrecision(3)} µA`:'';
        option.textContent=trace.label+date+rate+current+count;
        option.title=trace.name;
        if(type==='cv-ecsa'&&ecsa===null)ecsa=option.value;
        if(type.startsWith('cv')&&firstCv===null)firstCv=option.value;
        group.append(option);
      });
      if(group.children.length)select.append(group);
    }
    const preferred=ecsa??firstCv;
    if(preferECSA&&preferred!==null)select.value=preferred;
    select.disabled=!select.options.length;
    update();
  }
  byId('paaxFile').onchange=async()=>{
    const ticket=++request;
    traces=[];
    const batchSelect=byId('paaxBatch');
    while(batchSelect.options.length>1)batchSelect.remove(1);
    batchSelect.value='all';batchSelect.disabled=true;
    options();
    byId('paaxGroup').disabled=true;
    const file=byId('paaxFile').files[0];
    if(!file){byId('paaxMessage').textContent='';return;}
    byId('paaxMessage').textContent=T('Reading PAAX…','正在读取 PAAX…');
    try{
      const xml=await file.text();
      if(ticket!==request)return;
      const {candidates,ignored,duplicates,batches}=catalog(xml);
      traces=candidates.sort((a,b)=>b.date.localeCompare(a.date));
      for(const batch of [...batches].reverse()){
        const option=document.createElement('option');
        option.value=batch.id;
        option.textContent=T(`Run ${batch.id}`,`第 ${batch.id} 轮`)+` · ${time(batch.start)}–${time(batch.end)}`;
        batchSelect.append(option);
      }
      batchSelect.disabled=!batches.length;
      batchSelect.value=batches.at(-1)?.id??'all';
      byId('paaxGroup').value='all';
      byId('paaxGroup').disabled=!traces.length;
      options(true);
      const counts=groups.map(([type,en,zh])=>[T(en,zh),traces.filter(t=>t.group===type&&!t.error).length]).filter(([,count])=>count);
      const failed=traces.filter(t=>t.error).length;
      byId('paaxMessage').textContent=counts.length?
        counts.map(([label,count])=>`${label} ${count}`).join(' · ')+T(` · ${ignored+failed} other traces and ${duplicates} exact copies hidden.`,` · 已隐藏 ${ignored+failed} 条其他曲线和 ${duplicates} 条重复副本。`):
        T('No usable potential/current curves found.','未找到可用的电位–电流曲线。');
    }catch(error){
      if(ticket===request)byId('paaxMessage').textContent=T('PAAX import failed: ','PAAX 导入失败：')+error.message;
    }
  };
  byId('paaxBatch').onchange=()=>{byId('paaxGroup').value='all';options(true);};
  byId('paaxGroup').onchange=()=>options();
  byId('paaxTrace').onchange=update;
  function apply(target){
    const trace=selected();
    if(!allowed(trace,target))return;
    const {X,Y,error}=decode(trace);
    if(error)throw Error(error);
    const input={cv:'cvText',o2:'lsvText',n2:'n2Text'}[target];
    const xs=potentialUnits[trace.xunit],ys=currentUnits[trace.yunit];
    const data=X.map((x,i)=>`${x*xs},${Y[i]*ys}`).join('\n');
    let rateMessage='';
    if(target==='cv'){
      byId('cvPotUnit').value='V';byId('cvCurUnit').value='A';
      if(trace.scanRateV_s){
        byId('vrate').value=String(trace.scanRateV_s);byId('vUnit').value='V/s';
        rateMessage=T(' Scan rate set to ',' 扫描速率已设为 ')+`${Number((trace.scanRateV_s*1000).toPrecision(8))} mV/s.`;
      }else{
        byId('vrate').value='';
        rateMessage=T(' Enter the measured scan rate.',' 请填写实测扫速。');
      }
    }else{
      // O₂ and N₂ share the potential-unit setting; preserve the other raw input in volts.
      const other=byId(target==='o2'?'n2Text':'lsvText');
      if(other.value.trim()&&byId('o2PotUnit').value!=='V'){
        const currentUnit=byId(target==='o2'?'n2CurUnit':'o2CurUnit').value;
        const rows=parse2col(other.value,byId('o2PotUnit').value,currentUnit);
        other.value=rows.map(r=>`${r[0]},${r[1]/currentUnits[currentUnit]}`).join('\n');
      }
      byId('o2PotUnit').value='V';byId(target==='o2'?'o2CurUnit':'n2CurUnit').value='A';
    }
    byId(input).value=data;byId(input).dispatchEvent(new Event('input',{bubbles:true}));
    byId('paaxMessage').textContent=T('Loaded ','已导入 ')+trace.label+` → ${targets.find(([,id])=>id===target)[2]} (${X.length}; V, A).`+rateMessage;
  }
  for(const [button,target] of targets){
    byId(button).onclick=()=>{
      try{apply(target);}
      catch(error){byId('paaxMessage').textContent=T('Could not load curve: ','曲线导入失败：')+error.message;}
    };
  }
})();
