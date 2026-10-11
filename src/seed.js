/* ---------- demo data: fictional "Northwind Biologics" ---------- */
const SUT_V42=String.raw`// LabTrack LIMS — core calculation module v4.2
// GAMP 5 Category 5 (custom code). Validated baseline.
'use strict';

var DOSE_MAX_MG = 1000;

exports.calcDose = function (weightKg, mgPerKg) {
  if (typeof weightKg != 'number' || weightKg <= 0) throw new Error('Invalid weight');
  if (typeof mgPerKg != 'number' || mgPerKg <= 0) throw new Error('Invalid dose rate');
  var dose = Math.round(weightKg * mgPerKg * 10) / 10;
  if (dose > DOSE_MAX_MG) throw new Error('Dose exceeds maximum');
  return dose;
};

exports.withinSpec = function (value, low, high) {
  return value >= low && value <= high;
};

exports.tempExcursion = function (readings, min, max, allowedMinutes) {
  // readings: [{ t: minute, c: celsius }] sampled once per minute
  var out = 0;
  for (var i = 0; i < readings.length; i++) {
    if (readings[i].c < min || readings[i].c > max) out++;
  }
  return { minutesOut: out, excursion: out > allowedMinutes };
};

exports.batchId = function (site, year, seq) {
  var s = String(seq);
  while (s.length < 5) s = '0' + s;
  return site.toUpperCase() + '-' + year + '-' + s;
};

exports.isValidBatchId = function (id) {
  return /^[A-Z]{3}-\d{4}-\d{5}$/.test(id);
};

exports.hasRole = function (user, role) {
  return user.roles.indexOf(role) != -1;
};

exports.canApprove = function (record, user) {
  // segregation of duties: an author can never approve their own record
  if (record.author == user.id) return false;
  return exports.hasRole(user, 'QA');
};
`;
const SUT_V50=applyRules(SUT_V42,RULE_PACKS['es5-es2015'].rules).out
  .replace('// LabTrack LIMS — core calculation module v4.2\n// GAMP 5 Category 5 (custom code). Validated baseline.','// LabTrack LIMS — core calculation module v5.0-rc1\n// GAMP 5 Category 5 (custom code). Migrated to ES2015+ under CR-0001.')
  .replace('let DOSE_MAX_MG','const DOSE_MAX_MG')
  .replace("let s = String(seq);\n  while (s.length < 5) s = '0' + s;\n  return","const s = String(seq).padStart(5, '0');\n  return")
  .replace("let out = 0;\n  for (let i = 0; i < readings.length; i++) {\n    if (readings[i].c < min || readings[i].c > max) out++;\n  }\n  return { minutesOut: out, excursion: out > allowedMinutes };",
           "const out = readings.filter(r => r.c < min || r.c > max).length;\n  return { minutesOut: out, excursion: out >= allowedMinutes };");

const PY_SRC=String.raw`# Instrument data parser — HPLC export (Python 2.7)
import ConfigParser
import csv

def load_peaks(path, min_area):
    peaks = {}
    f = open(path)
    try:
        for row in csv.DictReader(f):
            if float(row['area']) <> 0 and float(row['area']) >= min_area:
                peaks[row['peak_id']] = unicode(row['name'])
    except ValueError, e:
        print "Parse error:", e
    finally:
        f.close()
    for k, v in peaks.iteritems():
        print k, v
    if peaks.has_key('SST'):
        print "System suitability peak present"
    for i in xrange(3):
        print "replicate", i
    return peaks
`;
const SQL_SRC=String.raw`-- Stability study results schema (Oracle 12c)
CREATE TABLE stab_result (
  result_id    NUMBER(12) PRIMARY KEY,
  study_code   VARCHAR2(20) NOT NULL,
  timepoint_m  NUMBER(3),
  assay_pct    NUMBER(6,2),
  analyst      VARCHAR2(60),
  comments     CLOB,
  entered_at   DATE DEFAULT SYSDATE
);

INSERT INTO stab_result (result_id, study_code, timepoint_m, assay_pct, analyst)
VALUES (stab_seq.NEXTVAL, 'NWB-101-STB', 6, 99.2, 'p.shah');

SELECT study_code, NVL(assay_pct, 0) AS assay, TO_CHAR(entered_at, 'YYYY-MM-DD') AS d
  FROM stab_result
 WHERE entered_at > SYSDATE - 30;

SELECT SYSDATE FROM DUAL;
`;

