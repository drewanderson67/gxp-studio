/* ---------- shared view logic ---------- */
const UI={docF:'All',docQ:'',docT:'',crF:'Open',crQ:'',bugF:'Open',bugQ:'',tcQ:'',tcT:'All',tcSel:new Set(),tcTarget:'',auditQ:'',auditU:'',traceF:'All',tabs:{},verify:null,devF:'Open',devQ:''};
const ACT={},CHG={};
const NAV=[['dashboard','◉','Dashboard','Home'],['docs','▤','Documents','Docs'],['changes','⇄','Change Control','Changes'],['defects','✱','Defects & CAPA','Defects'],['tests','▶','Test Automation','Tests'],['deviations','△','Deviations'],['training','◎','Training'],['trace','⊞','Traceability'],['code','{}','Code Baselines'],['audit','≡','Audit Trail'],['settings','⚙','Settings']];
const SECTION={doc:'docs',change:'changes',defect:'defects',test:'tests',run:'tests',dev:'deviations'};
const hasRole=r=>me().roles.includes(r);
const isQA=()=>hasRole('QA');
function guard(ok,msg){if(!ok)toast(msg);return ok}
const byAt=(a,b)=>a.at<b.at?-1:a.at>b.at?1:0;
function latestResult(tcId,filter){let best=null;for(const r of S.runs){if(filter&&!filter(r))continue;const x=r.results.find(z=>z.tc===tcId);if(x&&(!best||r.at>best.run.at))best={status:x.status,run:r,res:x}}return best}
const rpn=r=>r.risk.s*r.risk.p*r.risk.d;
const riskClass=n=>n>=12?'High':n>=6?'Medium':'Low';
function reqState(req){const tcs=S.tests.filter(t=>t.reqs.includes(req.id));if(!tcs.length)return {k:'none',label:'Not covered',tone:'bad',tcs};const lr=tcs.map(t=>latestResult(t.id));if(lr.some(x=>x&&x.status!=='Pass'))return {k:'fail',label:'Failing',tone:'bad',tcs,lr};if(lr.some(x=>!x))return {k:'notrun',label:'Not executed',tone:'warn',tcs,lr};return {k:'pass',label:'Verified',tone:'ok',tcs,lr}}
const openBug=d=>!['Verified','Closed'].includes(d.status);
const openCR=c=>!['Closed','Rejected'].includes(c.status);
const resIcon=s=>s==='Pass'?'<span class="res pass" title="Pass">✓</span>':s==='Fail'?'<span class="res fail" title="Fail">✕</span>':s==='Error'?'<span class="res err" title="Error">!</span>':'<span class="res none" title="Not run">–</span>';
const sigsAt=(rec,meaning)=>(rec.signatures||[]).filter(s=>s.meaning===meaning&&(!rec.version||!s.version||s.version===rec.version));
const tabsBar=(k,list,def)=>{const cur=UI.tabs[k]||def||list[0][0];return [cur,`<div class="tabs">${list.map(([v,l])=>`<button class="${v===cur?'on':''}" data-act="tab" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`]};
const seg=(k,opts)=>`<div class="seg">${opts.map(o=>`<button class="${UI[k]===o?'on':''}" data-act="set" data-k="${k}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const histHTML=h=>(h&&h.length)?`<div class="timeline">${h.slice().reverse().map(x=>`<div class="ev"><b>${esc(x.text)}</b> · ${esc(userName(x.by))}<div class="when">${fmtUTC(x.at)}</div></div>`).join('')}</div>`:'<div class="muted small">No history.</div>';
const sigsHTML=rec=>(rec.signatures||[]).length?rec.signatures.slice().reverse().map(s=>sigBlock(s)+(s.version?`<div class="small muted" style="margin:-2px 0 4px 4px">Signed at version ${esc(s.version)}</div>`:'')).join(''):'<div class="muted small">No signatures yet.</div>';
const userOpts=sel=>S.users.map(u=>`<option value="${u.id}" ${u.id===sel?'selected':''}>${esc(u.name)} — ${esc(u.role)}</option>`).join('');
const opts=(list,sel)=>list.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(l)}</option>`}).join('');
const val=(id,root=document)=>{const e=root.querySelector('#'+id);return e?(e.type==='checkbox'?e.checked:e.value):undefined};

ACT.tab=b=>{UI.tabs[b.dataset.k]=b.dataset.v;render()};
ACT.set=b=>{UI[b.dataset.k]=b.dataset.v;render()};
ACT.go=b=>{location.hash=b.dataset.href};

/* ---------- insights ---------- */
function insights(){const I=[];const a=verifyAudit();
  if(!a.ok)I.push({t:'bad',i:'!',h:'Audit trail integrity failure',x:`Hash chain broken at entry #${a.at}. Investigate as a data integrity incident.`,href:'#/audit'});
  S.changes.filter(c=>['Implemented','Verified'].includes(c.status)&&c.lang==='javascript'&&c.tests.length).forEach(c=>{const h=sha256(c.targetCode);const last=S.runs.filter(r=>r.cr===c.id&&r.codeHash===h).sort(byAt).at(-1);
    if(!last)I.push({t:'warn',i:'▶',h:`${c.id}: regression not run on current candidate`,x:'Target code changed since the last recorded run — execute the regression suite before verification.',href:`#/change/${c.id}`});
    else{const f=last.results.filter(x=>x.status!=='Pass');if(f.length)I.push({t:'bad',i:'✕',h:`${c.id}: regression failing — release blocked`,x:`${f.length} of ${last.results.length} test cases failed in ${last.id} (${f.map(x=>x.tc).join(', ')}).`,href:'#/run/'+last.id})}});
  const crit=S.defects.filter(d=>openBug(d)&&['Critical','Major'].includes(d.severity));if(crit.length)I.push({t:'bad',i:'✱',h:`${crit.length} open Critical/Major defect${crit.length>1?'s':''}`,x:crit.map(d=>`${d.id} ${d.title}`).join(' · '),href:'#/defects'});
  S.docs.forEach(d=>{if(d.status==='Effective'&&d.reviewDue){const n=daysUntil(d.reviewDue);if(n<0)I.push({t:'bad',i:'↻',h:`Periodic review overdue: ${d.id}`,x:`${d.title} was due ${-n} days ago (${fmtD(d.reviewDue)}).`,href:'#/doc/'+d.id});else if(n<=30)I.push({t:'warn',i:'↻',h:`Periodic review due in ${n} days: ${d.id}`,x:d.title,href:'#/doc/'+d.id})}});
  const hiFail=S.reqs.filter(r=>r.gxp==='High'&&reqState(r).k==='fail');if(hiFail.length)I.push({t:'bad',i:'⊞',h:`${hiFail.length} High-GxP requirement${hiFail.length>1?'s':''} failing verification`,x:hiFail.map(r=>r.id).join(', '),href:'#/trace'});
  const unc=S.reqs.filter(r=>reqState(r).k==='none');if(unc.length)I.push({t:'warn',i:'⊞',h:`${unc.length} requirement${unc.length>1?'s':''} without test coverage`,x:unc.map(r=>`${r.id} ${r.text}`).join(' · '),href:'#/trace'});
  const nr=S.reqs.filter(r=>reqState(r).k==='notrun');if(nr.length)I.push({t:'warn',i:'▶',h:`${nr.length} requirement${nr.length>1?'s':''} with tests never executed`,x:nr.map(r=>r.id).join(', ')+' — execute the linked manual/automated tests.',href:'#/trace'});
  const noCapa=S.defects.filter(d=>openBug(d)&&d.gxp!=='Low'&&d.rootCause&&!(d.capa.corrective&&d.capa.preventive));if(noCapa.length)I.push({t:'warn',i:'✱',h:`${noCapa.length} defect${noCapa.length>1?'s':''} missing CAPA`,x:noCapa.map(d=>d.id).join(', '),href:'#/defects'});
  const inrev=S.docs.filter(d=>d.status==='In Review');if(inrev.length)I.push({t:'info',i:'▤',h:`${inrev.length} document${inrev.length>1?'s':''} awaiting review/approval`,x:inrev.map(d=>`${d.id} ${d.title}`).join(' · '),href:'#/docs'});
  const unsigned=S.runs.filter(r=>!sigsAt(r,'Reviewed').length);if(unsigned.length)I.push({t:'info',i:'✒',h:`${unsigned.length} test run${unsigned.length>1?'s':''} awaiting independent review`,x:unsigned.map(r=>r.id).join(', '),href:'#/tests'});
  const dvo=(S.deviations||[]).filter(devOverdue);if(dvo.length)I.push({t:'bad',i:'△',h:`${dvo.length} deviation${dvo.length>1?'s':''} past the 30-day closure target`,x:dvo.map(v=>`${v.id} ${v.title}`).join(' · '),href:'#/deviations'});
  const dvn=(S.deviations||[]).filter(v=>openDev(v)&&!v.immediate.trim());if(dvn.length)I.push({t:'warn',i:'△',h:`${dvn.length} deviation${dvn.length>1?'s':''} without containment`,x:dvn.map(v=>v.id).join(', '),href:'#/deviations'});
  let tO=0,tD=0;S.users.forEach(u=>trainingGaps(u.id).forEach(([,s])=>s.k==='Overdue'?tO++:tD++));if(tO)I.push({t:'bad',i:'◎',h:`${tO} overdue training assignment${tO>1?'s':''}`,x:'Users signing GxP records without current SOP training (21 CFR 11.10(i)).',href:'#/training'});if(tD)I.push({t:'warn',i:'◎',h:`${tD} training assignment${tD>1?'s':''} due`,x:'New effective SOP/policy versions require read-and-understood signatures.',href:'#/training'});
  const pend=S.changes.filter(c=>c.status==='Assessed');if(pend.length)I.push({t:'info',i:'⇄',h:`${pend.length} change${pend.length>1?'s':''} awaiting QA approval`,x:pend.map(c=>c.id+' '+c.title).join(' · '),href:'#/changes'});
  if(a.ok)I.push({t:'ok',i:'✓',h:'Audit trail intact',x:`${a.n} entries, SHA-256 hash chain verified (head ${short(a.head)}).`,href:'#/audit'});
  const o={bad:0,warn:1,info:2,ok:3};return I.sort((x,y)=>o[x.t]-o[y.t])}
const insightHTML=i=>`<a class="insight ${i.t}" href="${i.href}" style="color:inherit"><div class="dot">${i.i}</div><div class="tx"><b>${esc(i.h)}</b><span class="muted">${esc(i.x)}</span></div></a>`;

function readiness(c){const h=sha256(c.targetCode||'');const last=S.runs.filter(r=>r.cr===c.id&&r.codeHash===h).sort(byAt).at(-1);const bugs=S.defects.filter(d=>d.cr===c.id&&openBug(d));
  const items=[[sigsAt(c,'Approved').length>0,'QA approval before implementation'],[c.plan.every(p=>p.done),`Migration plan complete (${c.plan.filter(p=>p.done).length}/${c.plan.length})`]];
  if(c.lang==='javascript'&&c.tests.length)items.push([!!last&&last.results.every(x=>x.status==='Pass'),last?`Regression on current candidate: ${last.results.filter(x=>x.status==='Pass').length}/${last.results.length} pass (${last.id})`:'Regression on current candidate: not run']);
  items.push([!bugs.length,bugs.length?`${bugs.length} open linked defect${bugs.length>1?'s':''} (${bugs.map(b=>b.id).join(', ')})`:'No open linked defects']);
  items.push([sigsAt(c,'Verified').length>0,'Verification e-signature']);
  return items}

/* ---------- dashboard ---------- */
function vDashboard(){
  const states=S.reqs.map(reqState);const ver=states.filter(s=>s.k==='pass').length;const cov=S.reqs.length?Math.round(ver/S.reqs.length*100):0;
  const lr=S.tests.map(t=>latestResult(t.id)).filter(Boolean);const pass=lr.filter(x=>x.status==='Pass').length;const pr=lr.length?Math.round(pass/lr.length*100):0;
  const ob=S.defects.filter(openBug);const oc=S.changes.filter(openCR);
  const effective=S.docs.filter(d=>d.status==='Effective').length;
  const ins=insights();
  const rel=S.changes.filter(c=>['Implemented','Verified','Approved'].includes(c.status));
  const bar=(label,parts,total)=>`<div class="br"><span>${label}</span><div class="tr">${parts.map(([n,c])=>n?`<i style="width:${n/total*100}%;background:${c}"></i>`:'').join('')}</div><b>${parts.reduce((a,p)=>a+p[0],0)}</b></div>`;
  const dc=s=>S.docs.filter(d=>d.status===s).length;const bc=s=>S.defects.filter(d=>d.status===s).length;
  return {title:'Dashboard',html:`
  <div class="ph"><div class="t"><h1>Validation command center</h1><p>${esc(S.system.org)} · ${esc(S.system.name)} · ${esc(S.system.gamp)}</p></div>
    <div class="row hide-m"><a class="btn" href="#/trace">⊞ Traceability</a><a class="btn pri" href="#/tests">▶ Run tests</a></div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">Requirements verified</div><div class="v">${cov}%</div><div class="s">${ver} of ${S.reqs.length} traced to passing tests</div><div class="bar"><i style="width:${cov}%"></i></div></div>
    <div class="card kpi"><div class="l">Test pass rate</div><div class="v">${pr}%</div><div class="s">${pass}/${lr.length} latest results · ${S.runs.length} runs</div><div class="bar"><i style="width:${pr}%"></i></div></div>
    <a class="card kpi" href="#/defects" style="color:inherit"><div class="l">Open defects</div><div class="v" style="color:${ob.some(d=>d.severity!=='Minor')?'var(--bad)':'inherit'}">${ob.length}</div><div class="s">${ob.filter(d=>d.severity!=='Minor').length} Critical/Major · ${S.defects.length-ob.length} closed</div></a>
    <a class="card kpi" href="#/changes" style="color:inherit"><div class="l">Open changes</div><div class="v">${oc.length}</div><div class="s">${oc.filter(c=>/Migration/.test(c.type)).length} code/data migrations · ${effective} docs effective</div></a>
  </div>
  <div class="grid g2 dash2" style="margin-top:14px">
    <div class="card p0"><div style="padding:14px 16px 6px" class="row"><h2 style="margin:0;flex:1">Compliance insights</h2><span class="pill">${ins.filter(i=>i.t==='bad').length} critical · ${ins.filter(i=>i.t==='warn').length} warnings</span></div>${ins.map(insightHTML).join('')}</div>
    <div>
      ${rel.map(c=>{const it=readiness(c);const ok=it.filter(x=>x[0]).length;return `<div class="card"><div class="row"><h2 style="margin:0;flex:1">Release readiness</h2>${pill(c.status)}</div><div class="small muted" style="margin:4px 0 8px"><a href="#/change/${c.id}" class="mono">${c.id}</a> ${esc(c.title)}</div>
        <div class="row" style="align-items:center;gap:16px;flex-wrap:nowrap"><div class="ring" style="--p:${Math.round(ok/it.length*100)}"><div>${ok}/${it.length}<small>gates met</small></div></div><div style="flex:1">${it.map(([k,l])=>`<div class="small" style="padding:3px 0">${k?'<span style="color:var(--ok)">✓</span>':'<span style="color:var(--bad)">✕</span>'} ${esc(l)}</div>`).join('')}</div></div></div>`}).join('')}
      <div class="card"><h2>Status overview</h2><div class="bars">
        ${bar('Documents',[[dc('Draft'),'#a5b4fc'],[dc('In Review'),'var(--warn)'],[dc('Approved'),'var(--info)'],[dc('Effective'),'var(--ok)']],Math.max(1,S.docs.length))}
        ${bar('Defects',[[bc('Open')+bc('Investigating'),'var(--bad)'],[bc('Fix In Progress')+bc('Ready for Verification'),'var(--warn)'],[bc('Verified')+bc('Closed'),'var(--ok)']],Math.max(1,S.defects.length))}
        ${bar('Deviations',[[S.deviations.filter(v=>v.status==='Open').length,'var(--bad)'],[S.deviations.filter(v=>['Investigation','QA Review'].includes(v.status)).length,'var(--warn)'],[S.deviations.filter(v=>v.status==='Closed').length,'var(--ok)']],Math.max(1,S.deviations.length))}
        ${bar('Test cases',[[lr.filter(x=>x.status==='Pass').length,'var(--ok)'],[lr.filter(x=>x.status!=='Pass').length,'var(--bad)'],[S.tests.length-lr.length,'#c7cbe0']],Math.max(1,S.tests.length))}
        ${bar('Requirements',[[ver,'var(--ok)'],[states.filter(s=>s.k==='fail').length,'var(--bad)'],[states.filter(s=>s.k==='notrun').length,'var(--warn)'],[states.filter(s=>s.k==='none').length,'#c7cbe0']],Math.max(1,S.reqs.length))}
      </div></div>
      <div class="card"><div class="row"><h2 style="flex:1;margin:0">Recent activity</h2><a href="#/audit" class="small">Audit trail →</a></div><div class="timeline" style="margin-top:10px">${S.audit.slice(-7).reverse().map(e=>`<div class="ev"><b>${esc(e.action)}</b> ${e.entity!=='SYSTEM'?link(e.entity):''}<div class="when">${esc(userName(e.user))} · ${ago(e.at)}</div></div>`).join('')}</div></div>
    </div>
  </div>`}}

/* ---------- documents ---------- */
const DOC_FLOW=['Draft','In Review','Approved','Effective'];
function vDocs(){
  const q=UI.docQ.toLowerCase();const list=S.docs.filter(d=>(UI.docF==='All'||d.status===UI.docF)&&(!UI.docT||d.type===UI.docT)&&(!q||(d.id+' '+d.title+' '+d.content).toLowerCase().includes(q)));
  return {title:'Documents',fab:'docNew',html:`<div class="ph"><div class="t"><h1>GxP documents</h1><p>Controlled documents with lifecycle, versioning and Part 11 e-signatures.</p></div><button class="btn pri hide-m" data-act="docNew">+ New document</button></div>
  <div class="toolbar"><input class="search" data-inp="docQ" placeholder="Search documents…" value="${esc(UI.docQ)}"><select class="inp" style="width:auto" data-chg="docT"><option value="">All types</option>${Object.entries(DOC_TYPES).map(([k,v])=>`<option value="${k}" ${UI.docT===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
  <div class="toolbar">${seg('docF',['All','Draft','In Review','Approved','Effective','Retired'])}</div>
  <div class="card p0 list">${list.length?list.map(d=>{const n=d.reviewDue&&d.status==='Effective'?daysUntil(d.reviewDue):null;return `<a class="item" href="#/doc/${d.id}"><span class="id">${d.id}</span><div class="main1"><div class="ttl">${esc(d.title)}</div><div class="meta"><span>${esc(DOC_TYPES[d.type]||d.type)}</span><span>v${esc(d.version)}</span><span>${esc(userName(d.owner))}</span>${n!=null?`<span style="color:${n<0?'var(--bad)':n<=30?'var(--warn)':'inherit'}">Review ${n<0?'overdue':'due'} ${fmtD(d.reviewDue)}</span>`:''}</div></div>${pill(d.status)}</a>`}).join(''):'<div class="empty">No documents match.</div>'}</div>`}}
CHG.docT=e=>{UI.docT=e.value;render()};
ACT.docNew=()=>{const m=modal('New controlled document',`
  <label class="f">Document type<select class="inp" id="ndT">${Object.entries(DOC_TYPES).map(([k,v])=>`<option value="${k}">${esc(v)} (${k})</option>`).join('')}</select></label>
  <label class="f">Title<input class="inp" id="ndN" placeholder="e.g. LabTrack LIMS v5.0 PQ Protocol"></label>
  <label class="f">Owner<select class="inp" id="ndO">${userOpts(S.currentUser)}</select></label>
  <label class="chk"><input type="checkbox" id="ndTpl" checked> Start from the GxP template for this type</label>`,`<button class="btn" data-x>Cancel</button><button class="btn pri" id="ndGo">Create draft</button>`);
  $('#ndGo',m).onclick=()=>{const title=val('ndN',m).trim();if(!title){toast('Title is required');return}const type=val('ndT',m);const id=nextId('DOC');
    let content=val('ndTpl',m)?(TEMPLATES[type]||'# {title}').replace('{title}',title):`# ${title}\n`;if(type==='RTM')content=rtmMarkdown(title);
    S.docs.unshift({id,type,title,version:'0.1',status:'Draft',owner:val('ndO',m),content,created:nowISO(),updated:nowISO(),effective:null,reviewDue:null,history:[{at:nowISO(),by:S.currentUser,text:'Created v0.1 draft'}],signatures:[]});
    audit('Document created',id,title);save();closeModal();UI.tabs.doc='edit';location.hash='#/doc/'+id}};
function docHead(d){return `<div class="dochead"><div><span>Document ID</span><b class="mono">${d.id}</b></div><div><span>Version</span><b>${esc(d.version)}</b></div><div><span>Status</span><b>${esc(d.status)}</b></div><div><span>${d.effective?'Effective':'Owner'}</span><b>${d.effective?fmtD(d.effective):esc(userName(d.owner))}</b></div></div>`}
function docHTML(d){return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.id)} ${esc(d.title)}</title><style>body{font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:820px;margin:30px auto;padding:0 20px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f3f4f8}.dochead{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #ccc;margin-bottom:16px}.dochead div{padding:6px 8px;border-right:1px solid #ccc}.dochead span{display:block;font-size:11px;color:#666;text-transform:uppercase}.sig{border:1px dashed #0a7;padding:8px;margin:6px 0;font-size:13px;display:flex;gap:8px}.hashv{font-family:monospace;font-size:11px;color:#666}.muted{color:#666}pre{background:#f5f5f8;padding:8px;overflow:auto}a{color:inherit;text-decoration:none}</style></head><body>${docHead(d)}${md(d.content)}<h2>Signature manifest</h2>${(d.signatures||[]).map(sigBlock).join('')||'<p>No signatures.</p>'}<p class="muted" style="font-size:11px;margin-top:30px">Exported from GxP Studio v${APP_VERSION} · ${fmtUTC(nowISO())} · record sha256 ${recordHash(d)}</p></body></html>`}
function vDoc(p){const d=S.docs.find(x=>x.id===p.id);if(!d)return {title:'Not found',html:'<div class="empty">Document not found.</div>'};
  const owner=d.owner===S.currentUser;const reviewed=sigsAt(d,'Reviewed').length>0;
  let acts='';
  if(d.status==='Draft')acts+=`<button class="btn pri" data-act="docSubmit">Submit for review</button>`;
  if(d.status==='In Review'){acts+=`<button class="btn" data-act="docReview">✍ Review &amp; sign</button><button class="btn pri" data-act="docApprove">✍ QA approve</button><button class="btn" data-act="docReturn">Return to draft</button>`}
  if(d.status==='Approved')acts+=`<button class="btn pri" data-act="docEffective">Make effective</button>`;
  if(d.status==='Effective')acts+=trainBtn(d)+`<button class="btn" data-act="docRevise">Revise (new version)</button><button class="btn" data-act="docPeriodic">✍ Periodic review</button><button class="btn bad" data-act="docRetire">Retire</button>`;
  if(d.status==='Draft'&&/^0\./.test(d.version))acts+=`<button class="btn bad" data-act="docDelete">Delete draft</button>`;
  const [tab,tb]=tabsBar('doc',[['view','Document'],...(d.status==='Draft'?[['edit','Edit']]:[]),['sig',`Signatures (${(d.signatures||[]).length})`],['hist','History']],'view');
  let body='';
  if(tab==='edit'&&d.status==='Draft')body=`<div class="card"><div class="fields"><label class="f">Title<input class="inp" id="deT" value="${esc(d.title)}"></label><label class="f">Owner<select class="inp" id="deO">${userOpts(d.owner)}</select></label></div>
    <label class="f" style="margin-top:12px">Content (Markdown: # headings, - lists, | tables |, **bold**, \`code\`; IDs like REQ-0001 auto-link)<textarea class="inp code" id="deC" style="min-height:420px;white-space:pre-wrap">${esc(d.content)}</textarea></label>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-act="tab" data-k="doc" data-v="view">Preview</button><button class="btn pri" data-act="docSave">Save draft</button></div></div>`;
  else if(tab==='sig')body=`<div class="card">${sigsHTML(d)}</div>`;
  else if(tab==='hist')body=`<div class="card">${histHTML(d.history)}</div>`;
  else body=`<div class="docpaper">${docHead(d)}${md(d.content)}${(d.signatures||[]).length?`<h2>Signature manifest</h2>${d.signatures.map(sigBlock).join('')}`:''}</div>`;
  return {title:d.id,back:'#/docs',html:`<div class="doc" style="max-width:none">
    <div class="ph"><div class="t"><div class="row"><span class="mono muted">${d.id}</span>${pill(d.status)}<span class="pill brand">${esc(DOC_TYPES[d.type]||d.type)}</span><span class="pill">v${esc(d.version)}</span></div><h1 style="margin-top:6px">${esc(d.title)}</h1>
    <p>Owner ${esc(userName(d.owner))} · updated ${ago(d.updated)}${d.reviewDue?` · periodic review due ${fmtD(d.reviewDue)}`:''}${reviewed&&d.status==='In Review'?' · <b style="color:var(--ok)">reviewed</b>':''}</p>${stepper(DOC_FLOW,d.status==='Retired'||d.status==='Superseded'?'Effective':d.status)}</div></div>
    <div class="row noprint" style="margin-bottom:12px">${acts}<span style="flex:1"></span>${blobLink(docHTML(d),`${d.id}_v${d.version}.html`,'text/html','⬇ Export')}<button class="btn" onclick="window.print()">Print / PDF</button></div>
    ${tb}${body}</div>`}}
const curDoc=()=>S.docs.find(x=>x.id===parseHash().id);
ACT.docSave=()=>{const d=curDoc();const c=val('deC'),t=val('deT').trim(),o=val('deO');if(c===d.content&&t===d.title&&o===d.owner){toast('No changes');return}
  const [M,m]=d.version.split('.').map(Number);d.version=`${M}.${(m||0)+1}`;d.content=c;d.title=t||d.title;d.owner=o;d.updated=nowISO();hist(d,'Edited → v'+d.version);audit('Document modified',d.id,'v'+d.version);save();UI.tabs.doc='view';render();toast('Saved v'+d.version)};
ACT.docSubmit=()=>{const d=curDoc();d.status='In Review';d.updated=nowISO();hist(d,'Submitted for review (v'+d.version+')');audit('Submitted for review',d.id,'v'+d.version);save();render();toast('Submitted for review')};
ACT.docReview=()=>{const d=curDoc();if(!guard(d.owner!==S.currentUser,'Segregation of duties: the owner cannot review their own document. Switch user (top right).'))return;
  esign({record:d,meanings:['Reviewed'],title:'Review signature',onSign:()=>hist(d,'Reviewed by '+me().name)})};
ACT.docApprove=()=>{const d=curDoc();if(!guard(isQA(),'Only users with the QA role can approve. Switch to Morgan Lee (QA Approver).'))return;if(!guard(d.owner!==S.currentUser,'Segregation of duties: owner cannot approve own document.'))return;
  if(!guard(sigsAt(d,'Reviewed').length>0,'A review signature is required before QA approval.'))return;
  esign({record:d,meanings:['Approved'],title:'QA approval signature',onSign:()=>{d.status='Approved';d.updated=nowISO();hist(d,'Approved');audit('Status → Approved',d.id,'v'+d.version)}})};
ACT.docReturn=()=>{const d=curDoc();const m=modal('Return to draft',`<label class="f">Reason (recorded in audit trail)<textarea class="inp" id="rr"></textarea></label>`,`<button class="btn" data-x>Cancel</button><button class="btn pri" id="rrGo">Return</button>`);$('#rrGo',m).onclick=()=>{const r=val('rr',m).trim();if(!r){toast('Reason required');return}d.status='Draft';hist(d,'Returned to draft: '+r);audit('Returned to draft',d.id,r);save();closeModal();render()}};
ACT.docEffective=()=>{const d=curDoc();if(!guard(isQA(),'Only QA can make a document effective.'))return;const [M,m]=d.version.split('.').map(Number);if(m)d.version=`${M+1}.0`;
  d.status='Effective';d.effective=nowISO();d.reviewDue=new Date(Date.now()+730*DAY).toISOString();d.updated=nowISO();
  S.docs.filter(x=>x!==d&&x.supersededBy===d.id).forEach(x=>x.status='Superseded');hist(d,'Effective v'+d.version);audit('Made effective',d.id,'v'+d.version);save();render();toast('Effective v'+d.version)};
ACT.docRevise=()=>{const d=curDoc();d.history.push({at:nowISO(),by:S.currentUser,text:'Revision started from v'+d.version,snapshot:d.content});const [M]=d.version.split('.').map(Number);d.version=`${M}.1`;d.status='Draft';d.effective=null;d.updated=nowISO();audit('Revision started',d.id,'v'+d.version);save();UI.tabs.doc='edit';render()};
ACT.docPeriodic=()=>{const d=curDoc();esign({record:d,meanings:['Periodic review — no change required','Periodic review — revision required'],title:'Periodic review',onSign:s=>{if(/no change/.test(s.meaning))d.reviewDue=new Date(Date.now()+730*DAY).toISOString();hist(d,s.meaning);audit('Periodic review',d.id,s.meaning)}})};
ACT.docRetire=b=>{const d=curDoc();if(!guard(isQA(),'Only QA can retire documents.'))return;armed(b,()=>{d.status='Retired';hist(d,'Retired');audit('Document retired',d.id,'v'+d.version);save();render()})};
ACT.docDelete=b=>armed(b,()=>{const d=curDoc();S.docs=S.docs.filter(x=>x!==d);audit('Draft deleted',d.id,d.title);save();location.hash='#/docs'});

/* ---------- traceability ---------- */
function rtmMarkdown(title){return `# ${title||'Requirements Traceability Matrix'}\n\nGenerated ${fmtUTC(nowISO())} from live data. Coverage: ${S.reqs.filter(r=>reqState(r).k==='pass').length}/${S.reqs.length} requirements verified.\n\n| Requirement | Description | GxP | Risk (RPN) | Test cases | Latest result | Status |\n|---|---|---|---|---|---|---|\n`+
  S.reqs.map(r=>{const s=reqState(r);return `| ${r.id} | ${r.text} | ${r.gxp} | ${riskClass(rpn(r))} (${rpn(r)}) | ${s.tcs.map(t=>t.id).join(', ')||'—'} | ${s.tcs.map(t=>{const l=latestResult(t.id);return l?`${l.status} (${l.run.id})`:'Not run'}).join(', ')||'—'} | ${s.label} |`}).join('\n')+`\n\n## Open defects\n`+(S.defects.filter(openBug).map(d=>`- ${d.id} ${d.title} (${d.severity})`).join('\n')||'- None')}
function vTrace(p){const hl=p.q.get('req');
  const rows=S.reqs.map(r=>({r,s:reqState(r)})).filter(x=>UI.traceF==='All'||x.s.label===UI.traceF);
  const c=k=>S.reqs.filter(r=>reqState(r).k===k).length;
  return {title:'Traceability',fab:'reqNew',html:`<div class="ph"><div class="t"><h1>Requirements traceability</h1><p>URS → risk → test cases → evidence → defects. Click a requirement to edit it and its risk.</p></div><div class="row"><button class="btn" data-act="genRTM">▤ Generate RTM document</button><button class="btn pri hide-m" data-act="reqNew">+ Requirement</button></div></div>
  <div class="grid g4"><div class="card kpi"><div class="l">Verified</div><div class="v" style="color:var(--ok)">${c('pass')}</div></div><div class="card kpi"><div class="l">Failing</div><div class="v" style="color:var(--bad)">${c('fail')}</div></div><div class="card kpi"><div class="l">Not executed</div><div class="v" style="color:var(--warn)">${c('notrun')}</div></div><div class="card kpi"><div class="l">Not covered</div><div class="v">${c('none')}</div></div></div>
  <div class="toolbar" style="margin-top:14px">${seg('traceF',['All','Verified','Failing','Not executed','Not covered'])}</div>
  <div class="tblwrap"><table class="t matrix"><thead><tr><th>Req</th><th style="min-width:240px">Requirement</th><th>GxP</th><th>Risk</th><th>Tests &amp; latest result</th><th>Defects</th><th>Status</th></tr></thead><tbody>
  ${rows.map(({r,s})=>{const bugs=S.defects.filter(d=>openBug(d)&&s.tcs.some(t=>t.id===d.tc));return `<tr style="${hl===r.id?'background:var(--brandSoft)':''}"><td><a href="#" class="mono" data-act="reqEdit" data-id="${r.id}">${r.id}</a></td><td>${esc(r.text)}<div class="small muted">${esc(r.category)}</div></td><td>${pill(r.gxp)}</td><td>${pill(riskClass(rpn(r))+' · '+rpn(r),statusTone(riskClass(rpn(r))))}</td>
    <td>${s.tcs.map(t=>{const l=latestResult(t.id);return `<div class="row" style="gap:6px;flex-wrap:nowrap">${resIcon(l&&l.status)}<a href="#/test/${t.id}" class="mono">${t.id}</a>${l?`<a href="#/run/${l.run.id}" class="small muted mono">${l.run.id}</a>`:''}</div>`}).join('')||'<span class="muted">—</span>'}</td>
    <td>${bugs.map(b=>link(b.id)).join('<br>')||'<span class="muted">—</span>'}</td><td>${pill(s.label,s.tone)}</td></tr>`}).join('')}</tbody></table></div>`}}
function reqModal(r){const isNew=!r;r=r||{text:'',category:'',gxp:'High',risk:{s:2,p:2,d:2},source:''};const sc=n=>[1,2,3].map(v=>`<option ${v===n?'selected':''}>${v}</option>`).join('');
  const m=modal(isNew?'New requirement':`Edit ${r.id}`,`<label class="f">Requirement<textarea class="inp" id="rqT">${esc(r.text)}</textarea></label>
  <div class="fields"><label class="f">Category<input class="inp" id="rqC" value="${esc(r.category)}" placeholder="e.g. Part 11"></label><label class="f">GxP impact<select class="inp" id="rqG">${opts(['High','Medium','Low'],r.gxp)}</select></label><label class="f">Source document<select class="inp" id="rqD"><option value="">—</option>${S.docs.map(d=>`<option value="${d.id}" ${d.id===r.source?'selected':''}>${d.id} ${esc(d.title)}</option>`).join('')}</select></label></div>
  <div class="small b">FMEA risk (1 low – 3 high)</div><div class="fields"><label class="f">Severity<select class="inp" id="rqS">${sc(r.risk.s)}</select></label><label class="f">Probability<select class="inp" id="rqP">${sc(r.risk.p)}</select></label><label class="f">Detectability<select class="inp" id="rqDe">${sc(r.risk.d)}</select></label></div>
  <div class="small muted">RPN = S × P × D. ≥12 High, 6–11 Medium, ≤5 Low (SOP-QA-012 §4).</div>`,`<button class="btn" data-x>Cancel</button><button class="btn pri" id="rqGo">Save</button>`);
  $('#rqGo',m).onclick=()=>{const text=val('rqT',m).trim();if(!text){toast('Requirement text required');return}
    const o=isNew?{id:nextId('REQ'),created:nowISO()}:r;Object.assign(o,{text,category:val('rqC',m).trim(),gxp:val('rqG',m),source:val('rqD',m),risk:{s:+val('rqS',m),p:+val('rqP',m),d:+val('rqDe',m)}});
    if(isNew)S.reqs.push(o);audit(isNew?'Requirement created':'Requirement modified',o.id,`${o.gxp} · RPN ${rpn(o)}`);save();closeModal();render()}}
ACT.reqNew=()=>reqModal(null);
ACT.reqEdit=b=>reqModal(S.reqs.find(r=>r.id===b.dataset.id));
ACT.genRTM=()=>{const id=nextId('DOC');const title='LabTrack LIMS Requirements Traceability Matrix';S.docs.unshift({id,type:'RTM',title,version:'0.1',status:'Draft',owner:S.currentUser,content:rtmMarkdown(title),created:nowISO(),updated:nowISO(),history:[{at:nowISO(),by:S.currentUser,text:'Generated from live traceability data'}],signatures:[]});audit('Document generated',id,'RTM');save();UI.tabs.doc='view';location.hash='#/doc/'+id;toast('RTM generated as '+id)};

/* ---------- code baselines ---------- */
function codeTargets(){return [...S.code.map(c=>({id:c.id,label:`${c.id} · ${c.label} (${c.status})`,code:c.code,lang:c.lang})),...S.changes.filter(c=>c.targetCode&&openCR(c)).map(c=>({id:c.id,label:`${c.id} candidate · ${c.toLabel||'target'} (${c.status})`,code:c.targetCode,lang:c.lang}))]}
function vCode(p){
  if(p.id){const c=S.code.find(x=>x.id===p.id);if(!c)return {title:'Not found',html:'<div class="empty">Not found</div>'};
    const others=codeTargets().filter(x=>x.id!==c.id);const cmp=UI.codeCmp&&others.find(x=>x.id===UI.codeCmp)||others[0];const df=cmp?diffHTML(c.code,cmp.code):null;const okHash=sha256(c.code)===c.hash;
    return {title:c.id,back:'#/code',html:`<div class="ph"><div class="t"><div class="row"><span class="mono muted">${c.id}</span>${pill(c.status)}<span class="pill">${esc(c.lang)}</span></div><h1 style="margin-top:6px">${esc(c.title)}</h1><p>Registered ${fmtD(c.created)} by ${esc(userName(c.by))}${c.cr?` via ${link(c.cr)}`:''}</p></div>${blobLink(c.code,`${c.label}.js`,'text/javascript','⬇ Download')}</div>
    <div class="card"><div class="row"><b>SHA-256</b><span class="hashv" style="flex:1">${c.hash}</span>${okHash?pill('Integrity verified','ok'):pill('HASH MISMATCH','bad')}</div></div>
    <div class="card"><h2>Source</h2><pre class="codebox">${esc(c.code)}</pre></div>
    ${cmp?`<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0;flex:1">Compare</h2><select class="inp" style="width:auto" data-chg="codeCmp">${others.map(o=>`<option value="${o.id}" ${o.id===cmp.id?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div><div class="small muted" style="margin-bottom:8px"><span style="color:var(--ok)">+${df.add}</span> / <span style="color:var(--bad)">−${df.del}</span> lines</div>${df.html}</div>`:''}`}}
  return {title:'Code Baselines',html:`<div class="ph"><div class="t"><h1>Code baselines</h1><p>Validated, hash-sealed versions of the system under test. New baselines are promoted only by closing a change control.</p></div></div>
  <div class="card p0 list">${S.code.slice().reverse().map(c=>`<a class="item" href="#/code/${c.id}"><span class="id">${c.id}</span><div class="main1"><div class="ttl">${esc(c.title)}</div><div class="meta"><span>${esc(c.label)}</span><span class="mono">${short(c.hash)}</span><span>${fmtD(c.created)}</span></div></div>${pill(c.status)}</a>`).join('')}</div>
  <h2 style="margin:18px 0 10px">Candidates in change control</h2><div class="card p0 list">${S.changes.filter(c=>c.targetCode&&openCR(c)).map(c=>`<a class="item" href="#/change/${c.id}"><span class="id">${c.id}</span><div class="main1"><div class="ttl">${esc(c.toLabel||c.title)}</div><div class="meta"><span>${esc(c.title)}</span><span class="mono">${short(sha256(c.targetCode))}</span></div></div>${pill(c.status)}</a>`).join('')||'<div class="empty">No candidates.</div>'}</div>`}}
CHG.codeCmp=e=>{UI.codeCmp=e.value;render()};

/* ---------- audit trail ---------- */
function auditCSV(){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return 'seq,timestamp_utc,user,action,record,detail,prev_hash,hash\n'+S.audit.map(e=>[e.seq,e.at,userName(e.user),e.action,e.entity,e.detail,e.prev,e.hash].map(q).join(',')).join('\n')}
function vAudit(){const q=UI.auditQ.toLowerCase();const list=S.audit.filter(e=>(!UI.auditU||e.user===UI.auditU)&&(!q||(e.action+' '+e.entity+' '+e.detail).toLowerCase().includes(q))).slice().reverse();const v=UI.verify;
  return {title:'Audit Trail',html:`<div class="ph"><div class="t"><h1>Audit trail</h1><p>Secure, computer-generated, time-stamped and append-only (21 CFR 11.10(e)). Each entry is SHA-256 chained to the previous entry.</p></div><div class="row"><button class="btn pri" data-act="auditVerify">⛨ Verify chain</button>${blobLink(auditCSV(),'audit_trail.csv','text/csv','⬇ CSV')}</div></div>
  ${v?`<div class="card" style="border-color:${v.ok?'var(--ok)':'var(--bad)'}"><b style="color:${v.ok?'var(--ok)':'var(--bad)'}">${v.ok?`✓ Chain intact — ${v.n} entries verified`:`✕ Chain broken at entry #${v.at}`}</b><div class="hashv">${v.ok?'Head hash '+v.head:''} · checked ${fmtUTC(v.when)}</div></div>`:''}
  <div class="toolbar" style="margin-top:12px"><input class="search" data-inp="auditQ" placeholder="Search action, record, detail…" value="${esc(UI.auditQ)}"><select class="inp" style="width:auto" data-chg="auditU"><option value="">All users</option>${S.users.map(u=>`<option value="${u.id}" ${UI.auditU===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
  <div class="tblwrap"><table class="t"><thead><tr><th>#</th><th>Timestamp (UTC)</th><th>User</th><th>Action</th><th>Record</th><th class="hide-m">Detail</th><th class="hide-m">Hash</th></tr></thead><tbody>
  ${list.slice(0,300).map(e=>`<tr><td class="mono">${e.seq}</td><td class="mono" style="white-space:nowrap">${fmtUTC(e.at).replace(' UTC','')}</td><td style="white-space:nowrap">${esc(userName(e.user))}</td><td>${esc(e.action)}<div class="small muted" style="display:none"></div></td><td>${e.entity==='SYSTEM'?'<span class="muted">system</span>':link(e.entity)}</td><td class="hide-m small">${esc(e.detail)}</td><td class="hide-m hashv">${short(e.hash)}</td></tr>`).join('')}</tbody></table></div>
  ${list.length>300?`<div class="small muted" style="margin-top:8px">Showing latest 300 of ${list.length}. Export CSV for the full trail.</div>`:''}`}}
CHG.auditU=e=>{UI.auditU=e.value;render()};
ACT.auditVerify=()=>{UI.verify=Object.assign(verifyAudit(),{when:nowISO()});audit('Audit trail verified',UI.verify.ok?'SYSTEM':'SYSTEM',UI.verify.ok?'Chain intact':'Chain broken at #'+UI.verify.at);UI.verify.n=S.audit.length;save();render()};

/* ---------- settings / more ---------- */
function vSettings(){const size=new Blob([JSON.stringify(S)]).size;
  return {title:'Settings',html:`<div class="ph"><div class="t"><h1>Settings</h1><p>Workspace, users and data. All data stays on this device (localStorage) — works fully offline.</p></div></div>
  <div class="grid g2"><div class="card"><h2>Users &amp; roles</h2><div class="small muted" style="margin-bottom:8px">Switch the active user from the header to exercise segregation of duties. Demo PIN for e-signatures: <b>1234</b>.</div>
    ${S.users.map(u=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">${avatar(u.id)}<div style="flex:1"><b>${esc(u.name)}</b><div class="small muted">${esc(u.role)} · roles: ${u.roles.join(', ')}</div></div>${u.id===S.currentUser?pill('Active','ok'):`<button class="btn sm" data-act="switchUser" data-id="${u.id}">Sign in</button>`}</div>`).join('')}</div>
  <div class="card"><h2>Appearance</h2><div class="seg">${['auto','light','dark'].map(t=>`<button class="${S.theme===t?'on':''}" data-act="theme" data-v="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
    <h2 style="margin-top:18px">System</h2><dl class="kv"><dt>Organisation</dt><dd>${esc(S.system.org)}</dd><dt>System</dt><dd>${esc(S.system.name)}</dd><dt>GAMP</dt><dd>${esc(S.system.gamp)}</dd><dt>App version</dt><dd>GxP Studio v${APP_VERSION}</dd><dt>Storage used</dt><dd>${(size/1024).toFixed(1)} KB</dd><dt>Network</dt><dd>${navigator.onLine?'Online':'Offline'} · offline-ready</dd></dl></div>
  <div class="card"><h2>Data</h2><div class="small muted" style="margin-bottom:10px">Export the complete workspace (records, evidence, signatures, audit trail) as JSON for archiving or moving to another device.</div>
    <div class="row">${blobLink(JSON.stringify(S,null,1),`gxp-studio-${new Date().toISOString().slice(0,10)}.json`,'application/json','⬇ Export JSON')}<label class="btn">⬆ Import JSON<input type="file" accept=".json,application/json" data-chg="importJSON" style="display:none"></label></div>
    <div class="row" style="margin-top:12px"><button class="btn bad" data-act="resetDemo">Reset demo data</button><button class="btn bad" data-act="blankWS">Start blank workspace</button></div></div>
  <div class="card"><h2>Install on iPhone / Android</h2><div class="small">iPhone: open this page in <b>Safari</b> → Share → <b>Add to Home Screen</b>. Android: Chrome menu → <b>Install app</b>. Once installed it runs offline.</div></div></div>`}}
ACT.theme=b=>{S.theme=b.dataset.v;save();applyTheme();render()};
ACT.switchUser=b=>{S.currentUser=b.dataset.id;audit('User signed in','SYSTEM',me().name+' ('+me().role+')');save();render();toast('Signed in as '+me().name)};
CHG.user=e=>{S.currentUser=e.value;audit('User signed in','SYSTEM',me().name+' ('+me().role+')');save();render();toast('Signed in as '+me().name)};
ACT.resetDemo=b=>armed(b,()=>{seed();UI.tcSel.clear();location.hash='#/dashboard';render();toast('Demo data restored')});
ACT.blankWS=b=>armed(b,()=>{const users=S.users,theme=S.theme;S={v:1,app:APP_VERSION,created:nowISO(),seq:{},currentUser:users[0].id,theme,users,system:{name:'My GxP System',org:'My Organisation',gamp:'Category 5 — custom code',site:''},docs:[],deviations:[],training:[],reqs:[],tests:[],runs:[],changes:[],defects:[],code:[],audit:[]};audit('Workspace initialised','SYSTEM','Blank workspace');save();location.hash='#/dashboard';render()});
CHG.importJSON=e=>{const f=e.files[0];if(!f)return;f.text().then(t=>{try{const j=JSON.parse(t);if(!j.audit||!j.docs)throw 0;S=j;upgradeWorkspace();audit('Workspace imported','SYSTEM',f.name);save();render();toast('Imported '+f.name)}catch(x){toast('Not a GxP Studio export')}})};
function vMore(){return {title:'More',html:`<h1 style="margin-bottom:14px">More</h1><div class="card p0 list">${NAV.slice(5).map(([r,i,l])=>`<a class="item" href="#/${r}"><span style="width:26px;text-align:center;font-size:17px">${i}</span><div class="main1"><div class="ttl">${l}</div></div><span class="muted">›</span></a>`).join('')}</div>
  <div class="card" style="margin-top:14px"><div class="small muted">GxP Studio v${APP_VERSION} · ${esc(S.system.org)}</div></div>`}}
