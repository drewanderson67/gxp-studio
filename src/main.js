/* ---------- shell, router, events ---------- */
function applyTheme(){const r=document.documentElement;r.classList.remove('light','dark');if(S.theme==='light')r.classList.add('light');if(S.theme==='dark')r.classList.add('dark');$('meta[name=theme-color]')?.setAttribute('content',r.classList.contains('dark')||(!r.classList.contains('light')&&matchMedia('(prefers-color-scheme: dark)').matches)?'#0d1020':'#4f46e5')}
function parseHash(){const h=location.hash.replace(/^#\/?/,'')||'dashboard';const [path,q]=h.split('?');const [r,id]=path.split('/');return {r,id:id?decodeURIComponent(id):null,q:new URLSearchParams(q||'')}}
const VIEWS={dashboard:vDashboard,docs:vDocs,doc:vDoc,changes:vChanges,change:vChange,defects:vDefects,defect:vDefect,tests:vTests,test:vTest,run:vRun,trace:vTrace,deviations:vDeviations,dev:vDeviation,training:vTraining,code:vCode,audit:vAudit,settings:vSettings,more:vMore};
let lastRoute='';
function render(){const p=parseHash();const fn=VIEWS[p.r]||vDashboard;let v;
  try{v=fn(p)}catch(e){console.error(e);v={title:'Error',html:`<div class="card"><b>Something went wrong rendering this view.</b><pre class="codebox">${esc(e.stack||e)}</pre></div>`}}
  const sec=SECTION[p.r]||p.r;const cnt={docs:S.docs.filter(d=>d.status==='In Review').length,changes:S.changes.filter(openCR).length,defects:S.defects.filter(openBug).length,deviations:S.deviations.filter(openDev).length,training:trainingGaps(S.currentUser).length};
  $('#nav').innerHTML=NAV.map(([r,i,l],k)=>`${k===5?'<div class="sec">Quality system</div>':k===0?'<div class="sec">Workspace</div>':''}<a href="#/${r}" class="${sec===r?'on':''}"><span class="ic">${i}</span>${l}${cnt[r]?`<span class="cnt">${cnt[r]}</span>`:''}</a>`).join('');
  const moreOn=!NAV.slice(0,5).some(n=>n[0]===sec);
  $('#tabbar').innerHTML=NAV.slice(0,5).map(([r,i,l,s])=>`<a href="#/${r}" class="${sec===r?'on':''}"><span class="ic">${i}</span>${s}</a>`).join('')+`<a href="#/more" class="${moreOn?'on':''}"><span class="ic">⋯</span>More</a>`;
  $('#crumb').innerHTML=(v.back?`<a href="${v.back}" class="btn ghost sm" style="margin-right:4px">‹</a>`:'')+esc(v.title||'');
  $('#user').innerHTML=`${avatar(S.currentUser)}<select data-chg="user" aria-label="Active user">${S.users.map(u=>`<option value="${u.id}" ${u.id===S.currentUser?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  $('#roleTag').textContent=me().role;
  const keep=location.hash===lastRoute?window.scrollY:0;
  $('#view').innerHTML=v.html;
  const fab=$('#fab');fab.style.display=v.fab?'':'none';fab.dataset.act=v.fab||'';
  window.scrollTo(0,keep);lastRoute=location.hash;
}
document.addEventListener('click',e=>{const g=e.target.closest('[data-goto]');if(g){e.preventDefault();const id=g.dataset.goto;if(findAny(id)||id.startsWith('REQ'))location.hash=routeFor(id);else toast(id+' not found');return}
  const a=e.target.closest('[data-act]');if(a&&a.dataset.act&&ACT[a.dataset.act]){e.preventDefault();try{ACT[a.dataset.act](a,e)}catch(err){console.error(err);toast('Error: '+err.message)}}});
document.addEventListener('change',e=>{const a=e.target.closest('[data-chg]');if(a&&CHG[a.dataset.chg])CHG[a.dataset.chg](a,e)});
document.addEventListener('input',e=>{const a=e.target.closest('[data-inp]');if(!a)return;const k=a.dataset.inp;UI[k]=a.value;const pos=a.selectionStart;render();const n=$(`[data-inp="${k}"]`);if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(x){}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&e.target.matches('textarea.code')){e.preventDefault();const t=e.target,s=t.selectionStart;t.setRangeText('  ',s,t.selectionEnd,'end')}});
window.addEventListener('hashchange',()=>{closeModal();render()});
window.addEventListener('storage',e=>{if(e.key===STORE_KEY&&load())render()});
window.addEventListener('online',()=>toast('Back online'));window.addEventListener('offline',()=>toast('Offline — everything keeps working'));
(function init(){if(!load()||!S.audit)seed();else upgradeWorkspace();applyTheme();matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applyTheme);$('#ver').textContent='v'+APP_VERSION;render();
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})})();
