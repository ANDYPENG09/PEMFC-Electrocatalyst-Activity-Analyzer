/* Offline bilingual UI layer. English source text remains canonical; switch is reversible. */
(() => {
  const exact = new Map([
    ['Test Standard','测试标准'],
    ['Electrochemical Surface Area (ECSA · Hupd Method)','电化学活性表面积（ECSA · Hupd 法）'],
    ['Scan Rate','扫描速率'],['Pt Monolayer Charge q','Pt 单层氢吸附电荷 q'],['RDE Geometric Area (cm²)','RDE 几何面积 (cm²)'],
    ['Ink Concentration (mg/mL)','墨水浓度 (mg/mL)'],['Drop Volume (µL)','滴涂体积 (µL)'],['Pt Weight Fraction (%)','Pt 质量分数 (%)'],['→ Pt Loading (µg/cm²)','→ Pt 载量 (µg/cm²)'],
    ['Advanced Integration Settings','高级积分设置'],['Hupd Lower Limit (V)','Hupd 下限 (V)'],['Hupd Upper Limit (V)','Hupd 上限 (V)'],
    ['Baseline Subtraction Mode','基线扣除方式'],['Origin-style · End-plateau horizontal baseline','Origin 风格 · 末端平台水平基线'],['Manual horizontal baseline','手动水平基线'],
    ['Manual Baseline Current Density (mA/cm²)','手动基线电流密度 (mA/cm²)'],['Manual mode only','仅手动模式'],
    ['Potential','电位'],['Current','电流'],['CV Data (two columns: potential, current; space/comma/tab separated)','CV 数据（两列：电位、电流；空格/逗号/Tab 分隔）'],
    ['Calculate ECSA','计算 ECSA'],['Download CV Plot','下载 CV 图'],['Clear CV','清空 CV'],['Load Example Data','载入示例数据'],
    ['PNG transparent background (applies to CV & LSV exports)','PNG 透明背景（适用于 CV 与 LSV 导出）'],['Hupd plot X-axis range (V):','Hupd 图 X 轴范围 (V)：'],['Min','最小'],['Max','最大'],['Apply X-axis','应用 X 轴'],
    ['ORR Mass Activity / Specific Activity','ORR 质量活性 / 比活性'],['Current Density j @ E (mA/cm²)','指定电位下电流密度 j (mA/cm²)'],['Evaluation Potential E (V vs RHE)','评价电位 E (V vs RHE)'],
    ['Auto diffusion plateau (recommended)','自动扩散平台（推荐）'],['Manual potential (legacy)','手动电位（兼容模式）'],['Evaluation Potential (V)','评价电位 (V)'],
    ['Correct & Extract','校正并提取'],['Download LSV Plot','下载 LSV 图'],['Clear LSV','清空 LSV'],['Y-axis range (mA/cm²):','Y 轴范围 (mA/cm²)：'],['Apply Y-axis','应用 Y 轴'],
    ['Results Summary','结果汇总'],['Export CSV','导出 CSV'],['Export Summary (16:9)','导出汇总图 (16:9)'],
    ['Analysis Workbench · 自动 QC / 多样品比较','分析工作台 · 自动 QC / 多样品比较'],['Sample ID','样品 ID'],['Input potential reference','输入电位参比'],
    ['Additional uncompensated Ru (Ω)','附加未补偿 Ru (Ω)'],['Minimum plateau width (V)','最小平台宽度 (V)'],['Plateau slope / amplitude (V⁻¹)','平台斜率 / 幅值 (V⁻¹)'],
    ['Tafel lower bound (V RHE)','Tafel 下限 (V RHE)'],['Tafel upper bound (V RHE)','Tafel 上限 (V RHE)'],['Analyze & add current sample','分析并加入当前样品'],
    ['Load two-sample demo','载入双样品示例'],['Clear comparison','清空比较'],['Import one or more sample JSON files (see README schema)','导入一个或多个样品 JSON 文件（见 README schema）'],
    ['Download comparison plots','下载比较图'],['Multi-rpm Koutecký–Levich · 多转速拟合','多转速 Koutecký–Levich 拟合'],
    ['Import one or more multi-rpm CSV files','导入一个或多个多转速 CSV 文件'],['Fit potential (V RHE)','拟合电位 (V RHE)'],['O₂ diffusion D (cm²/s), optional','O₂ 扩散系数 D (cm²/s，可选)'],
    ['Kinematic viscosity ν (cm²/s)','运动黏度 ν (cm²/s)'],['O₂ concentration C (mol/cm³)','O₂ 浓度 C (mol/cm³)'],['Fit K–L','拟合 K–L'],['Load K–L demo','载入 K–L 示例'],['Download K–L JSON','下载 K–L JSON'],
    ['Sample','样品'],['Remove','移除'],['CV comparison','CV 比较'],['ORR comparison','ORR 比较'],['Koutecky–Levich fit','Koutecký–Levich 拟合'],
    ['Good','良好'],['Check recommended','建议检查'],['Invalid','无效']
  ]);
  const phrases = [
    ['Hupd background subtraction · ECSA · ORR mass/specific activity · Offline calculation','Hupd 背景扣除 · ECSA · ORR 质量/比活性 · 离线计算'],
    ['Based on GB/T 20042.4-2025. Methods are compatible with US DOE and EU JRC/IEC protocols (Hupd ECSA, K-L kinetic current, q = 0.21 mC/cm²).','基于 GB/T 20042.4-2025；方法兼容美国 DOE 与欧盟 JRC/IEC 常用流程（Hupd ECSA、K-L 动力学电流，q = 0.21 mC/cm²）。'],
    ['Capture the current CV/O₂/N₂ inputs, or import sample JSON files. Each capture is a snapshot; recapture after changing inputs. Analysis uses cathodic currents and a continuous diffusion plateau. Missing results are shown as —.','可捕获当前 CV/O₂/N₂ 输入，或导入样品 JSON。每次捕获都是快照，修改输入后需重新捕获。分析采用阴极电流与连续扩散平台；缺失结果显示为 —。'],
    ['RHE conversion and E − I·Ru apply only to captured workbench data. Use Ru = 0 if already corrected. Hupd bounds above are interpreted in V vs RHE here. Original manual calculators remain available.','RHE 换算与 E − I·Ru 仅作用于工作台捕获的数据；若数据已校正，请设 Ru = 0。此处 Hupd 范围按 V vs RHE 解释；原手动计算器仍保留。'],
    ['Paste/import CSV: rpm,potential_V_RHE,j_mA_cm2. Supply a single corrected ORR sweep per rpm, at least three distinct speeds. Values must already be in V vs RHE and mA/cm²; no background or potential correction is applied here.','粘贴/导入 CSV：rpm,potential_V_RHE,j_mA_cm2。每个转速提供一条已校正 ORR 扫描，至少三个不同转速。数据必须已为 V vs RHE 与 mA/cm²；此处不再做背景或电位校正。'],
    ['Continuous low-derivative cathodic plateau detected','检测到连续低导数阴极扩散平台'],['No resolved diffusion plateau; no min(j) fallback','未识别可靠扩散平台；不使用 min(j) 回退'],
    ['N2 background subtracted','已扣除 N₂ 背景'],['N2 background unavailable; ORR remains uncorrected','N₂ 背景不可用；ORR 保持未校正'],
    ['Last two comparable anodic sweeps RMS difference','最后两条可比阳极扫描的 RMS 差异'],['At least two complete anodic sweeps required','至少需要两条完整阳极扫描'],
    ['Half-plateau rising crossing','半平台上升支交点'],['Half-wave crossing not resolved','未识别半波电位交点'],
    ['MA requires Pt loading; SA requires positive Hupd ECSA','MA 需要 Pt 载量；SA 需要有效的正值 Hupd ECSA'],
    ['Kinetic-current Tafel fit; >=5 points and >=0.3 decades required','动力学电流 Tafel 拟合；要求 ≥5 个点且跨度 ≥0.3 decade'],
    ['Plateau standard deviation exceeds 5% of |jlim|','平台标准差超过 |jlim| 的 5%'],
    ['Inputs changed. Run Fit K–L to refresh results.','输入已变化，请重新执行 K–L 拟合。']
  ];
  const originals=new WeakMap();
  let lang=(localStorage.getItem('pemfc-ui-lang')||((navigator.language||'').toLowerCase().startsWith('zh')?'zh':'en'));
  let applying=false;
  function zhText(s){
    if(exact.has(s)) return exact.get(s);
    let out=s;
    for(const [en,zh] of phrases) out=out.split(en).join(zh);
    out=out.replace(/^Download (.+)$/,'下载 $1')
      .replace(/^(\d+) sample\(s\) analyzed\. Results are snapshots\.$/,'已分析 $1 个样品；结果为当前快照。')
      .replace(/^Plateau:/,'平台：').replace(/; median /g,'；中位数 ').replace(/; MAD /g,'；MAD ').replace(/; SD /g,'；SD ')
      .replace(/^Difference:/,'差异：').replace(/^Ratio:/,'比例：').replace(/ points\.$/,' 个点。');
    return out;
  }
  function translateNode(n){
    if(!originals.has(n)) originals.set(n,n.nodeValue);
    const src=originals.get(n);
    n.nodeValue=lang==='zh'?zhText(src):src;
  }
  function apply(root=document.body){
    if(applying||!root)return; applying=true;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let n; while((n=walker.nextNode())){
      const tag=n.parentElement?.tagName;
      if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA')continue;
      if(n.nodeValue.trim()) translateNode(n);
    }
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    const b=document.getElementById('langToggle'); if(b)b.textContent=lang==='zh'?'EN':'中文';
    applying=false;
  }
  function toggle(){lang=lang==='zh'?'en':'zh';localStorage.setItem('pemfc-ui-lang',lang);apply();}
  window.uiLang=()=>lang;
  window.uiT=(en,zh)=>lang==='zh'?zh:en;
  const header=document.querySelector('header');
  if(header){
    header.style.position='relative';
    const b=document.createElement('button');b.id='langToggle';b.className='btn btn-secondary';b.type='button';b.style.cssText='position:absolute;right:0;top:0;min-width:64px';b.addEventListener('click',toggle);header.appendChild(b);
  }
  new MutationObserver(ms=>{if(applying)return;for(const m of ms)for(const n of m.addedNodes){if(n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim())translateNode(n);else if(n.nodeType===Node.ELEMENT_NODE)apply(n);}}).observe(document.body,{subtree:true,childList:true});
  apply();
})();