const TC_SCRIPTS={
'TC-0001':String.raw`test('70 kg at 5 mg/kg = 350 mg', () => {
  expect(sut.calcDose(70, 5)).toBe(350);
});
test('Rounds to 0.1 mg', () => {
  expect(sut.calcDose(63.37, 2.5)).toBe(158.4);
  expect(sut.calcDose(12.25, 0.5)).toBeCloseTo(6.1, 1);
});
test('Pediatric low weight', () => {
  expect(sut.calcDose(3.2, 1.25)).toBe(4);
});`,
'TC-0002':String.raw`test('Rejects zero / negative weight', () => {
  expect(() => sut.calcDose(0, 5)).toThrow('Invalid weight');
  expect(() => sut.calcDose(-4, 5)).toThrow('Invalid weight');
});
test('Rejects non-numeric input', () => {
  expect(() => sut.calcDose('70', 5)).toThrow('Invalid weight');
  expect(() => sut.calcDose(70, null)).toThrow('Invalid dose rate');
});
test('Enforces 1000 mg ceiling', () => {
  expect(sut.calcDose(100, 10)).toBe(1000);
  expect(() => sut.calcDose(100, 10.01)).toThrow('maximum');
});`,
'TC-0003':String.raw`test('Inclusive lower and upper limits', () => {
  expect(sut.withinSpec(95.0, 95.0, 105.0)).toBe(true);
  expect(sut.withinSpec(105.0, 95.0, 105.0)).toBe(true);
});
test('Out of specification', () => {
  expect(sut.withinSpec(94.99, 95, 105)).toBe(false);
  expect(sut.withinSpec(105.01, 95, 105)).toBe(false);
});`,
'TC-0004':String.raw`const series = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i, c: fn(i) }));
test('No excursion when all readings in range', () => {
  expect(sut.tempExcursion(series(60, () => 5), 2, 8, 30).excursion).toBe(false);
});
test('Exactly the allowed duration is NOT an excursion', () => {
  const res = sut.tempExcursion(series(60, i => (i < 30 ? 9.5 : 5)), 2, 8, 30);
  expect(res.minutesOut).toBe(30);
  expect(res.excursion).toBe(false);
});
test('One minute over the allowed duration IS an excursion', () => {
  expect(sut.tempExcursion(series(60, i => (i < 31 ? 1.2 : 5)), 2, 8, 30).excursion).toBe(true);
});`,
'TC-0005':String.raw`test('Generates zero-padded batch IDs', () => {
  expect(sut.batchId('bos', 2026, 42)).toBe('BOS-2026-00042');
});
test('Validates batch ID format', () => {
  expect(sut.isValidBatchId('BOS-2026-00042')).toBeTruthy();
  expect(sut.isValidBatchId('bos-2026-42')).toBeFalsy();
});`,
'TC-0006':String.raw`const qa = { id: 'mlee', roles: ['QA'] };
const dev = { id: 'arivera', roles: ['Author'] };
test('Author cannot approve own record', () => {
  expect(sut.canApprove({ author: 'mlee' }, qa)).toBe(false);
});
test('QA can approve another author\'s record', () => {
  expect(sut.canApprove({ author: 'arivera' }, qa)).toBe(true);
});
test('Non-QA user cannot approve', () => {
  expect(sut.canApprove({ author: 'mlee' }, dev)).toBe(false);
});`
};

