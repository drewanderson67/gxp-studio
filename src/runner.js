/* ---------- test automation harness (runs in a Web Worker; falls back to main thread) ---------- */
function __harness(sutCode,tcs){
  class AssertionError extends Error{}
  const fmt=v=>{try{return v===undefined?'undefined':typeof v==='function'?'[function]':JSON.stringify(v)}catch(e){return String(v)}};
  const out=[];
  for(const tc of tcs){
    const t0=performance.now(),cases=[],logs=[];
    const con={log:(...a)=>logs.push(a.map(x=>typeof x==='object'?fmt(x):String(x)).join(' '))};con.info=con.warn=con.error=con.log;
    let sut={};
    try{const exports={};(new Function('exports','console',sutCode))(exports,con);sut=exports}
    catch(err){out.push({tc:tc.id,status:'Error',ms:0,cases:[{name:'Load system under test',status:'Error',msg:String(err&&err.message||err)}],logs});continue}
    const reg=[];const test=(name,fn)=>reg.push({name,fn});
    const expect=a=>{const fail=m=>{throw new AssertionError(m)};
      const api={
        toBe:b=>{if(!Object.is(a,b))fail(`expected ${fmt(a)} to be ${fmt(b)}`)},
        toEqual:b=>{if(fmt(a)!==fmt(b))fail(`expected ${fmt(a)} to equal ${fmt(b)}`)},
        toBeCloseTo:(b,d=2)=>{if(!(Math.abs(a-b)<Math.pow(10,-d)/2))fail(`expected ${fmt(a)} to be close to ${fmt(b)} (${d} dp)`)},
        toBeTruthy:()=>{if(!a)fail(`expected ${fmt(a)} to be truthy`)},
        toBeFalsy:()=>{if(a)fail(`expected ${fmt(a)} to be falsy`)},
        toBeGreaterThan:b=>{if(!(a>b))fail(`expected ${fmt(a)} > ${fmt(b)}`)},
        toBeGreaterThanOrEqual:b=>{if(!(a>=b))fail(`expected ${fmt(a)} >= ${fmt(b)}`)},
        toBeLessThan:b=>{if(!(a<b))fail(`expected ${fmt(a)} < ${fmt(b)}`)},
        toBeLessThanOrEqual:b=>{if(!(a<=b))fail(`expected ${fmt(a)} <= ${fmt(b)}`)},
        toContain:b=>{if(!(a!=null&&a.includes&&a.includes(b)))fail(`expected ${fmt(a)} to contain ${fmt(b)}`)},
        toMatch:re=>{if(!(new RegExp(re)).test(a))fail(`expected ${fmt(a)} to match ${re}`)},
        toHaveLength:n=>{if(!a||a.length!==n)fail(`expected length ${n}, got ${a&&a.length}`)},
        toThrow:m=>{let threw=false,msg='';try{a()}catch(e){threw=true;msg=String(e&&e.message||e)}if(!threw)fail('expected function to throw');if(m&&!msg.includes(m))fail(`expected error containing "${m}", got "${msg}"`)}
      };
      api.not={};for(const k of Object.keys(api))if(k!=='not')api.not[k]=(...x)=>{let passed=true;try{api[k](...x)}catch(e){passed=false}if(passed)fail(`expected NOT ${k}(${x.map(fmt).join(', ')}) for ${fmt(a)}`)};
      return api};
    try{(new Function('sut','test','expect','console',tc.script))(sut,test,expect,con)}
    catch(err){out.push({tc:tc.id,status:'Error',ms:+(performance.now()-t0).toFixed(1),cases:[{name:'Script error',status:'Error',msg:String(err&&err.message||err)}],logs});continue}
    if(!reg.length){out.push({tc:tc.id,status:'Error',ms:0,cases:[{name:'No test() blocks defined',status:'Error',msg:'Script registered no tests'}],logs});continue}
    for(const c of reg){const c0=performance.now();try{c.fn();cases.push({name:c.name,status:'Pass',ms:+(performance.now()-c0).toFixed(2)})}
      catch(e){cases.push({name:c.name,status:e instanceof AssertionError?'Fail':'Error',msg:String(e&&e.message||e),ms:+(performance.now()-c0).toFixed(2)})}}
    const st=cases.some(c=>c.status==='Error')?'Error':cases.some(c=>c.status==='Fail')?'Fail':'Pass';
    out.push({tc:tc.id,status:st,ms:+(performance.now()-t0).toFixed(1),cases,logs});
  }
  return out;
}
function runSuite(sutCode,tcs,timeoutMs=8000){
  const payload={sut:sutCode,tests:tcs.map(t=>({id:t.id,script:t.script||''}))};
  return new Promise(resolve=>{
    let w,done=false;const fallback=why=>{if(done)return;done=true;try{w&&w.terminate()}catch(e){}resolve({results:__harness(payload.sut,payload.tests),engine:'main thread'+(why?' ('+why+')':'')})};
    try{const src=`${__harness.toString()};onmessage=e=>postMessage(__harness(e.data.sut,e.data.tests));`;
      w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
      const timer=setTimeout(()=>{if(done)return;done=true;w.terminate();resolve({results:payload.tests.map(t=>({tc:t.id,status:'Error',ms:timeoutMs,cases:[{name:'Timeout',status:'Error',msg:`Execution exceeded ${timeoutMs/1000}s — possible infinite loop`}],logs:[]})),engine:'web worker (sandboxed)'})},timeoutMs);
      w.onmessage=e=>{if(done)return;done=true;clearTimeout(timer);w.terminate();resolve({results:e.data,engine:'web worker (sandboxed)'})};
      w.onerror=e=>{clearTimeout(timer);e.preventDefault&&e.preventDefault();fallback('worker unavailable')};
      w.postMessage(payload);
    }catch(e){fallback('worker unavailable')}
  });
}
