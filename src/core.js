'use strict';
const APP_VERSION='1.0.0';
const STORE_KEY='gxps.v1';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY=864e5;
const nowISO=()=>new Date().toISOString();
const fmtD=d=>d?new Date(d).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—';
const fmtDT=d=>d?new Date(d).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const fmtUTC=d=>d?new Date(d).toISOString().replace('T',' ').slice(0,19)+' UTC':'—';
const ago=d=>{const s=(Date.now()-new Date(d))/1000;if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';const dd=Math.floor(s/86400);return dd<60?dd+'d ago':fmtD(d)};
const daysUntil=d=>Math.round((new Date(d)-Date.now())/DAY);
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- SHA-256 (sync, pure JS) ---------- */
const sha256=(()=>{const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
return function(str){const b=new TextEncoder().encode(String(str));const l=b.length,bl=l*8;const n=((l+9+63)>>6)<<6;const m=new Uint8Array(n);m.set(b);m[l]=0x80;const dv=new DataView(m.buffer);dv.setUint32(n-4,bl>>>0);dv.setUint32(n-8,Math.floor(bl/2**32));
let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);const r=(x,k)=>(x>>>k)|(x<<(32-k));
for(let o=0;o<n;o+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(let i=16;i<64;i++){const s0=r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3),s1=r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
let a=h0,b2=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let i=0;i<64;i++){const S1=r(e,6)^r(e,11)^r(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])|0,S0=r(a,2)^r(a,13)^r(a,22),mj=(a&b2)^(a&c)^(b2&c),t2=(S0+mj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b2;b2=a;a=(t1+t2)|0}
h0=(h0+a)|0;h1=(h1+b2)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0}
return [h0,h1,h2,h3,h4,h5,h6,h7].map(x=>(x>>>0).toString(16).padStart(8,'0')).join('')}})();
const short=h=>h?h.slice(0,12):'';

/* ---------- state ---------- */
let S=null;
function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify(S))}catch(e){toast('Storage full — export your data')}}
function load(){try{const j=localStorage.getItem(STORE_KEY);if(j){S=JSON.parse(j);return true}}catch(e){}return false}
function nextId(prefix){S.seq[prefix]=(S.seq[prefix]||0)+1;return prefix+'-'+String(S.seq[prefix]).padStart(4,'0')}
const me=()=>S.users.find(u=>u.id===S.currentUser)||S.users[0];
const userName=id=>(S.users.find(u=>u.id===id)||{name:id||'—'}).name;
const userColor=id=>({u1:'#4f46e5',u2:'#0f9d6b',u3:'#d23a4a',u4:'#c27a00'}[id]||'#7c3aed');
const initials=n=>String(n).split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const avatar=id=>`<span class="av" style="background:${userColor(id)}">${initials(userName(id))}</span>`;
const findAny=id=>{if(!id)return null;const p=id.split('-')[0];const col={DOC:'docs',REQ:'reqs',TC:'tests',TR:'runs',CR:'changes',BUG:'defects',CAPA:'defects',CV:'code'}[p];return col?S[col].find(x=>x.id===id):null};
const routeFor=id=>{const p=String(id).split('-')[0];return {DOC:'#/doc/',REQ:'#/trace?req=',TC:'#/test/',TR:'#/run/',CR:'#/change/',BUG:'#/defect/',CV:'#/code/'}[p]+id};
const link=id=>id?`<a href="${routeFor(id)}" class="mono">${esc(id)}</a>`:'—';

/* ---------- audit trail (hash chained) ---------- */
function audit(action,entity,detail,userId){
  const prev=S.audit.length?S.audit[S.audit.length-1].hash:'0'.repeat(64);
  const e={seq:S.audit.length+1,at:S._clock||nowISO(),user:userId||S.currentUser,action,entity,detail:detail||'',prev};
  e.hash=sha256(JSON.stringify([e.seq,e.at,e.user,e.action,e.entity,e.detail,e.prev]));
  S.audit.push(e);
}
function verifyAudit(){let prev='0'.repeat(64);for(const e of S.audit){const h=sha256(JSON.stringify([e.seq,e.at,e.user,e.action,e.entity,e.detail,e.prev]));if(e.prev!==prev||h!==e.hash)return {ok:false,at:e.seq};prev=e.hash}return {ok:true,n:S.audit.length,head:prev}}
function recordHash(o){const c=clone(o);delete c.signatures;delete c.history;return sha256(JSON.stringify(c))}
function hist(o,text){(o.history=o.history||[]).push({at:nowISO(),by:S.currentUser,text})}