const TEMPLATES={
SOP:`# {title}\n\n## 1. Purpose\nDescribe why this procedure exists.\n\n## 2. Scope\nSystems, sites and personnel in scope.\n\n## 3. Responsibilities\n| Role | Responsibility |\n|---|---|\n| System Owner | |\n| QA | |\n\n## 4. Procedure\n1. Step one\n2. Step two\n\n## 5. Records\nRecords generated and retention period.\n\n## 6. References\n- 21 CFR Part 11\n- EU GMP Annex 11\n- GAMP 5 (2nd ed.)\n\n## 7. Revision History\n| Version | Change |\n|---|---|\n| 1.0 | Initial issue |`,
VP:`# {title}\n\n## 1. Introduction\nSystem description and GAMP 5 category.\n\n## 2. Validation Strategy\nRisk-based approach per ICH Q9 / GAMP 5. Critical thinking applied (CSA).\n\n## 3. Deliverables\n| Deliverable | Responsible | Approver |\n|---|---|---|\n| URS | System Owner | QA |\n| Risk Assessment | Validation | QA |\n| IQ/OQ/PQ | Validation | QA |\n| Traceability Matrix | Validation | QA |\n| Validation Summary Report | Validation | QA |\n\n## 4. Acceptance Criteria\nAll high-risk requirements tested with documented evidence; no open Critical/Major deviations.\n\n## 5. Deviation Handling\nDeviations raised as defects with root cause and CAPA.`,
URS:`# {title}\n\n## 1. Purpose\n\n## 2. Requirements\n| ID | Requirement | GxP Impact |\n|---|---|---|\n| REQ-xxxx | | High |\n\n## 3. Regulatory Requirements\n- Audit trail (21 CFR 11.10(e))\n- Electronic signatures (21 CFR 11.50 / 11.70)`,
FS:`# {title}\n\n## 1. Overview\n\n## 2. Functional Description\n\n## 3. Interfaces\n\n## 4. Data & Security\n\n## 5. Traceability to URS`,
RA:`# {title}\n\n## 1. Method\nFMEA — Severity × Probability × Detectability (1–3 each). RPN ≥ 12 = High.\n\n## 2. Risk Register\n| Function | Failure mode | S | P | D | RPN | Mitigation |\n|---|---|---|---|---|---|---|\n| | | | | | | |\n\n## 3. Conclusion`,
IQ:`# {title}\n\n## 1. Objective\nVerify the system is installed per approved specifications.\n\n## 2. Checks\n| # | Check | Expected | Actual | Pass/Fail |\n|---|---|---|---|---|\n| 1 | Server OS version | | | |\n| 2 | Application version | | | |\n| 3 | Configuration baseline | | | |`,
OQ:`# {title}\n\n## 1. Objective\nVerify the system operates as specified across its operating range.\n\n## 2. Test Cases\nReference automated test cases (TC-xxxx) with execution evidence in Test Runs (TR-xxxx).\n\n## 3. Acceptance Criteria\nAll test cases pass; deviations documented.`,
PQ:`# {title}\n\n## 1. Objective\nVerify the system performs consistently in the production environment with real users.\n\n## 2. Scenarios\n\n## 3. Acceptance Criteria`,
Policy:`# {title}\n\n## Policy Statement\n\n## Principles\n- Attributable\n- Legible\n- Contemporaneous\n- Original\n- Accurate\n- Complete, Consistent, Enduring, Available\n\n## Responsibilities`,
TSR:`# {title}\n\n## Summary\n\n## Results\n\n## Deviations\n\n## Conclusion`,
VSR:`# {title}\n\n## 1. Summary\n\n## 2. Deliverables Status\n\n## 3. Deviations & CAPA\n\n## 4. Release Statement\nThe system is fit for intended use.`,
RTM:`# {title}\n\n(Generated from the live traceability matrix.)`,
CCR:`# {title}\n\n(Generated from the change control record.)`
};
const DOC_TYPES={SOP:'Standard Operating Procedure',Policy:'Policy',VP:'Validation Plan',URS:'User Requirements Spec',FS:'Functional Spec',RA:'Risk Assessment',IQ:'IQ Protocol',OQ:'OQ Protocol',PQ:'PQ Protocol',TSR:'Test Summary Report',RTM:'Traceability Matrix',VSR:'Validation Summary Report',CCR:'Change Control Record'};

