/* ---------- code migration rule packs ---------- */
const RULE_PACKS={
  'es5-es2015':{name:'JavaScript ES5 → ES2015+',lang:'javascript',rules:[
    {find:'\\bvar\\s+',replace:'let ',flags:'g',desc:'var → let (block scoping)'},
    {find:'([^=!<>])==(?!=)',replace:'$1===',flags:'g',desc:'Loose equality == → strict ==='},
    {find:'!=(?!=)',replace:'!==',flags:'g',desc:'Loose inequality != → strict !=='},
    {find:'\\.indexOf\\(([^()]+)\\)\\s*!==?\\s*-1',replace:'.includes($1)',flags:'g',desc:'indexOf(x) !== -1 → includes(x)'},
    {find:'\\.indexOf\\(([^()]+)\\)\\s*>=\\s*0',replace:'.includes($1)',flags:'g',desc:'indexOf(x) >= 0 → includes(x)'},
    {find:'function\\s*\\(([^)]*)\\)\\s*\\{\\s*return\\s+([^;{}]+);\\s*\\}',replace:'($1) => $2',flags:'g',desc:'Single-return function → arrow function'}
  ]},
  'py2-py3':{name:'Python 2.7 → Python 3.11',lang:'python',rules:[
    {find:'^(\\s*)print\\s+(?!\\()(.+)$',replace:'$1print($2)',flags:'gm',desc:'print statement → print() function'},
    {find:'\\bxrange\\(',replace:'range(',flags:'g',desc:'xrange() → range()'},
    {find:'\\.iteritems\\(\\)',replace:'.items()',flags:'g',desc:'dict.iteritems() → items()'},
    {find:'\\.itervalues\\(\\)',replace:'.values()',flags:'g',desc:'dict.itervalues() → values()'},
    {find:'\\.has_key\\(([^()]+)\\)',replace:' __HASKEY__($1)',flags:'g',desc:'dict.has_key(k) → k in dict (marker)'},
    {find:'(\\w+) __HASKEY__\\(([^()]+)\\)',replace:'$2 in $1',flags:'g',desc:'(resolve has_key marker)'},
    {find:'\\braw_input\\(',replace:'input(',flags:'g',desc:'raw_input() → input()'},
    {find:'except\\s+([\\w.]+)\\s*,\\s*(\\w+)\\s*:',replace:'except $1 as $2:',flags:'g',desc:'except X, e → except X as e'},
    {find:'\\bunicode\\(',replace:'str(',flags:'g',desc:'unicode() → str()'},
    {find:'<>',replace:'!=',flags:'g',desc:'<> operator → !='},
    {find:'^(\\s*)import\\s+ConfigParser\\b',replace:'$1import configparser',flags:'gm',desc:'ConfigParser → configparser'}
  ]},
  'oracle-pg':{name:'Oracle 12c SQL → PostgreSQL 15',lang:'sql',rules:[
    {find:'\\bVARCHAR2\\b',replace:'VARCHAR',flags:'gi',desc:'VARCHAR2 → VARCHAR'},
    {find:'\\bNUMBER\\(',replace:'NUMERIC(',flags:'gi',desc:'NUMBER(p,s) → NUMERIC(p,s)'},
    {find:'\\bNUMBER\\b',replace:'NUMERIC',flags:'gi',desc:'NUMBER → NUMERIC'},
    {find:'\\bCLOB\\b',replace:'TEXT',flags:'gi',desc:'CLOB → TEXT'},
    {find:'\\bNVL\\(',replace:'COALESCE(',flags:'gi',desc:'NVL() → COALESCE()'},
    {find:'\\bSYSDATE\\b',replace:'CURRENT_TIMESTAMP',flags:'gi',desc:'SYSDATE → CURRENT_TIMESTAMP'},
    {find:'\\s+FROM\\s+DUAL\\b',replace:'',flags:'gi',desc:'Remove FROM DUAL'},
    {find:'\\bDATE\\s+DEFAULT\\s+CURRENT_TIMESTAMP',replace:'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',flags:'gi',desc:'DATE w/ time → TIMESTAMP'},
    {find:'(\\w+)\\.NEXTVAL',replace:"nextval('$1')",flags:'gi',desc:'seq.NEXTVAL → nextval(\'seq\')'},
    {find:'\\bTO_CHAR\\(([^,()]+),\\s*\'YYYY-MM-DD\'\\)',replace:"TO_CHAR($1, 'YYYY-MM-DD')",flags:'gi',desc:'TO_CHAR date format (compatible)'}
  ]},
  'custom':{name:'Custom rules',lang:'text',rules:[]}
};
function applyRules(code,rules){let out=String(code||'');const counts=[];const errors=[];
  rules.forEach((r,i)=>{if(r.off){counts.push(0);return}try{const re=new RegExp(r.find,r.flags||'g');const m=out.match(new RegExp(r.find,(r.flags||'g').includes('g')?r.flags||'g':(r.flags||'')+'g'));counts.push(m?m.length:0);out=out.replace(re,r.replace)}catch(e){counts.push(0);errors.push(`Rule ${i+1}: ${e.message}`)}});
  return {out,counts,errors}}
