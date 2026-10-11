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
