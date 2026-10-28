/* Analytic synthetic demo curves, inspired by public Pt/C CV literature.
   The curves are not digitized experimental measurements. */
const ECDemo = (() => {
  const data_origin='synthetic';
  const peak=(e,c,w)=>Math.exp(-(((e-c)/w)**2));
  const logistic=(e,c,w)=>1/(1+Math.exp(-(e-c)/w));
  function cv(scale=1, cycles=3, n=100, lo=.025, hi=1.2){
    const up=e=>.035+.025*(e-.4)+scale*(.16*peak(e,.13,.045)+
      .11*peak(e,.215,.075)+.12*logistic(e,.72,.045)-
      .025*logistic(e,.93,.045)+.04*logistic(e,1.13,.045));
    const down=e=>-.038-.016*(e-.4)-scale*(.20*peak(e,.13,.05)+
      .09*peak(e,.215,.075)+.21*peak(e,.76,.12)+
      .03*peak(e,.64,.07)+.13*logistic(-e,-.075,.012));
    const low=-.17*scale-.038,high=up(hi);
    const anodic=e=>up(e)+(low-up(lo))*peak(e,lo,.012);
    const cathodic=e=>down(e)+(low-down(lo))*peak(e,lo,.018)+
      (high-down(hi))*peak(e,hi,.04);
    const E=[],j=[];
    for(let k=0;k<cycles;k++){
      for(let i=0;i<n;i++){const e=lo+(hi-lo)*i/n;E.push(e);j.push(anodic(e));}
      for(let i=0;i<n;i++){const e=hi-(hi-lo)*i/n;E.push(e);j.push(cathodic(e));}
    }
    E.push(lo);j.push(anodic(lo));return {E,j};
  }
  function orr(center=.85){
    const E=Array.from({length:201},(_,i)=>.2+i*.004);
    const background=E.map(e=>.008+.003*(e-.5));
    const corrected=E.map(e=>-6/(1+Math.exp((e-center)/.025)));
    return {E,background,corrected,raw:corrected.map((v,i)=>v+background[i])};
  }
  function text(E,j,area=.19625){
    return E.map((e,i)=>`${e.toPrecision(8)}\t${(j[i]*area/1000).toPrecision(8)}`).join('\n');
  }
  return {data_origin,cv,orr,text};
})();
if(typeof module!=='undefined')module.exports=ECDemo;
