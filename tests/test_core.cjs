const assert=require('node:assert/strict'),a=require('../web/analysis.js');
// Performance contract: binary search must not visit every potential.
const n=1000000,x=Array.from({length:n},(_,i)=>i/1000),y=x.map(v=>2*v);let reads=0;
const tracked=new Proxy(x,{get(target,key){if(/^\d+$/.test(String(key)))reads++;return target[key];}});
assert(Math.abs(a.interp(tracked,y,987.6545)-1975.309)<1e-9);
assert(reads<50,`Expected logarithmic search; read ${reads} points`);
for(const t of [NaN,Infinity,-Infinity,-1,1001])assert.equal(a.interp(x,y,t),null);
assert.equal(a.interp([0,1],[0,2],0.5),null);
assert.equal(a.interp([0,1],[0,2],0.5,Infinity),1);
// Large curves should not hit the engine's argument-count limit.
const E=Array.from({length:150000},(_,i)=>i/149999),j=E.map(e=>-6/(1+Math.exp((e-.85)/.025)));
assert(a.plateau(E,j));
console.log('Core regressions passed: interpolation boundaries, logarithmic lookup, 150000-point plateau.');
