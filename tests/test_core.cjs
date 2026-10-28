const assert=require('node:assert/strict'),a=require('../web/analysis.js');
const demo=require('../web/demo.js');
assert.equal(demo.data_origin,'synthetic');
const synthetic=demo.cv(1,1,100);
assert.equal(synthetic.E[0],.025);
assert.equal(synthetic.E[100],1.2);
assert.equal(synthetic.E.at(-1),.025);
assert(Math.abs(synthetic.j[99]-synthetic.j[100])<.02);
assert(Math.abs(synthetic.j[199]-synthetic.j[200])<.1);
// Performance contract: binary search must not visit every potential.
const n=1000000,x=Array.from({length:n},(_,i)=>i/1000),y=x.map(v=>2*v);let reads=0;
const tracked=new Proxy(x,{get(target,key){if(/^\d+$/.test(String(key)))reads++;return target[key];}});
assert(Math.abs(a.interp(tracked,y,987.6545)-1975.309)<1e-9);
assert(reads<50,`Expected logarithmic search; read ${reads} points`);
for(const t of [NaN,Infinity,-Infinity,-1,1001])assert.equal(a.interp(x,y,t),null);
assert.equal(a.interp([0,1],[0,2],0.5),null);
assert.equal(a.interp([0,1],[0,2],0.5,Infinity),1);
// Positive integration must stop exactly where a line crosses the baseline.
const region=a.hupdRegion([0,.1,.2,.3,.4],[-1,1,-1,1,-1],0,.4,0);
assert(Math.abs(region.area-.1)<1e-12);
assert.equal(region.current[0],-1);
assert.equal(region.upper[0],0);
assert(region.x.some(x=>Math.abs(x-.05)<1e-12));
const sloped=a.hupdRegion([0,.1,.2],[-1,1.1,-.8],0,.2,[0,.2]);
assert(Math.abs(sloped.area-.05)<1e-12);
assert(sloped.x.some(x=>Math.abs(x-.05)<1e-12));
assert(sloped.x.some(x=>Math.abs(x-.15)<1e-12));
assert.equal(sloped.baseline[0],0);assert(Math.abs(sloped.baseline.at(-1)-.2)<1e-12);
assert.throws(()=>a.hupdRegion([0,.1,.2],[-1,1.1,-.8],0,.2,[0,NaN]));
assert.throws(()=>a.cvAnalysis({E:[0,.1,.2],j:[-1,1.1,-.8],hupd_range_V:[0,.2],baseline_mA_cm2:0,baseline_endpoints_mA_cm2:[0,.2]},.02));
// Large curves should not hit the engine's argument-count limit.
const E=Array.from({length:150000},(_,i)=>i/149999),j=E.map(e=>-6/(1+Math.exp((e-.85)/.025)));
assert(a.plateau(E,j));
console.log('Core regressions passed: interpolation boundaries, logarithmic lookup, 150000-point plateau.');
