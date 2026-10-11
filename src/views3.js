/* ---------- training records ---------- */
const TRAIN_TYPES=['SOP','Policy'],TRAIN_GRACE=30;
const trainDocs=()=>S.docs.filter(d=>d.status==='Effective'&&TRAIN_TYPES.includes(d.type));
function trainState(uid,d){const rec=(S.training||[]).filter(x=>x.user===uid&&x.doc===d.id).sort(byAt).at(-1);
  if(rec&&rec.version===d.version)return {k:'Current',rec};
  const days=Math.floor((Date.now()-new Date(d.effective||d.updated))/DAY);return {k:days>TRAIN_GRACE?'Overdue':'Due',rec,days}}
const trainingGaps=uid=>trainDocs().map(d=>[d,trainState(uid,d)]).filter(([,s])=>s.k!=='Current');
function trainingWarn(uid){const g=trainingGaps(uid);return g.length?`<div class="small" style="background:var(--warnSoft);color:var(--warn);padding:8px 10px;border-radius:10px;margin:8px 0">⚠ Training not current for ${esc(userName(uid))}: ${g.map(([d,s])=>`${d.id} v${esc(d.version)} (${s.k})`).join(', ')}</div>`:''}
const trainBtn=d=>TRAIN_TYPES.includes(d.type)&&d.status==='Effective'&&trainState(S.currentUser,d).k!=='Current'?`<button class="btn pri" data-act="trainSign" data-doc="${d.id}">✍ Read &amp; understood</button>`:'';
ACT.trainSign=b=>{const d=S.docs.find(x=>x.id===(b.dataset.doc||parseHash().id));if(!d)return;
  esign({record:d,meanings:['Read and understood'],title:`Training — ${d.id} v${d.version}`,requireReason:false,attach:false,
    onSign:s=>{S.training.push({id:nextId('TRN'),doc:d.id,version:d.version,user:s.by,at:s.at,sig:s});audit('Training completed',d.id,`${userName(s.by)} — v${d.version}`);toast('Training recorded')}})};
