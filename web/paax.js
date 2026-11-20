/* Pine AfterMath PAAX import, embedded in the standalone offline workbench. */
(() => {
  const byId=id=>document.getElementById(id);
  const T=(en,zh)=>window.uiT?window.uiT(en,zh):en+' · '+zh;
  const unitScale={V:1,mV:1e-3,uV:1e-6,'µV':1e-6,'μV':1e-6,A:1,mA:1e-3,uA:1e-6,'µA':1e-6,'μA':1e-6,nA:1e-9};
  const child=(node,name)=>Array.from(node?.children??[]).find(n=>n.localName===name);
  function nodeName(node){
    const name=child(node,'name');
    const encoded=name?.textContent;
    if(!encoded)return '';
    try{
      if(name.getAttribute('encoding')!=='mixed')return decodeURIComponent(encoded);
      return decodeURIComponent(encoded.replace(/\[(?:%20| )([\da-f]{2})\]/gi,'%$1')).replace(/\$([\da-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    }catch{return encoded;}
  }
  function scanRate(data){
    const tag=data?.querySelector('metadata > object_map > map_pair > tag > exp_param_tag[name="sweep_rate"]');
    const box=tag?.closest('map_pair').querySelector('value > measurement_box');
    const unit=box?.querySelector('unit > measurement_unit');
    const rate=Number(box?.querySelector('value > f64')?.textContent);
    // AfterMath stores the value in SI. The prefix controls its display.
    return unit?.getAttribute('unit_name')==='volt_per_second'&&Number.isFinite(rate)&&rate>0?rate:null;
  }
  function numbers(node){
    if(!node)throw Error('Missing X_data or Y_data');
    const text=node.textContent.trim();if(!text)return [];
    const tokens=text.split(',');
    if(tokens.some(t=>!t.trim()||!Number.isFinite(Number(t))))throw Error('Non-numeric or empty data value');
    return tokens.map(Number);
  }
  function unit(node,axis,kind){
    const value=child(node,axis+'_unit')?.textContent.trim()||node?.getAttribute('unit')||node?.getAttribute('symbol');
    if(!value)return kind==='potential'?'V':kind==='current'?'A':'?';
    return value;
  }
  function parse(xml){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported XML declaration');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid PAAX XML');
    const archive=Array.from(doc.getElementsByTagName('DAB_node'));
    const nodes=archive.filter(n=>n.getAttribute('type')==='trace');
    if(!nodes.length)throw Error('No PAAX traces found');
    const byIndex=new Map(archive.filter(n=>n.hasAttribute('index')).map(n=>[n.getAttribute('index'),n]));
    function studyName(node){
      const visited=new Set();
      for(let parent=node;parent&&!visited.has(parent);parent=byIndex.get(parent.getAttribute('parent'))||parent.parentElement){
        if(parent.getAttribute('type')==='study')return nodeName(parent);
        visited.add(parent);
      }
      return '';
    }
    const used=new Set();
    return nodes.map((node,index)=>{
      const study=studyName(node),traceName=nodeName(node)||`trace_${index}`;
      const base=study?`${study} · ${traceName}`:traceName;
      let name=base,n=2;while(used.has(name))name=`${base} (${n++})`;used.add(name);
      const data=child(node,'data');
      const xu=child(data,'X_units')||child(node,'X_units'),yu=child(data,'Y_units')||child(node,'Y_units');
      const xkind=xu?.getAttribute('qty_kind')||'?',ykind=yu?.getAttribute('qty_kind')||'?';
      const xunit=unit(xu,'X',xkind),yunit=unit(yu,'Y',ykind);
      const trace={name,xkind,ykind,xunit,yunit,scanRateV_s:scanRate(data),X:[],Y:[],error:null};
      try{
        if(!xu||!yu)throw Error(T('Missing X_units or Y_units','缺少电位或电流单位信息'));
        const blocks=Array.from(node.getElementsByTagName('points')).filter(p=>p.closest('DAB_node[type="trace"]')===node);
        for(const block of blocks){
          const X=numbers(child(block,'X_data')),Y=numbers(child(block,'Y_data'));
          if(X.length!==Y.length)throw Error('X/Y point counts differ');
          const quantity=block.getAttribute('quantity');
          if(quantity!==null&&(!/^\d+$/.test(quantity)||Number(quantity)!==X.length))throw Error('Declared point count differs from data');
          for(let i=0;i<X.length;i++){trace.X.push(X[i]);trace.Y.push(Y[i]);}
        }
        if(trace.X.length<2)throw Error('Fewer than two points');
        if(xkind!=='potential'||ykind!=='current')throw Error('Not a potential/current trace');
        if(!['V','mV','uV','µV','μV'].includes(xunit)||!['A','mA','uA','µA','μA','nA'].includes(yunit))throw Error('Unsupported potential/current units');
      }catch(e){trace.error=e.message;}
      return trace;
    });
  }
  window.PAAX={parse};
  let traces=[],request=0;
  const buttons=['paaxCv','paaxO2','paaxN2'];
  function selected(){return traces[Number(byId('paaxTrace').value)];}
  function update(){buttons.forEach(id=>byId(id).disabled=!selected()||!!selected().error);}
  byId('paaxFile').onchange=async()=>{
    const ticket=++request;traces=[];byId('paaxTrace').replaceChildren();byId('paaxTable').replaceChildren();update();
    const file=byId('paaxFile').files[0];if(!file)return;
    byId('paaxMessage').textContent=T('Reading PAAX…','正在读取 PAAX…');
    try{
      const xml=await file.text();if(ticket!==request)return;
      traces=parse(xml);
      const head=document.createElement('tr');
      ['Trace · 曲线','X / Y','Points · 点数','Status · 状态'].forEach(v=>{const cell=document.createElement('th');cell.textContent=v;head.append(cell);});byId('paaxTable').append(head);
      traces.forEach((t,i)=>{
        const rate=t.scanRateV_s?` · ${Number((t.scanRateV_s*1000).toPrecision(8))} mV/s`:'';
        const option=document.createElement('option');option.value=i;option.textContent=`${t.name} — ${t.X.length} points (${t.xunit}, ${t.yunit})${rate}${t.error?' — unavailable':''}`;option.disabled=!!t.error;byId('paaxTrace').append(option);
        const row=document.createElement('tr');[t.name,`${t.xkind} (${t.xunit}) / ${t.ykind} (${t.yunit})`,t.X.length,t.error||'Ready · 可导入'].forEach(v=>{const cell=document.createElement('td');cell.textContent=v;row.append(cell);});byId('paaxTable').append(row);
      });
      const first=traces.findIndex(t=>!t.error);byId('paaxTrace').value=first<0?'':String(first);update();
      byId('paaxMessage').textContent=`${file.name}: ${traces.filter(t=>!t.error).length}/${traces.length} usable traces · 可用曲线。`;
    }catch(e){if(ticket!==request)return;byId('paaxMessage').textContent=T('PAAX import failed: ','PAAX 导入失败：')+e.message;}
  };
  byId('paaxTrace').onchange=update;
  function apply(target){
    const t=selected();if(!t||t.error)return;
    const input={cv:'cvText',o2:'lsvText',n2:'n2Text'}[target];
    const xs=unitScale[t.xunit],ys=unitScale[t.yunit];
    const data=t.X.map((x,i)=>`${x*xs},${t.Y[i]*ys}`).join('\n');
    let rateMessage='';
    if(target==='cv'){
      byId('cvPotUnit').value='V';byId('cvCurUnit').value='A';
      if(t.scanRateV_s){
        byId('vrate').value=String(t.scanRateV_s);byId('vUnit').value='V/s';
        rateMessage=T(' Scan rate set to ',' 扫描速率已设为 ')+`${Number((t.scanRateV_s*1000).toPrecision(8))} mV/s.`;
      }
    }
    else {
      // O₂ and N₂ share the potential-unit setting; preserve the other raw input in volts.
      const other=byId(target==='o2'?'n2Text':'lsvText');
      if(other.value.trim()&&byId('o2PotUnit').value!=='V'){
        const currentUnit=byId(target==='o2'?'n2CurUnit':'o2CurUnit').value;
        const rows=parse2col(other.value,byId('o2PotUnit').value,currentUnit);
        const factor=unitScale[currentUnit];
        other.value=rows.map(r=>`${r[0]},${r[1]/factor}`).join('\n');
      }
      byId('o2PotUnit').value='V';byId(target==='o2'?'o2CurUnit':'n2CurUnit').value='A';
    }
    byId(input).value=data;byId(input).dispatchEvent(new Event('input',{bubbles:true}));
    byId('paaxMessage').textContent=T('Loaded ','已导入 ')+t.name+` → ${target.toUpperCase()} (${t.X.length} points; V, A).`+rateMessage;
  }
  for(const [button,target] of [['paaxCv','cv'],['paaxO2','o2'],['paaxN2','n2']])byId(button).onclick=()=>{try{apply(target);}catch(e){byId('paaxMessage').textContent=e.message;}};
})();