/* ---------- UI helpers ---------- */
function toast(msg){$$('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function modal(title,body,foot,wide){closeModal();const s=document.createElement('div');s.className='scrim';s.innerHTML=`<div class="modal ${wide?'wide':''}" role="dialog"><div class="mh"><h2>${esc(title)}</h2><button class="btn ghost sm" data-x>✕</button></div><div class="mb">${body}</div>${foot?`<div class="mf">${foot}</div>`:''}</div>`;s.addEventListener('click',e=>{if(e.target===s||e.target.closest('[data-x]'))closeModal()});document.body.appendChild(s);const f=s.querySelector('input:not([type=checkbox]),textarea,select');if(f&&matchMedia('(min-width:861px)').matches)f.focus();return s}
function closeModal(){$$('.scrim').forEach(x=>x.remove())}
/* two-click confirm (no confirm() — blocked in preview iframes) */
function armed(btn,fn,label='Click again to confirm'){if(btn.classList.contains('armed')){fn();return}const o=btn.innerHTML;btn.classList.add('armed');btn.textContent=label;setTimeout(()=>{if(btn.isConnected){btn.classList.remove('armed');btn.innerHTML=o}},3500)}
const statusTone=s=>({Draft:'',New:'',Open:'bad','In Review':'warn',Reviewed:'info',Approved:'info',Effective:'ok',Superseded:'',Retired:'',Assessed:'warn',Implemented:'info',Verified:'ok',Closed:'ok',Rejected:'bad',Investigating:'warn','Fix In Progress':'info','Ready for Verification':'brand',Pass:'ok',Fail:'bad',Error:'warn',Baseline:'ok',Candidate:'brand',Released:'ok',Critical:'bad',Major:'warn',Minor:'info',High:'bad',Medium:'warn',Low:'ok'}[s]||'');
const pill=(s,t)=>`<span class="pill ${t??statusTone(s)}">${esc(s)}</span>`;
const stepper=(flow,cur)=>{const i=flow.indexOf(cur);return `<div class="steps">${flow.map((f,k)=>`<span class="${k<i?'done':k===i?'cur':''}">${k<i?'✓ ':''}${esc(f)}</span>`).join('')}</div>`};
function blobLink(text,name,type,label,cls='btn'){const u=URL.createObjectURL(new Blob([text],{type}));return `<a class="${cls}" href="${u}" download="${esc(name)}">${label}</a>`}

/* ---------- e-signature (21 CFR Part 11 style) ---------- */
function esign({record,meanings,title,onSign,requireReason=true}){
  const u=me();
  const m=modal(title||'Electronic signature',`
    <div class="small muted">By signing, you confirm this electronic signature is the legally binding equivalent of your handwritten signature (21 CFR 11.100).</div>
    <div class="kv"><dt>Record</dt><dd class="mono">${esc(record.id)} · ${esc(record.title||'')}</dd><dt>Signer</dt><dd>${esc(u.name)} (${esc(u.role)})</dd><dt>Record hash</dt><dd class="hashv">${recordHash(record)}</dd></div>
    <label class="f">Meaning of signature<select class="inp" id="sgM">${meanings.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
    <label class="f">Reason / comment ${requireReason?'(required)':''}<input class="inp" id="sgR" placeholder="e.g. Reviewed against SOP-QA-012"></label>
    <label class="f">Re-enter password / PIN<input class="inp" id="sgP" type="password" autocomplete="off" inputmode="numeric" placeholder="Demo PIN for every user: 1234"></label>
    <div class="err" id="sgE"></div>`,
    `<button class="btn" data-x>Cancel</button><button class="btn pri" id="sgGo">✍ Sign</button>`);
  $('#sgGo',m).onclick=()=>{const pin=$('#sgP',m).value,reason=$('#sgR',m).value.trim(),meaning=$('#sgM',m).value;
    if(pin!==u.pin){$('#sgE',m).textContent='Signature failed: incorrect PIN. Attempt logged.';audit('E-signature failed',record.id,'Invalid credentials');save();return}
    if(requireReason&&!reason){$('#sgE',m).textContent='A reason is required.';return}
    const sig={by:u.id,name:u.name,role:u.role,meaning,reason,at:nowISO(),version:record.version||null,hash:recordHash(record)};
    sig.sigHash=sha256(JSON.stringify(sig));
    (record.signatures=record.signatures||[]).push(sig);
    audit('E-signed ('+meaning+')',record.id,reason);
    closeModal();onSign&&onSign(sig);save();render()};
}
const sigBlock=s=>`<div class="sig"><span class="seal">✒</span><div style="flex:1"><b>${esc(s.name)}</b> · ${esc(s.meaning)} <span class="muted">(${esc(s.role)})</span><div class="small muted">${fmtUTC(s.at)} — ${esc(s.reason||'')}</div><div class="hashv">sig ${short(s.sigHash)} · record ${short(s.hash)}</div></div></div>`;

/* ---------- mini markdown ---------- */
function md(src){
  const lines=String(src||'').split('\n');let out='',i=0;const inl=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\b((?:DOC|REQ|TC|TR|CR|BUG|CV)-\d{4})\b/g,'<a href="#" data-goto="$1" class="mono">$1</a>');
  while(i<lines.length){const l=lines[i];
    if(/^```/.test(l)){let b=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))b.push(lines[i++]);i++;out+=`<pre class="codebox">${esc(b.join('\n'))}</pre>`;continue}
    if(/^\|/.test(l)){const rows=[];while(i<lines.length&&/^\|/.test(lines[i]))rows.push(lines[i++]);const cells=r=>r.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());const body=rows.filter(r=>!/^\|[\s:|-]+\|$/.test(r));out+='<div style="overflow:auto"><table><thead><tr>'+cells(body[0]).map(c=>`<th>${inl(c)}</th>`).join('')+'</tr></thead><tbody>'+body.slice(1).map(r=>'<tr>'+cells(r).map(c=>`<td>${inl(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';continue}
    if(/^#{1,3} /.test(l)){const n=l.match(/^#+/)[0].length;out+=`<h${n}>${inl(l.slice(n+1))}</h${n}>`;i++;continue}
    if(/^\s*[-*] /.test(l)){out+='<ul>';while(i<lines.length&&/^\s*[-*] /.test(lines[i]))out+=`<li>${inl(lines[i++].replace(/^\s*[-*] /,''))}</li>`;out+='</ul>';continue}
    if(/^\s*\d+\. /.test(l)){out+='<ol>';while(i<lines.length&&/^\s*\d+\. /.test(lines[i]))out+=`<li>${inl(lines[i++].replace(/^\s*\d+\. /,''))}</li>`;out+='</ol>';continue}
    if(!l.trim()){i++;continue}
    let p=[];while(i<lines.length&&lines[i].trim()&&!/^(#|\||```|\s*[-*] |\s*\d+\. )/.test(lines[i]))p.push(lines[i++]);out+=`<p>${inl(p.join(' '))}</p>`}
  return out}

/* ---------- line diff (LCS) ---------- */
function diffLines(a,b){a=String(a).split('\n');b=String(b).split('\n');const n=a.length,m=b.length;
  if(n*m>4e6)return {ops:[...a.map(t=>({t:'del',s:t})),...b.map(t=>({t:'add',s:t}))],add:m,del:n};
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const ops=[];let i=0,j=0,add=0,del=0;while(i<n&&j<m){if(a[i]===b[j]){ops.push({t:'eq',s:a[i],ai:i+1,bi:j+1});i++;j++}else if(dp[i+1][j]>=dp[i][j+1]){ops.push({t:'del',s:a[i],ai:i+1});i++;del++}else{ops.push({t:'add',s:b[j],bi:j+1});j++;add++}}
  while(i<n){ops.push({t:'del',s:a[i],ai:i+1});i++;del++}while(j<m){ops.push({t:'add',s:b[j],bi:j+1});j++;add++}return {ops,add,del}}
function diffHTML(a,b,ctx=3){const {ops,add,del}=diffLines(a,b);const keep=new Array(ops.length).fill(false);ops.forEach((o,k)=>{if(o.t!=='eq')for(let q=Math.max(0,k-ctx);q<=Math.min(ops.length-1,k+ctx);q++)keep[q]=true});
  let h='',skipped=0;ops.forEach((o,k)=>{if(!keep[k]){skipped++;return}if(skipped){h+=`<div class="gap">··· ${skipped} unchanged line${skipped>1?'s':''}</div>`;skipped=0}h+=`<div class="ln ${o.t}"><span class="n">${o.t==='del'?o.ai:o.bi}</span><span class="c">${esc(o.s)||' '}</span></div>`});
  if(skipped)h+=`<div class="gap">··· ${skipped} unchanged line${skipped>1?'s':''}</div>`;if(!add&&!del)h='<div class="gap">No differences</div>';return {html:`<div class="diff">${h}</div>`,add,del}}