function seed(){
  const t=d=>new Date(Date.now()+d*DAY).toISOString();
  S={v:1,app:APP_VERSION,created:nowISO(),seq:{},currentUser:'u1',theme:'auto',
    users:[{id:'u1',name:'Alex Rivera',role:'Developer',roles:['Author'],pin:'1234'},{id:'u2',name:'Priya Shah',role:'QA Tester',roles:['Tester'],pin:'1234'},{id:'u3',name:'Morgan Lee',role:'QA Approver',roles:['QA'],pin:'1234'},{id:'u4',name:'Sam Okafor',role:'System Owner',roles:['Owner'],pin:'1234'}],
    system:{name:'LabTrack LIMS',org:'Northwind Biologics',gamp:'Category 5 — custom code',site:'Boston (BOS)'},
    docs:[],reqs:[],tests:[],runs:[],changes:[],defects:[],code:[],audit:[]};
  const ev=[];const at=(d,fn)=>ev.push({d,fn});
  const sig=(rec,uid,meaning,reason,d)=>{const u=S.users.find(x=>x.id===uid);const s={by:uid,name:u.name,role:u.role,meaning,reason,at:t(d),version:rec.version||null,hash:recordHash(rec)};s.sigHash=sha256(JSON.stringify(s));(rec.signatures=rec.signatures||[]).push(s)};

  // code baselines
  const cv1={id:nextId('CV'),label:'v4.2',title:'LabTrack core module v4.2',lang:'javascript',status:'Baseline',code:SUT_V42,created:t(-210),by:'u1'};cv1.hash=sha256(cv1.code);
  S.code.push(cv1);at(-210,()=>audit('Code baseline registered',cv1.id,'v4.2 sha256 '+short(cv1.hash),'u1'));

  // requirements
  const R=[['Calculate dose from patient weight and mg/kg rate, rounded to 0.1 mg','Calculations','High',[3,2,2]],
    ['Reject invalid (non-numeric, zero or negative) dose inputs','Calculations','High',[3,2,2]],
    ['Prevent any calculated dose above the 1000 mg ceiling','Calculations','High',[3,1,2]],
    ['Evaluate results against specification limits inclusively','Results','High',[3,2,1]],
    ['Flag a cold-chain excursion only when out-of-range time exceeds the allowed duration','Cold chain','High',[3,2,3]],
    ['Generate and validate batch IDs in format SSS-YYYY-NNNNN','Batch records','Medium',[2,1,1]],
    ['Prevent an author from approving their own record (segregation of duties)','Part 11','High',[3,2,2]],
    ['Restrict approvals to users holding the QA role','Part 11','High',[3,1,2]],
    ['Secure, computer-generated, time-stamped audit trail of all GxP actions','Part 11','High',[3,1,2]],
    ['Electronic signatures display signer name, date/time and meaning','Part 11','Medium',[2,1,2]],
    ['Export any GxP record in a human-readable format for inspection','Data integrity','Low',[1,1,1]]];
  R.forEach(([text,cat,gxp,[s,p,d]])=>S.reqs.push({id:nextId('REQ'),text,category:cat,gxp,risk:{s,p,d},source:'DOC-0003',created:t(-200)}));

  // tests
  const T=[['Dose calculation accuracy','OQ',['REQ-0001']],['Dose input validation & ceiling','OQ',['REQ-0002','REQ-0003']],['Specification limit evaluation','OQ',['REQ-0004']],['Temperature excursion boundary','OQ',['REQ-0005']],['Batch ID generation & validation','OQ',['REQ-0006']],['Approval segregation of duties','OQ',['REQ-0007','REQ-0008']]];
  T.forEach(([title,type,reqs])=>{const id=nextId('TC');S.tests.push({id,title,type,reqs,mode:'auto',script:TC_SCRIPTS[id],steps:[],status:'Approved',version:'1.0',author:'u2',created:t(-150)})});
  S.tests.push({id:nextId('TC'),title:'Audit trail review & integrity',type:'PQ',reqs:['REQ-0009'],mode:'manual',script:'',status:'Approved',version:'1.0',author:'u2',created:t(-140),steps:[
    {action:'Log in as Author and create a new document',expected:'Audit entry records user, UTC timestamp and action'},
    {action:'Edit the document and save',expected:'Audit entry shows modification; previous entries unchanged'},
    {action:'Open Audit Trail and run "Verify chain"',expected:'Chain verifies intact; every entry hash-linked to previous'}]});
  S.tests.push({id:nextId('TC'),title:'E-signature manifestation',type:'PQ',reqs:['REQ-0010'],mode:'manual',script:'',status:'Approved',version:'1.0',author:'u2',created:t(-140),steps:[
    {action:'Sign a document with meaning "Approved" and reason',expected:'Signature shows printed name, UTC date/time and meaning'},
    {action:'Attempt a signature with an incorrect PIN',expected:'Signature rejected; failed attempt written to audit trail'}]});
  S.tests.push({id:nextId('TC'),title:'Installation qualification — app server',type:'IQ',reqs:[],mode:'manual',script:'',status:'Draft',version:'0.1',author:'u2',created:t(-6),steps:[
    {action:'Record OS version on LIMS app server',expected:'Windows Server 2022 Datacenter 21H2'},{action:'Record application build',expected:'LabTrack 5.0.0-rc1'}]});

  // documents
  const D=[['SOP','Computerized System Validation (SOP-QA-012)','3.0','Effective','u4',-400,20,`# Computerized System Validation\n\n## 1. Purpose\nDefines the risk-based lifecycle for validating GxP computerized systems at Northwind Biologics, aligned to GAMP 5 (2nd ed.) and FDA Computer Software Assurance (CSA).\n\n## 2. Scope\nAll systems that create, modify, maintain, archive, retrieve or transmit GxP records.\n\n## 3. Lifecycle\n1. Plan — Validation Plan (VP) approved by QA\n2. Specify — URS / FS with GxP impact and risk\n3. Verify — IQ / OQ / PQ executed with objective evidence\n4. Report — Traceability Matrix and Validation Summary Report\n5. Operate — change control, periodic review, incident/CAPA\n\n## 4. Risk Classification\n| RPN (S×P×D) | Class | Testing rigour |\n|---|---|---|\n| ≥ 12 | High | Scripted testing, independent review |\n| 6–11 | Medium | Scripted or unscripted with evidence |\n| ≤ 5 | Low | Unscripted / vendor evidence |\n\n## 5. References\n- 21 CFR Part 11\n- EU GMP Annex 11\n- SOP-QA-007 Change Control`],
    ['SOP','Change Control (SOP-QA-007)','4.0','Effective','u4',-760,-12,`# Change Control\n\n## 1. Purpose\nEnsure changes to validated systems — code migrations, patches, configuration and infrastructure — are assessed, approved, tested and documented before release.\n\n## 2. Procedure\n1. Raise change request (CR) with description and justification\n2. Impact & risk assessment: data integrity, validated state, Part 11 controls, SOPs, training\n3. QA approval (e-signature) before implementation\n4. Implement per migration plan with backup and rollback\n5. Execute regression tests; raise defects for failures\n6. Verify and close with QA e-signature; promote new baseline\n\n## 3. Emergency Changes\nRetrospective approval within 5 business days.`],
    ['URS','LabTrack LIMS User Requirements Specification','2.1','Effective','u4',-200,530,null],
    ['RA','LabTrack LIMS v5.0 Risk Assessment (FMEA)','1.0','Approved','u1',-30,null,null],
    ['VP','LabTrack LIMS v5.0 Validation Plan','0.3','In Review','u1',-9,null,`# LabTrack LIMS v5.0 Validation Plan\n\n## 1. Introduction\nLabTrack LIMS core module is migrated from ES5 to ES2015+ (CR-0001). GAMP 5 Category 5.\n\n## 2. Strategy\nRegression of all automated OQ test cases against v5.0-rc1; manual PQ for audit trail and e-signature.\n\n## 3. Deliverables\n| Deliverable | Status |\n|---|---|\n| Risk Assessment | Approved |\n| OQ (automated) | In execution |\n| PQ (manual) | Pending |\n| Validation Summary Report | Not started |\n\n## 4. Acceptance Criteria\nAll High-GxP requirements traced to passing tests. No open Critical/Major defects.`],
    ['OQ','LabTrack LIMS v5.0 OQ Protocol','0.1','Draft','u2',-5,null,null],
    ['Policy','Data Integrity & ALCOA+ Policy (POL-QA-001)','2.0','Effective','u3',-320,410,null]];
  D.forEach(([type,title,version,status,owner,dc,rev,content])=>{const id=nextId('DOC');
    let c=content||TEMPLATES[type].replace('{title}',title.replace(/ \(.*\)$/,''));
    if(type==='URS')c=`# ${title}\n\n## 1. Purpose\nUser requirements for LabTrack LIMS core calculations and Part 11 controls.\n\n## 2. Requirements\n| ID | Requirement | Category | GxP Impact |\n|---|---|---|---|\n`+S.reqs.map(r=>`| ${r.id} | ${r.text} | ${r.category} | ${r.gxp} |`).join('\n');
    if(type==='RA')c=`# ${title}\n\n## Method\nFMEA — Severity × Probability × Detectability (1–3). RPN ≥ 12 = High.\n\n## Risk Register\n| Req | S | P | D | RPN |\n|---|---|---|---|---|\n`+S.reqs.map(r=>`| ${r.id} | ${r.risk.s} | ${r.risk.p} | ${r.risk.d} | ${r.risk.s*r.risk.p*r.risk.d} |`).join('\n');
    const doc={id,type,title,version,status,owner,content:c,created:t(dc),updated:t(dc+3),effective:status==='Effective'?t(dc+6):null,reviewDue:rev!=null?t(rev):null,history:[],signatures:[]};
    doc.history.push({at:t(dc),by:owner,text:'Created v'+version.split('.')[0]+'.0 draft'});
    S.docs.push(doc);
    at(dc,()=>audit('Document created',id,title,owner));
    if(status!=='Draft'){at(dc+2,()=>{audit('Submitted for review',id,'v'+version,owner)});doc.history.push({at:t(dc+2),by:owner,text:'Submitted for review'})}
    if(['Approved','Effective'].includes(status)){const rv=owner==='u2'?'u1':'u2';at(dc+4,()=>{sig(doc,rv,'Reviewed','Content verified against template',dc+4);audit('E-signed (Reviewed)',id,'',rv)});at(dc+5,()=>{sig(doc,'u3','Approved','Approved for use',dc+5);audit('E-signed (Approved)',id,'','u3')});doc.history.push({at:t(dc+5),by:'u3',text:'Approved'})}
    if(status==='Effective'){at(dc+6,()=>audit('Made effective',id,'v'+version,'u3'));doc.history.push({at:t(dc+6),by:'u3',text:'Effective v'+version})}
  });

  // changes
  const cr1={id:nextId('CR'),title:'LabTrack core v4.2 → v5.0: ES5 → ES2015+ code migration',type:'Code Migration',lang:'javascript',status:'Implemented',requester:'u1',owner:'u1',created:t(-28),
    description:'Modernize the LIMS core calculation module to ES2015+ (strict equality, block scoping, arrow functions) to align with the v5.0 platform and remove tech-debt flagged in the last periodic review.',
    justification:'Vendor runtime upgrade drops legacy ES5 transpilation; required for v5.0 release.',
    risk:'High',gamp:'5',fromCV:'CV-0001',toLabel:'v5.0-rc1',pack:'es5-es2015',rules:clone(RULE_PACKS['es5-es2015'].rules),sourceCode:SUT_V42,targetCode:SUT_V50,
    impact:{di:true,validated:true,p11:false,sop:false,training:true,data:false},
    impactNotes:'Calculation logic affects dose and cold-chain disposition decisions — full OQ regression required.',
    plan:[{step:'Back up production database and code baseline CV-0001',done:true},{step:'Apply ES5 → ES2015+ rule pack in migration workbench',done:true},{step:'Peer code review of transformed module',done:true},{step:'Run full OQ regression suite against candidate',done:true},{step:'Deploy to validation environment',done:false},{step:'Rollback plan: restore CV-0001 and redeploy (≤ 30 min)',done:false}],
    tests:['TC-0001','TC-0002','TC-0003','TC-0004','TC-0005','TC-0006'],history:[],signatures:[]};
  S.changes.push(cr1);
  at(-28,()=>audit('Change request raised',cr1.id,cr1.title,'u1'));
  at(-26,()=>{sig(cr1,'u4','Assessed','Impact & risk assessment complete',-26);audit('E-signed (Assessed)',cr1.id,'','u4')});
  at(-24,()=>{sig(cr1,'u3','Approved','Approved for implementation',-24);audit('E-signed (Approved)',cr1.id,'','u3')});
  at(-3,()=>audit('Migration rules applied',cr1.id,'Rule pack es5-es2015 → v5.0-rc1','u1'));
  at(-2,()=>audit('Status → Implemented',cr1.id,'','u1'));
  cr1.history.push({at:t(-28),by:'u1',text:'Raised'},{at:t(-26),by:'u4',text:'Assessed'},{at:t(-24),by:'u3',text:'Approved'},{at:t(-2),by:'u1',text:'Implemented'});

  const cr2={id:nextId('CR'),title:'Stability results schema: Oracle 12c → PostgreSQL 15',type:'Database Migration',lang:'sql',status:'Assessed',requester:'u4',owner:'u1',created:t(-12),
    description:'Migrate the stability study results schema and reporting queries off Oracle 12c (end of extended support).',justification:'Oracle 12c extended support ended; licence cost reduction.',
    risk:'High',gamp:'4',fromCV:null,toLabel:'pg15',pack:'oracle-pg',rules:clone(RULE_PACKS['oracle-pg'].rules),sourceCode:SQL_SRC,targetCode:'',
    impact:{di:true,validated:true,p11:true,sop:true,training:false,data:true},impactNotes:'Data migration requires record-count and checksum reconciliation (ALCOA+ complete & accurate).',
    plan:[{step:'Export Oracle schema and data with checksums',done:false},{step:'Convert DDL/DML with Oracle → PostgreSQL rule pack',done:false},{step:'Reconcile row counts and column checksums',done:false},{step:'Execute data migration verification protocol',done:false}],tests:[],history:[{at:t(-12),by:'u4',text:'Raised'},{at:t(-10),by:'u4',text:'Assessed'}],signatures:[]};
  S.changes.push(cr2);at(-12,()=>audit('Change request raised',cr2.id,cr2.title,'u4'));at(-10,()=>{sig(cr2,'u4','Assessed','Data integrity impact identified',-10);audit('E-signed (Assessed)',cr2.id,'','u4')});

  const cr3={id:nextId('CR'),title:'HPLC instrument data parser: Python 2.7 → 3.11',type:'Code Migration',lang:'python',status:'Draft',requester:'u1',owner:'u1',created:t(-4),
    description:'Port the chromatography export parser to Python 3.11; Python 2.7 is unsupported and flagged by IT security.',justification:'Security vulnerability remediation.',
    risk:'Medium',gamp:'5',fromCV:null,toLabel:'parser-3.0',pack:'py2-py3',rules:clone(RULE_PACKS['py2-py3'].rules),sourceCode:PY_SRC,targetCode:'',
    impact:{di:true,validated:true,p11:false,sop:false,training:false,data:false},impactNotes:'',plan:[{step:'Apply Python 2 → 3 rule pack',done:false},{step:'Manual review of str/bytes handling',done:false},{step:'Parallel run against 20 historical exports',done:false}],tests:[],history:[{at:t(-4),by:'u1',text:'Raised'}],signatures:[]};
  S.changes.push(cr3);at(-4,()=>audit('Change request raised',cr3.id,cr3.title,'u1'));

  const cr4={id:nextId('CR'),title:'LIMS app server OS: Windows Server 2016 → 2022',type:'Infrastructure',lang:'text',status:'Closed',requester:'u4',owner:'u4',created:t(-95),
    description:'In-place OS upgrade of the LIMS application server.',justification:'OS end of mainstream support.',risk:'Medium',gamp:'1',fromCV:null,toLabel:'',pack:'custom',rules:[],sourceCode:'',targetCode:'',
    impact:{di:false,validated:true,p11:false,sop:false,training:false,data:false},impactNotes:'Infrastructure qualification (IQ) only.',
    plan:[{step:'Snapshot VM',done:true},{step:'Upgrade OS',done:true},{step:'Execute IQ checklist',done:true}],tests:[],history:[{at:t(-95),by:'u4',text:'Raised'},{at:t(-70),by:'u3',text:'Closed'}],signatures:[]};
  S.changes.push(cr4);at(-95,()=>audit('Change request raised',cr4.id,cr4.title,'u4'));at(-92,()=>{sig(cr4,'u3','Approved','Low data risk',-92);audit('E-signed (Approved)',cr4.id,'','u3')});at(-70,()=>{sig(cr4,'u3','Closed','IQ executed, no deviations',-70);audit('E-signed (Closed)',cr4.id,'','u3')});

  // runs (executed for real with the harness)
  const autoTests=S.tests.filter(x=>x.mode==='auto');
  const mkRun=(d,by,target,code,label,cr)=>{const res=__harness(code,autoTests.map(x=>({id:x.id,script:x.script})));const r={id:nextId('TR'),at:t(d),by,target,codeLabel:label,codeHash:sha256(code),cr:cr||null,engine:'web worker (sandboxed)',results:res.map(x=>Object.assign(x,{testVersion:'1.0'})),signatures:[]};r.hash=sha256(JSON.stringify(r.results));S.runs.push(r);return r};
  const r1=mkRun(-20,'u2','CV-0001',SUT_V42,'v4.2 baseline',null);
  at(-20,()=>audit('Test run executed',r1.id,'6/6 passed on v4.2','u2'));at(-19,()=>{sig(r1,'u3','Reviewed','Evidence reviewed',-19);audit('E-signed (Reviewed)',r1.id,'','u3')});
  const r2=mkRun(-1,'u2','CR-0001',SUT_V50,'v5.0-rc1 (CR-0001)','CR-0001');
  const p2=r2.results.filter(x=>x.status==='Pass').length;
  at(-1,()=>audit('Test run executed',r2.id,`${p2}/${r2.results.length} passed on v5.0-rc1`,'u2'));

  // defects
  const b1={id:nextId('BUG'),title:'Excursion flagged at exactly the allowed duration (v5.0-rc1)',severity:'Major',gxp:'High',status:'Investigating',reporter:'u2',assignee:'u1',created:t(-1),
    found:'Regression run',run:r2.id,tc:'TC-0004',cr:'CR-0001',
    description:'TC-0004 "Exactly the allowed duration is NOT an excursion" fails on v5.0-rc1: 30 out-of-range minutes with a 30-minute allowance returns excursion = true. Product could be wrongly rejected / quarantined.',
    steps:'1. Run TC-0004 against CR-0001 candidate\n2. Observe case 2 failure',expected:'excursion = false at exactly 30 minutes (REQ-0005)',actual:'excursion = true',
    rcCategory:'',rootCause:'',fix:'',capa:{corrective:'',preventive:'',effectiveness:''},history:[{at:t(-1),by:'u2',text:'Raised from failed test TC-0004 in '+r2.id},{at:t(-1),by:'u1',text:'Investigating'}],signatures:[]};
  const b2={id:nextId('BUG'),title:'Audit trail CSV export truncates comments over 255 characters',severity:'Minor',gxp:'Medium',status:'Closed',reporter:'u2',assignee:'u1',created:t(-60),found:'Periodic review',run:null,tc:null,cr:null,
    description:'Long audit comments are cut in exported CSV (record not complete — ALCOA+).',steps:'',expected:'Full comment exported',actual:'Truncated at 255 chars',
    rcCategory:'Design',rootCause:'Export column declared as VARCHAR(255) in legacy report definition.',fix:'Column widened to TEXT; export regenerated.',
    capa:{corrective:'Re-export last 12 months of audit trail for affected records.',preventive:'Added "max-length field" check to code review checklist.',effectiveness:'No truncation found in 3 consecutive monthly exports.'},
    history:[{at:t(-60),by:'u2',text:'Raised'},{at:t(-40),by:'u3',text:'Closed'}],signatures:[]};
  const b3={id:nextId('BUG'),title:'Signature manifest shows local time without timezone',severity:'Minor',gxp:'Medium',status:'Fix In Progress',reporter:'u3',assignee:'u1',created:t(-15),found:'QA review',run:null,tc:'TC-0008',cr:null,
    description:'Printed signature manifestation lacks a timezone; ambiguous for multi-site inspections (21 CFR 11.50).',steps:'',expected:'UTC timestamp',actual:'Local time, no TZ',
    rcCategory:'Requirements',rootCause:'URS did not specify timezone for manifestation.',fix:'Render signatures in UTC with explicit suffix.',capa:{corrective:'Update manifestation format.',preventive:'Add timezone requirement to URS template.',effectiveness:''},
    history:[{at:t(-15),by:'u3',text:'Raised'},{at:t(-9),by:'u1',text:'Fix In Progress'}],signatures:[]};
  S.defects.push(b1,b2,b3);
  at(-60,()=>audit('Defect raised',b2.id,b2.title,'u2'));at(-40,()=>{sig(b2,'u3','Closed','CAPA effective',-40);audit('E-signed (Closed)',b2.id,'','u3')});
  at(-15,()=>audit('Defect raised',b3.id,b3.title,'u3'));at(-1,()=>audit('Defect raised',b1.id,b1.title,'u2'));
  cr1.defects=[b1.id];

  ev.sort((a,b)=>a.d-b.d).forEach(e=>{S._clock=t(e.d);e.fn()});delete S._clock;
  audit('Workspace initialised','SYSTEM','Demo data loaded (v'+APP_VERSION+')','u4');
  save();
}