function vTraining(){const docs=trainDocs();let cur=0,tot=0,over=0;
  const cell=(u,d)=>{const s=trainState(u.id,d);tot++;if(s.k==='Current')cur++;if(s.k==='Overdue')over++;
    return `<td>${s.k==='Current'?`<span class="pill ok" title="Signed ${fmtUTC(s.rec.at)}">✓ v${esc(s.rec.version)}</span>`:pill(s.k)+(s.rec?`<div class="small muted">had v${esc(s.rec.version)}</div>`:'')}</td>`};
  const rows=S.users.map(u=>`<tr><td><b>${esc(u.name)}</b><div class="small muted">${esc(u.role)}</div></td>${docs.map(d=>cell(u,d)).join('')}</tr>`).join('');
  const pct=tot?Math.round(cur/tot*100):100;const mine=trainingGaps(S.currentUser);
  const recent=(S.training||[]).slice().sort(byAt).reverse().slice(0,10);
  return {title:'Training',html:`<div class="ph"><div class="t"><h1>Training records</h1><p>Read-and-understood e-signatures against effective SOPs and policies (21 CFR 11.10(i), EU GMP Ch. 2). A new effective version resets training to Due; Overdue after ${TRAIN_GRACE} days.</p></div></div>
  <div class="grid g3"><div class="card kpi"><div class="l">Training compliance</div><div class="v" style="color:${pct===100?'var(--ok)':'inherit'}">${pct}%</div><div class="s">${cur} of ${tot} assignments current</div><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div class="card kpi"><div class="l">Overdue</div><div class="v" style="color:${over?'var(--bad)':'inherit'}">${over}</div><div class="s">past the ${TRAIN_GRACE}-day window</div></div>
    <div class="card kpi"><div class="l">My open training</div><div class="v">${mine.length}</div><div class="s">${esc(me().name)}</div></div></div>
  <div class="card p0 list" style="margin-top:14px"><div style="padding:14px 16px 6px"><h2 style="margin:0">My training — ${esc(me().name)}</h2></div>${mine.map(([d,s])=>`<div class="item"><span class="id">${d.id}</span><div class="main1"><div class="ttl">${esc(d.title)}</div><div class="meta"><span>v${esc(d.version)}</span><span>effective ${fmtD(d.effective)}</span></div></div>${pill(s.k)}<a class="btn sm" href="#/doc/${d.id}">Read</a>${trainBtn(d).replace('btn pri','btn pri sm')}</div>`).join('')||'<div class="empty">✓ All training current.</div>'}</div>
  <div class="card p0" style="margin-top:14px"><div style="padding:14px 16px 6px"><h2 style="margin:0">Training matrix</h2></div><div class="tblwrap"><table class="t"><thead><tr><th>User</th>${docs.map(d=>`<th><a href="#/doc/${d.id}" class="mono">${d.id}</a> v${esc(d.version)}<div class="small muted" style="font-weight:500;text-transform:none;letter-spacing:0">${esc(d.title)}</div></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="card" style="margin-top:14px"><h2>Recent training signatures</h2>${recent.map(r=>sigBlock(r.sig)+`<div class="small muted" style="margin:-2px 0 6px 4px">${link(r.doc)} v${esc(r.version)} · ${r.id}</div>`).join('')||'<div class="muted small">None yet.</div>'}</div>`}}

/* ---------- deviations ---------- */
const DEV_FLOW=['Open','Investigation','QA Review','Closed'],DEV_CLASS=['Critical','Major','Minor'];
const DEV_AREAS=['Computerized system','Data integrity','Laboratory','Manufacturing','Documentation','Training','Supplier'];
const openDev=v=>v.status!=='Closed';
const devDue=v=>new Date(new Date(v.detected).getTime()+30*DAY).toISOString();
const devOverdue=v=>openDev(v)&&daysUntil(devDue(v))<0;
function vDeviations(){const q=UI.devQ.toLowerCase();const list=S.deviations.filter(v=>(UI.devF==='All'||(UI.devF==='Open'?openDev(v):!openDev(v)))&&(!q||(v.id+' '+v.title).toLowerCase().includes(q)));
  return {title:'Deviations',fab:'devNew',html:`<div class="ph"><div class="t"><h1>Deviations</h1><p>Unplanned events against procedures or validated state: containment, impact assessment, root cause, CAPA and QA closure within 30 days.</p></div><button class="btn pri hide-m" data-act="devNew">+ Report deviation</button></div>
  <div class="toolbar"><input class="search" data-inp="devQ" placeholder="Search deviations…" value="${esc(UI.devQ)}">${seg('devF',['Open','Closed','All'])}</div>
  <div class="card p0 list">${list.map(v=>`<a class="item" href="#/dev/${v.id}"><span class="id">${v.id}</span><div class="main1"><div class="ttl">${esc(v.title)}</div><div class="meta"><span>${esc(v.area)}</span><span>${esc(userName(v.owner))}</span>${openDev(v)?`<span style="${devOverdue(v)?'color:var(--bad);font-weight:600':''}">due ${fmtD(devDue(v))}</span>`:''}<span>${ago(v.detected)}</span></div></div>${pill(v.classification)}${pill(v.status)}</a>`).join('')||'<div class="empty">No deviations.</div>'}</div>`}}
ACT.devNew=()=>{const m=modal('Report deviation',`<label class="f">Title<input class="inp" id="dvT"></label>
  <div class="fields"><label class="f">Classification<select class="inp" id="dvC">${opts(DEV_CLASS,'Major')}</select></label><label class="f">Area<select class="inp" id="dvA">${opts(DEV_AREAS)}</select></label><label class="f">Owner<select class="inp" id="dvO">${userOpts('u1')}</select></label></div>
  <div class="fields"><label class="f">Occurred<input class="inp" id="dvW" type="date" value="${nowISO().slice(0,10)}"></label><label class="f">Change control<select class="inp" id="dvR"><option value="">—</option>${S.changes.map(c=>`<option value="${c.id}">${c.id} ${esc(c.title)}</option>`).join('')}</select></label></div>
  <label class="f">What happened<textarea class="inp" id="dvD"></textarea></label><label class="f">Immediate action / containment<textarea class="inp" id="dvI" placeholder="e.g. Batch placed on QA hold"></textarea></label>`,`<button class="btn" data-x>Cancel</button><button class="btn pri" id="dvGo">Report</button>`);
  $('#dvGo',m).onclick=()=>{const title=val('dvT',m).trim();if(!title){toast('Title required');return}const id=nextId('DEV');
    S.deviations.unshift({id,title,classification:val('dvC',m),area:val('dvA',m),status:'Open',reporter:S.currentUser,owner:val('dvO',m),occurred:new Date(val('dvW',m)||Date.now()).toISOString(),detected:nowISO(),cr:val('dvR',m)||null,
      description:val('dvD',m),immediate:val('dvI',m),impact:'',rcCategory:'',rootCause:'',capa:'',bugs:[],history:[{at:nowISO(),by:S.currentUser,text:'Reported'}],signatures:[]});
    audit('Deviation reported',id,title);save();closeModal();location.hash='#/dev/'+id}};
const curDev=()=>S.deviations.find(x=>x.id===parseHash().id);
function readDev(v){if(!$('#vT'))return false;const b=JSON.stringify(v);Object.assign(v,{title:val('vT').trim()||v.title,classification:val('vC'),area:val('vA'),owner:val('vO'),description:val('vD'),immediate:val('vI'),impact:val('vM'),rcCategory:val('vK'),rootCause:val('vRC'),capa:val('vP'),cr:val('vR')||null});return JSON.stringify(v)!==b}
function vDeviation(p){const v=S.deviations.find(x=>x.id===p.id);if(!v)return {title:'Not found',html:'<div class="empty">Deviation not found.</div>'};
  const lock=v.status==='Closed',ro=lock?'disabled':'';const next=DEV_FLOW[DEV_FLOW.indexOf(v.status)+1];const due=devDue(v),n=daysUntil(due);
  const bugs=v.bugs.map(id=>S.defects.find(d=>d.id===id)).filter(Boolean);
  return {title:v.id,back:'#/deviations',html:`<div class="ph"><div class="t"><div class="row"><span class="mono muted">${v.id}</span>${pill(v.status)}${pill(v.classification)}${openDev(v)?pill(n<0?`Overdue ${-n}d`:`Due in ${n}d`,n<0?'bad':n<=7?'warn':''):''}</div><h1 style="margin-top:6px">${esc(v.title)}</h1><p>Reported by ${esc(userName(v.reporter))} · occurred ${fmtD(v.occurred)} · detected ${fmtD(v.detected)}</p>${stepper(DEV_FLOW,v.status)}</div></div>
  <div class="row" style="margin-bottom:12px">${next?`<button class="btn pri" data-act="devAdv">${next!=='Investigation'?'✍ ':''}Move to ${esc(next)}</button>`:''}${!lock?'<button class="btn" data-act="devSave">Save changes</button><button class="btn" data-act="devBug">+ Raise linked defect / CAPA</button>':''}</div>
  <div class="grid g2"><div class="card"><h2>Event</h2><label class="f">Title<input class="inp" id="vT" value="${esc(v.title)}" ${ro}></label>
    <div class="fields" style="margin-top:10px"><label class="f">Classification<select class="inp" id="vC" ${ro}>${opts(DEV_CLASS,v.classification)}</select></label><label class="f">Area<select class="inp" id="vA" ${ro}>${opts(DEV_AREAS,v.area)}</select></label><label class="f">Owner<select class="inp" id="vO" ${ro}>${userOpts(v.owner)}</select></label></div>
    <label class="f" style="margin-top:10px">What happened<textarea class="inp" id="vD" ${ro}>${esc(v.description)}</textarea></label>
    <label class="f" style="margin-top:10px">Immediate action / containment<textarea class="inp" id="vI" ${ro}>${esc(v.immediate)}</textarea></label>
    <label class="f" style="margin-top:10px">Change control<select class="inp" id="vR" ${ro}><option value="">—</option>${S.changes.map(c=>`<option value="${c.id}" ${c.id===v.cr?'selected':''}>${c.id}</option>`).join('')}</select></label></div>
  <div><div class="card"><h2>Investigation</h2><label class="f">Impact assessment (product, patient, data)<textarea class="inp" id="vM" ${ro}>${esc(v.impact)}</textarea></label>
    <label class="f" style="margin-top:10px">Root cause category<select class="inp" id="vK" ${ro}><option value="">— select —</option>${opts(RC_CATS,v.rcCategory)}</select></label>
    <label class="f" style="margin-top:10px">Root cause<textarea class="inp" id="vRC" ${ro} placeholder="Why 1… Why 2… Why 3…">${esc(v.rootCause)}</textarea></label></div>
  <div class="card"><h2>CAPA</h2><label class="f">CAPA plan${v.classification!=='Minor'?' (required for Major/Critical)':''}<textarea class="inp" id="vP" ${ro}>${esc(v.capa)}</textarea></label>
    <div class="small" style="margin-top:10px">Linked defects / CAPA: ${bugs.length?bugs.map(b=>`${link(b.id)} ${pill(b.status)}`).join(' '):'<span class="muted">none</span>'}</div></div></div></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Signatures</h2>${sigsHTML(v)}</div><div class="card"><h2>History</h2>${histHTML(v.history)}</div></div>`}}
ACT.devSave=()=>{const v=curDev();if(readDev(v)){hist(v,'Edited');audit('Deviation modified',v.id,'');save();render();toast('Saved')}else toast('No changes')};
ACT.devBug=()=>{const v=curDev();if(readDev(v)){hist(v,'Edited');save()}bugModal({title:`CAPA for ${v.id}: ${v.title}`,description:v.description,severity:v.classification,gxp:'High',found:'Deviation '+v.id,cr:v.cr,dev:v.id})};
ACT.devAdv=()=>{const v=curDev();if(v.status!=='Closed'&&readDev(v)){hist(v,'Edited');audit('Deviation modified',v.id,'')}const next=DEV_FLOW[DEV_FLOW.indexOf(v.status)+1];
  if(next==='Investigation'){if(!guard(v.immediate.trim(),'Record the immediate action / containment first.')){save();render();return}v.status=next;hist(v,next);audit('Status → '+next,v.id,'');save();render();return}
  if(next==='QA Review'){if(!guard(v.impact.trim()&&v.rcCategory&&v.rootCause.trim(),'Complete the impact assessment and root cause first.')||!guard(v.classification==='Minor'||v.capa.trim()||v.bugs.length,'Major/Critical deviations require a CAPA plan or linked defect.')){save();render();return}
    esign({record:v,meanings:['Investigation complete'],title:'Submit for QA review',onSign:()=>{v.status='QA Review';hist(v,'QA Review');audit('Status → QA Review',v.id,'')}});return}
  if(next==='Closed'){if(!guard(isQA(),'Only QA can close deviations.')||!guard(S.currentUser!==v.owner&&S.currentUser!==v.reporter,'Independent QA review: the owner/reporter cannot close their own deviation.'))return;
    esign({record:v,meanings:['QA approved — deviation closed'],title:'QA closure',onSign:()=>{v.status='Closed';v.closed=nowISO();hist(v,'Closed');audit('Status → Closed',v.id,'')}})}};

/* ---------- demo data for these modules ---------- */
function seedQuality(t,at){S.training=S.training||[];S.deviations=S.deviations||[];
  const mk=(uid,doc,ver,d)=>{const u=S.users.find(x=>x.id===uid);if(!u||!doc)return;const s={by:uid,name:u.name,role:u.role,meaning:'Read and understood',reason:'',at:t(d),version:ver,hash:recordHash(doc)};s.sigHash=sha256(JSON.stringify(s));
    const r={id:nextId('TRN'),doc:doc.id,version:ver,user:uid,at:s.at,sig:s};S.training.push(r);at(d,()=>audit('Training completed',doc.id,`${u.name} — v${ver}`,uid))};
  const D=id=>S.docs.find(d=>d.id===id);const csv=D('DOC-0001'),cc=D('DOC-0002'),pol=D('DOC-0007');
  ['u1','u2','u3','u4'].forEach((u,i)=>{mk(u,cc,'4.0',-740+i);if(u!=='u2')mk(u,csv,'3.0',-385+i);if(u!=='u4')mk(u,pol,'2.0',-305+i)});
  mk('u2',csv,'2.0',-600);
  const sg=(v,uid,meaning,reason,d)=>{const u=S.users.find(x=>x.id===uid);const s={by:uid,name:u.name,role:u.role,meaning,reason,at:t(d),version:null,hash:recordHash(v)};s.sigHash=sha256(JSON.stringify(s));v.signatures.push(s)};
  const v1={id:nextId('DEV'),title:'LIMS missed 42 min of freezer FZ-07 temperature readings',classification:'Major',area:'Computerized system',status:'Investigation',reporter:'u2',owner:'u1',occurred:t(-6),detected:t(-5),cr:null,
    description:'Daily review found no FZ-07 readings between 02:14 and 02:56 UTC. Samples for stability study STB-112 were stored in FZ-07.',immediate:'FZ-07 contents placed on QA hold; independent chart-recorder data retrieved for the gap (no excursion observed).',
    impact:'',rcCategory:'',rootCause:'',capa:'',bugs:[],history:[{at:t(-5),by:'u2',text:'Reported'},{at:t(-4),by:'u1',text:'Investigation'}],signatures:[]};
  const v2={id:nextId('DEV'),title:'OQ executed against superseded test script version',classification:'Minor',area:'Documentation',status:'Closed',reporter:'u3',owner:'u2',occurred:t(-50),detected:t(-49),cr:null,
    description:'TC-0003 was executed from a printed v0.9 script after v1.0 was approved.',immediate:'Results invalidated; TC-0003 re-executed with v1.0.',impact:'No product or data impact — re-execution passed.',rcCategory:'Procedure / human error',
    rootCause:'Printed copies were not controlled; no version check before execution.',capa:'Added "confirm approved version" step to the execution checklist; printing of scripts discontinued.',bugs:[],closed:t(-44),
    history:[{at:t(-49),by:'u3',text:'Reported'},{at:t(-48),by:'u2',text:'Investigation'},{at:t(-45),by:'u2',text:'QA Review'},{at:t(-44),by:'u3',text:'Closed'}],signatures:[]};
  const v3={id:nextId('DEV'),title:'Uncontrolled spreadsheet used for dose calculation',classification:'Major',area:'Data integrity',status:'Open',reporter:'u4',owner:'u1',occurred:t(-41),detected:t(-40),cr:null,
    description:'Pharmacy staff used a local Excel workbook instead of LabTrack LIMS for 3 pediatric dose calculations.',immediate:'',impact:'',rcCategory:'',rootCause:'',capa:'',bugs:[],history:[{at:t(-40),by:'u4',text:'Reported'}],signatures:[]};
  sg(v2,'u2','Investigation complete','Root cause and CAPA documented',-45);sg(v2,'u3','QA approved — deviation closed','CAPA implemented',-44);
  S.deviations.push(v1,v2,v3);
  at(-49,()=>audit('Deviation reported',v2.id,v2.title,'u3'));at(-45,()=>audit('E-signed (Investigation complete)',v2.id,'','u2'));at(-44,()=>audit('E-signed (QA approved — deviation closed)',v2.id,'','u3'));
  at(-40,()=>audit('Deviation reported',v3.id,v3.title,'u4'));at(-5,()=>audit('Deviation reported',v1.id,v1.title,'u2'));at(-4,()=>audit('Status → Investigation',v1.id,'','u1'))}
function upgradeWorkspace(){if(S.deviations&&S.training)return;S.deviations=S.deviations||[];S.training=S.training||[];
  if(S.system&&S.system.org==='Northwind Biologics'&&S.docs.some(d=>d.id==='DOC-0007')){const t=d=>new Date(Date.now()+d*DAY).toISOString();seedQuality(t,(d,fn)=>fn())}
  audit('Workspace upgraded','SYSTEM','Training & deviation modules added (v'+APP_VERSION+')');save()}

/* ---------- validation summary ---------- */
const VSR_OK='Fit for intended use',VSR_EXC='Fit for intended use with exceptions',VSR_NO='Not fit for intended use — release blocked';
const vcell=s=>String(s??'').replace(/\|/g,'/').replace(/\n/g,' ');
function vsrAssess(){const C=[];const add=(ok,block,label,detail)=>C.push({ok,sev:ok?'ok':block?'block':'warn',label,detail:detail||''});
  const a=verifyAudit();add(a.ok,true,a.ok?'Audit trail hash chain intact':`Audit trail broken at entry #${a.at}`);
  ['VP','URS'].forEach(t=>{const ds=S.docs.filter(d=>d.type===t);const ok=ds.some(d=>['Approved','Effective'].includes(d.status));add(ok,true,`${DOC_TYPES[t]} approved`,ok?'':ds.map(d=>`${d.id} is ${d.status}`).join(', ')||'none on file')});
  const rs=S.reqs.map(r=>[r,reqState(r)]),bad=rs.filter(([,s])=>s.k!=='pass');
  add(!bad.length,true,`Requirements verified (${rs.length-bad.length}/${rs.length})`,bad.map(([r,s])=>`${r.id} ${s.label}`).join(', '));
  const latest=[...new Set(S.tests.map(t=>latestResult(t.id)).filter(Boolean).map(x=>x.run))],unrev=latest.filter(r=>!sigsAt(r,'Reviewed').length);
  add(!unrev.length,true,`Current test evidence independently reviewed (${latest.length-unrev.length}/${latest.length} runs)`,unrev.map(r=>r.id).join(', '));
  const ob=S.defects.filter(openBug),obB=ob.filter(d=>d.gxp==='High'||['Critical','Major'].includes(d.severity));
  add(!ob.length,obB.length>0,ob.length?`${ob.length} open defect${ob.length>1?'s':''}${obB.length?` (${obB.length} GxP-critical/major)`:''}`:'No open defects',ob.map(d=>`${d.id} ${d.severity}`).join(', '));
  const od=S.deviations.filter(openDev),odB=od.filter(v=>v.classification!=='Minor');
  add(!od.length,odB.length>0,od.length?`${od.length} open deviation${od.length>1?'s':''}${odB.length?` (${odB.length} major/critical)`:''}`:'No open deviations',od.map(v=>`${v.id} ${v.classification}`).join(', '));
  let tO=0,tD=0;S.users.forEach(u=>trainingGaps(u.id).forEach(([,s])=>s.k==='Overdue'?tO++:tD++));
  add(!tO&&!tD,tO>0,tO||tD?`Training gaps: ${tO} overdue, ${tD} due`:'All personnel trained on effective SOPs');
  const oc=S.changes.filter(openCR);add(!oc.length,false,oc.length?`${oc.length} change control${oc.length>1?'s':''} still open`:'No open change controls',oc.map(c=>`${c.id} ${c.status}`).join(', '));
  const verdict=C.some(c=>c.sev==='block')?VSR_NO:C.some(c=>c.sev==='warn')?VSR_EXC:VSR_OK;
  return {checks:C,verdict,basis:sha256(JSON.stringify(C.map(c=>[c.sev,c.label,c.detail]))),rs,latest,ob,od,oc,tO,tD,audit:a}}
const verdictTone=v=>v===VSR_OK?'ok':v===VSR_EXC?'warn':'bad';
const sevIcon=s=>s==='ok'?'<span class="res pass">✓</span>':s==='block'?'<span class="res fail">✕</span>':'<span class="res err">!</span>';
function vsrMarkdown(A){const sys=S.system,r=A.rs;
  return `# Validation Summary Report — ${sys.name}\n\n| Field | Value |\n|---|---|\n| System | ${sys.name} |\n| Organisation / site | ${sys.org} · ${sys.site} |\n| GAMP 5 category | ${sys.gamp} |\n| Prepared by | ${userName(S.currentUser)} |\n| Generated | ${fmtUTC(nowISO())} |\n| Data basis sha256 | ${A.basis} |\n| Audit trail head | ${A.audit.head||'BROKEN'} |\n\n`+
  `## 1. Conclusion\n**${A.verdict}.**\n\n`+A.checks.map(c=>`- ${c.ok?'✓':c.sev==='block'?'✕ BLOCKER —':'! EXCEPTION —'} ${c.label}${c.detail?` (${c.detail})`:''}`).join('\n')+
  `\n\n## 2. Scope\nThis report summarises the validation status of ${sys.name} against the approved Validation Plan and URS, per GAMP 5 and EU GMP Annex 11 §4. It covers requirements, test execution, defects, deviations, training and open changes at the time of generation.\n\n`+
  `## 3. Requirements traceability\n| Requirement | Description | GxP | Risk (RPN) | Test cases | Status |\n|---|---|---|---|---|---|\n`+r.map(([q,s])=>`| ${q.id} | ${vcell(q.text)} | ${q.gxp} | ${riskClass(rpn(q))} (${rpn(q)}) | ${s.tcs.map(t=>t.id).join(', ')||'—'} | **${s.label}** |`).join('\n')+
  `\n\n## 4. Test execution evidence\n| Run | Target | Executed | Result | Reviewed by |\n|---|---|---|---|---|\n`+(A.latest.map(x=>{const p=x.results.filter(z=>z.status==='Pass').length,rv=sigsAt(x,'Reviewed')[0];return `| ${x.id} | ${vcell(x.codeLabel)} | ${userName(x.by)} · ${fmtD(x.at)} | ${p}/${x.results.length} pass | ${rv?rv.name:'**not reviewed**'} |`}).join('\n')||'| — | | | | |')+
  `\n\n## 5. Open defects\n`+(A.ob.length?`| Defect | Title | Severity | GxP | Status |\n|---|---|---|---|---|\n`+A.ob.map(d=>`| ${d.id} | ${vcell(d.title)} | ${d.severity} | ${d.gxp} | ${d.status} |`).join('\n'):'None.')+
  `\n\n## 6. Deviations\n`+(S.deviations.length?`| Deviation | Title | Class | Status |\n|---|---|---|---|\n`+S.deviations.map(v=>`| ${v.id} | ${vcell(v.title)} | ${v.classification} | ${v.status} |`).join('\n'):'None.')+
  `\n\n## 7. Training\n${A.tO||A.tD?`${A.tO} overdue and ${A.tD} due read-and-understood assignments.`:'All personnel are trained on the current effective SOPs and policies.'}\n\n`+
  `## 8. Open change controls\n`+(A.oc.length?A.oc.map(c=>`- ${c.id} ${vcell(c.title)} (${c.status})`).join('\n'):'None.')+
  `\n\n## 9. Release decision\n${A.verdict===VSR_NO?'The system must NOT be released for GxP use until all blockers above are resolved and this report is regenerated.':A.verdict===VSR_EXC?'The system may be released for GxP use subject to QA acceptance of the listed exceptions.':'The system is released for its intended GxP use.'}`}
function vsrBlock(d){if(!d.vsr)return '';if(d.vsr.verdict===VSR_NO)return 'This VSR concludes the system is not fit for use — it cannot be approved. Resolve the blockers and regenerate.';
  if(d.vsr.basis!==vsrAssess().basis)return 'Validation data has changed since this VSR was generated. Regenerate it before approval.';return ''}
function vsrBanner(d){if(!d.vsr)return '';const stale=['Draft','In Review'].includes(d.status)&&d.vsr.basis!==vsrAssess().basis;
  return `<div class="card noprint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Verdict</b>${pill(d.vsr.verdict,verdictTone(d.vsr.verdict))}${stale?`<span class="small" style="color:var(--warn)">⚠ Data changed since generation — <a href="#/validation">regenerate</a></span>`:''}</div>`}
ACT.vsrGen=()=>{const A=vsrAssess(),id=nextId('DOC');
  S.docs.unshift({id,type:'VSR',title:`Validation Summary Report — ${S.system.name}`,version:'0.1',status:'Draft',owner:S.currentUser,content:vsrMarkdown(A),created:nowISO(),updated:nowISO(),vsr:{verdict:A.verdict,basis:A.basis,at:nowISO()},history:[{at:nowISO(),by:S.currentUser,text:'Generated — '+A.verdict}],signatures:[]});
  audit('Document generated',id,'VSR: '+A.verdict);save();UI.tabs.doc='view';location.hash='#/doc/'+id};
function vValidation(){const A=vsrAssess(),vs=S.docs.filter(d=>d.type==='VSR');const n=k=>A.checks.filter(c=>c.sev===k).length;
  return {title:'Validation',html:`<div class="ph"><div class="t"><h1>Validation status</h1><p>Live release assessment for ${esc(S.system.name)} (GAMP 5 · Annex 11 §4). Generate a Validation Summary Report to freeze it as a controlled document for review and QA approval.</p></div><button class="btn pri" data-act="vsrGen">▤ Generate VSR</button></div>
  <div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div class="small muted">Current verdict</div><div style="font-size:20px;font-weight:700;margin-top:4px;color:var(--${verdictTone(A.verdict)==='ok'?'ok':verdictTone(A.verdict)==='warn'?'warn':'bad'})">${esc(A.verdict)}</div></div>
    ${pill(n('block')+' blocker'+(n('block')===1?'':'s'),n('block')?'bad':'ok')}${pill(n('warn')+' exception'+(n('warn')===1?'':'s'),n('warn')?'warn':'ok')}${pill(n('ok')+' passed','ok')}</div>
  <div class="card"><h2>Release criteria</h2>${A.checks.map(c=>`<div class="chk" style="align-items:flex-start">${sevIcon(c.sev)}<div style="flex:1"><div>${esc(c.label)}${c.sev==='block'?' <span class="small" style="color:var(--bad);font-weight:600">BLOCKER</span>':''}</div>${c.detail?`<div class="small muted">${c.detail.split(', ').map(x=>x.replace(/^([A-Z]+-\d{4})/,(m)=>link(m))).join(', ')}</div>`:''}</div></div>`).join('')}</div>
  <div class="card p0 list"><div style="padding:14px 16px 6px"><h2 style="margin:0">Validation Summary Reports</h2></div>${vs.map(d=>`<a class="item" href="#/doc/${d.id}"><span class="id">${d.id}</span><div class="main1"><div class="ttl">${esc(d.title)}</div><div class="meta"><span>v${esc(d.version)}</span><span>${esc(userName(d.owner))}</span><span>${ago(d.created)}</span></div></div>${d.vsr?pill(d.vsr.verdict===VSR_NO?'Blocked':d.vsr.verdict===VSR_EXC?'With exceptions':'Fit for use',verdictTone(d.vsr.verdict)):''}${pill(d.status)}</a>`).join('')||'<div class="empty">No VSR generated yet.</div>'}</div>`}}
