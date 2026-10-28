'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const parts=[...html.matchAll(/<script(?: id="core")?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
class Element {
 constructor(id){this.id=id;this.value='';this.innerHTML='';this.textContent='';this.listeners={};this.dataset={};this.files=[];}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
 async event(type){for(const fn of this.listeners[type]||[])await fn({target:this})}
 append(){} remove(){} click(){}
}
let els=new Map(),storage=new Map();
const document={getElementById(id){if(!els.has(id))els.set(id,new Element(id));return els.get(id)},querySelectorAll(){return []},documentElement:{},body:{append(){}},createElement(tag){return new Element(tag)}};
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
let allowed=true,printCalled=false;
const ctx={document,localStorage,console,confirm:()=>allowed,window:{print(){printCalled=true}},navigator:{clipboard:{async writeText(){}}},Blob,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},setTimeout,Date,Math,Number,String,Set,JSON,Error};
vm.runInNewContext(parts[0],ctx);vm.runInNewContext(parts[1],ctx);
const $=id=>document.getElementById(id),current=()=>JSON.parse(storage.get('support-quality-workbench-v1'));
(async()=>{
 assert.equal(current().selected,'Synthetic Case');
 assert.match($('comparisonWarning').textContent,/Fields match/);
 $('meta_rpm').value='900';await $('meta_rpm').event('input');
 assert.match($('comparisonWarning').textContent,/Different.*Rotation/);
 assert.match($('metricTable').innerHTML,/—/);
 $('meta_rpm').value='1600';await $('meta_rpm').event('input');
 let fixture=fs.readFileSync('examples/analyzer-synthetic-results.csv','utf8');
 $('csvFile').files=[{size:Buffer.byteLength(fixture),text:async()=>fixture}];await $('csvFile').event('change');
 assert.match($('status').textContent,/Imported 2 sample/);
 let s=current();assert.equal(s.samples.length,5);assert.equal(s.selected,'Synthetic Pt');assert.equal(s.specLow,'');assert.equal(s.specHigh,'');
 assert.match($('comparisonWarning').textContent,/Missing/);
 $('print').event('click');assert.equal(printCalled,true);assert.match($('reportPrint').textContent,/TECHNICAL SUPPORT/);assert.match($('reportPrint').textContent,/Synthetic Pt/);assert.match($('reportPrint').textContent,/POTENTIAL CAUSES — UNCONFIRMED/);
 let before=JSON.stringify(current());$('csvFile').files=[{size:10,text:async()=>fixture}];allowed=false;await $('csvFile').event('change');assert.match($('status').textContent,/Import canceled/);assert.equal(JSON.stringify(current()),before);
 $('csvFile').files=[{size:10,text:async()=>'invalid'}];await $('csvFile').event('change');assert.match($('status').textContent,/Import error/);assert.equal(JSON.stringify(current()),before);
 $('sample').value='Example';await $('sample').event('change');assert.match($('comparisonWarning').textContent,/synthetic and anonymized/);assert.equal(current().specLow,'');
 $('language').event('click');assert.match($('comparisonWarning').textContent,/模拟数据/);assert.match($('issue').value,/模拟案例/);
 console.log('UI-flow tests passed: import, duplicates, context gating, language and printable report.');
})().catch(e=>{console.error(e);process.exit(1)});
