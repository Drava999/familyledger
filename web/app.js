const $ = id => document.getElementById(id);

/* ---------- look & labels ---------- */
const IC = {
  bag:"M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0", repeat:"M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  food:"M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1-3 4-3 7h3v11", play:"M3 7h18v10H3zM8 10v4M6 12h4M15 11h.01M18 13h.01",
  bus:"M5 4h14v12H5zM5 11h14M8 19v2M16 19v2M8 15h.01M16 15h.01", cart:"M3 4h2l2 11h11l2-8H6M9 20h.01M17 20h.01",
  heart:"M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z", bolt:"M13 2L4 14h7l-1 8 9-12h-7z",
  plane:"M10 14l-7-3 18-8-8 18-3-7z", book:"M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-4a3 3 0 0 0-3 3", shield:"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  cash:"M3 7h18v10H3zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", inbox:"M12 4v11M7 10l5 5 5-5M4 20h16", swap:"M4 8h13l-3-3M20 16H7l3 3",
  chart:"M4 20V10M10 20V4M16 20v-7M22 20H2", person:"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", dots:"M5 12h.01M12 12h.01M19 12h.01",
  piggy:"M5 11a7 6 0 0 1 13-2h2v4h-2a7 6 0 0 1-3 3v3h-3v-2H9v2H6v-3a6 6 0 0 1-1-5zM15 10h.01", down:"M12 4v14M6 12l6 6 6-6"
};
const CAT = {
  "Shopping":["#B8427A","bag"], "Subscriptions":["#8A5CC2","repeat"], "Food & Dining":["#B4651E","food"], "Entertainment":["#9C7C10","play"],
  "Transport":["#22769A","bus"], "Groceries":["#557A22","cart"], "Health":["#0E7C70","heart"], "Bills & Utilities":["#5468C9","bolt"],
  "Travel":["#2E8FB8","plane"], "Education":["#6E5BB8","book"], "Insurance":["#6F7F7B","shield"], "Cash":["#8A6A3A","cash"],
  "Income":["#1E8A4F","inbox"], "Transfers":["#7E8F8B","swap"], "Investing":["#0E7C70","chart"], "People":["#5468C9","person"], "Other":["#7A8784","dots"]
};
const SHORT = {"Food & Dining":"Food","Entertainment":"Fun","Bills & Utilities":"Bills"};
const catName = c => SHORT[c]||c;
const catCol = c => (CAT[c]||CAT.Other)[0];
const soft = c => `color-mix(in srgb, ${catCol(c)} 16%, var(--surface))`;
const svgI = (d, cls="i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const catIcon = c => `<span class="ic" style="background:${soft(c)};color:${catCol(c)}">${svgI(IC[(CAT[c]||CAT.Other)[1]])}</span>`;

const S = { me:{}, ai:false, files:[], family:[], famView:[], rules:{}, notes:{}, meta:{}, lookups:{}, budgets:{}, goals:[],
  person:"All", month:null, tab:"home", sub:{spend:"cats",moves:"in",goals:"limits"}, by:"category", open:null, q:"",
  pending:[], upPerson:"", skipped:new Set(), looking:null, ex:null, showAll:{} };

function merchantKey(desc){ return parseDesc(desc).key; }
function categorize(desc, amt){ return autoCategory(desc, amt, S.rules); }
function setCat(t, c, unsure){ t[3]=c; t.length=4; if(unsure) t[4]=1; }

/* ---------- formatting ---------- */
function fmt(n,short){ const a=Math.abs(n); const s=short&&a>=10000?(a/1000).toFixed(a>=100000?0:1)+"k":a.toLocaleString("en-SG",{minimumFractionDigits:short?0:2,maximumFractionDigits:short?0:2}); return (n<0?"−":"")+"$"+s; }
const money = n => fmt(n,1);
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(t){ document.querySelectorAll(".toast").forEach(x=>x.remove()); const d=document.createElement("div"); d.className="toast"; d.setAttribute("role","status"); d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),2800); }
function monthLabel(ym, long){ const [y,m]=ym.split("-"); return new Date(+y,+m-1,1).toLocaleDateString("en-SG",long?{month:"long",year:+y===new Date().getFullYear()?undefined:"numeric"}:{month:"short"}); }
function ymNow(){ const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1); }
function dim(ym){ const [y,m]=ym.split("-").map(Number); return new Date(y,m,0).getDate(); }
function dayMon(d){ return new Date(d+"T00:00:00").toLocaleDateString("en-SG",{day:"numeric",month:"short"}); }

/* ---------- column detection (CSV / Excel) ---------- */
function detect(rows){
  const lim=Math.min(rows.length,40);
  for(let h=0;h<lim;h++){
    const cells=(rows[h]||[]).map(c=>String(c??"").toLowerCase().trim());
    const find=re=>cells.findIndex(c=>re.test(c));
    const date=find(/date/);
    if(date<0) continue;
    const debit=find(/debit|withdraw|money out|spent|outflow/), credit=find(/credit|deposit|money in|inflow/);
    let amount=find(/^amount|transaction amount|amount \(|^sgd amount|local amount/);
    if(amount<0 && debit<0) amount=find(/amount|sgd/);
    if(amount<0 && debit<0) continue;
    const cat=find(/^categor/), person=find(/^(person|owner|member|who)$/);
    const others=[]; cells.forEach((c,i)=>{ if(i!==date&&i!==amount&&i!==debit&&i!==credit&&i!==cat&&i!==person&&/desc|detail|transaction|ref|merchant|particular|narrat|remark|payee|code|type/.test(c)&&!/date|balance|currency|status/.test(c)) others.push(i); });
    const main=cells.findIndex((c,i)=>i!==date&&/^(transaction )?desc(ription)?s?$|^details?$|^particulars$|^narrative$|^transaction details$/.test(c));
    const descs = main>=0 ? [main] : others;
    const descAlt = main>=0 ? others.filter(i=>i!==main) : [];
    return {header:h, date, amount, debit, credit, descs, descAlt, cat, person, mode: amount>=0?"single":"split"};
  }
  const cols=Math.max(...rows.slice(0,30).map(r=>r.length));
  const score=(f)=>{ let best=-1,bi=-1; for(let c=0;c<cols;c++){ let n=0; rows.slice(0,30).forEach(r=>{ if(f(r[c])) n++; }); if(n>best){best=n;bi=c;} } return bi; };
  const date=score(v=>parseDate(v)), amount=score(v=>typeof v==="number"||/^[-(]?\$?[\d,]+\.\d{2}\)?$/.test(String(v||"").trim()));
  const descs=[]; for(let c=0;c<cols;c++) if(c!==date&&c!==amount) descs.push(c);
  return {header:-1, date, amount, debit:-1, credit:-1, descs:descs.slice(0,2), descAlt:[], cat:-1, person:-1, mode:"single"};
}
function extract(rows, map){
  const out=[];
  for(let i=map.header+1;i<rows.length;i++){
    const r=rows[i]; if(!r) continue;
    const d=parseDate(r[map.date]); if(!d) continue;
    let amt;
    if(map.mode==="split"){ const db=parseNum(r[map.debit]), cr=parseNum(r[map.credit]); if(db==null&&cr==null) continue; amt=(cr?Math.abs(cr):0)-(db?Math.abs(db):0); }
    else { amt=parseNum(r[map.amount]); if(amt==null) continue; if(map.flip) amt=-amt; }
    if(!amt) continue;
    const join=cols=>(cols||[]).map(c=>String(r[c]??"").trim()).filter(Boolean).join(" · ");
    const desc=(join(map.descs)||join(map.descAlt)).replace(/\s+/g," ").slice(0,140) || "(no description)";
    const row=[d, desc, Math.round(amt*100)/100, map.cat>=0?normCat(r[map.cat]):""];
    if(map.person>=0){ const pv=String(r[map.person]??"").trim(); if(pv) row.person=pv.slice(0,30); }
    out.push(row);
  }
  return out;
}
function normCat(v){ const s=String(v??"").trim().toLowerCase(); if(!s) return ""; return CATS.find(c=>c.toLowerCase()===s)||CATS.find(c=>c.toLowerCase().startsWith(s.slice(0,5)))||""; }

/* ---------- PDF ---------- */
const PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let pdfReady=null;
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("Couldn't load the PDF reader. Check your connection and try again.")); document.head.appendChild(s); }); }
function loadPdfJs(){
  if(!pdfReady) pdfReady=(async()=>{ await loadScript(PDFJS+"pdf.min.js"); await loadScript(PDFJS+"pdf.worker.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js"; return window.pdfjsLib; })().catch(e=>{ pdfReady=null; throw e; });
  return pdfReady;
}
async function pdfToRows(p, password){
  const lib=await loadPdfJs();
  const doc=await lib.getDocument({data:new Uint8Array(p.buf.slice(0)), password:password||undefined, isEvalSupported:false}).promise;
  const pages=[]; let full="";
  for(let i=1;i<=doc.numPages;i++){
    const pg=await doc.getPage(i); const tc=await pg.getTextContent();
    pages.push(tc.items.map(it=>({str:it.str, x:it.transform[4], y:it.transform[5], w:it.width||0})));
    full+=tc.items.map(it=>it.str).join(" ")+"\n";
  }
  const r=parsePdfLines(groupPdfItems(pages), full);
  p.locked=false; p.pdfKind=r.kind; p.noText=!full.replace(/\s/g,"").length;
  if(!p.account){ const m=full.match(/\b(\d{3}-\d{5,7}-\d|\d{4}-\d{4}-\d{4}-\d{4})\b/); if(m) p.account=m[1]; }
  p.rows=[["Date","Description","Amount"],...r.tx];
  p.map={header:0,date:0,descs:[1],descAlt:[],amount:2,debit:-1,credit:-1,cat:-1,person:-1,mode:"single",flip:false};
  if(r.kind==="card"&&r.tx.length){ const pos=r.tx.filter(t=>t[2]>0).length/r.tx.length; if(pos>.6) p.map.flip=true; }
}
async function readWithAI(p){
  if(!S.ai){ toast("PDF reading needs Workers AI turned on for this site"); return; }
  if(p.buf.byteLength>8e6){ toast("That PDF is over 8 MB. Try the bank's CSV export instead."); return; }
  p.busy="Reading the statement with AI…"; renderUpload();
  try{
    const bytes=new Uint8Array(p.buf); let bin=""; for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    const res=await api("POST","/api/pdf",{name:p.name,data:btoa(bin)});
    const tx=(res.transactions||[]).filter(t=>Array.isArray(t)&&parseDate(t[0])&&typeof t[2]==="number"&&t[2]).map(t=>[parseDate(t[0]), String(t[1]||"(no description)").slice(0,140), Math.round(t[2]*100)/100]);
    p.rows=[["Date","Description","Amount"],...tx]; p.map={header:0,date:0,descs:[1],descAlt:[],amount:2,debit:-1,credit:-1,cat:-1,person:-1,mode:"single",flip:false}; p.viaAI=true;
  }catch(e){ toast("Couldn't read it: "+e.message); }
  p.busy=null; renderUpload();
}

/* ---------- reading files ---------- */
function readSheet(f){
  return new Promise((res,rej)=>{
    const r=new FileReader(); const isCsv=/\.csv$|text/i.test(f.name+f.type) && !/\.xlsx?$/i.test(f.name);
    r.onerror=()=>rej(new Error("Couldn't read "+f.name));
    r.onload=()=>{ try{
      if(typeof XLSX==="undefined") throw new Error("The spreadsheet reader didn't load. Check your connection and reload.");
      const wb = isCsv ? XLSX.read(r.result,{type:"string",raw:true}) : XLSX.read(r.result,{type:"array",cellDates:true});
      let best=[]; wb.SheetNames.forEach(n=>{ const a=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:""}); if(a.length>best.length) best=a; });
      res(best);
    }catch(e){ rej(e); } };
    isCsv ? r.readAsText(f) : r.readAsArrayBuffer(f);
  });
}
function defaultPerson(){ const people=[...new Set(S.files.map(x=>x.person))]; return S.upPerson||S.me.name||people[0]||"Me"; }
async function handleFiles(list){
  openUpload();
  for(const f of list){
    const p={id:Math.random().toString(36).slice(2,10), name:f.name, person:defaultPerson(), account:""};
    try{
      if(/\.pdf$/i.test(f.name)||f.type==="application/pdf"){
        p.pdf=true; p.buf=await f.arrayBuffer(); S.pending.push(p); p.busy="Reading PDF…"; renderUpload();
        try{ await pdfToRows(p); }
        catch(e){ if(e&&e.name==="PasswordException"){ p.locked=true; p.pwBad=e.code===2; p.rows=[]; p.map={header:-1,date:0,descs:[],amount:0,mode:"single"}; } else { S.pending=S.pending.filter(x=>x!==p); toast(e.message||"Couldn't read that PDF"); } }
        p.busy=null;
      } else {
        p.rows=await readSheet(f); p.map=detect(p.rows);
        p.account=accountFromRows(p.rows,p.map.header);
        const tx=extract(p.rows,p.map);
        if(p.map.mode==="single"&&tx.length){ const pos=tx.filter(t=>t[2]>0).length/tx.length; if(pos>.8) p.map.flip=true; }
        S.pending.push(p);
      }
    }catch(e){ toast(e.message||"Couldn't read that file"); }
  }
  renderUpload();
}
$("fileIn").onchange=e=>{ handleFiles([...e.target.files]); e.target.value=""; };

/* ---------- server ---------- */
async function api(method, path, body){
  let r;
  try{ r=await fetch(path,{method, headers:body?{"content-type":"application/json"}:{}, body:body?JSON.stringify(body):undefined, credentials:"same-origin"}); }
  catch(e){ throw new Error("You seem to be offline. Check your connection."); }
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok){ const err=new Error((j&&j.error)||("Server error "+r.status)); err.status=r.status; err.login=!!(j&&j.login); throw err; }
  return j;
}
function setSave(t){ $("saveState").textContent=t; $("saveStateSide").textContent=t; }
async function createFile(file){
  try{ const r=await api("POST","/api/files",{id:file.id,name:file.name,person:file.person,account:file.account||"",added:file.added,shared:false,tx:file.tx}); file.id=r.id; setSave("Saved"); }
  catch(e){ setSave("Couldn't save: "+e.message); }
}
const saveQ=new Map(); let saveT;
function saveFile(file){
  if(!file||file.example||!file.mine) return;
  saveQ.set(file.id,file); clearTimeout(saveT);
  saveT=setTimeout(async()=>{ const list=[...saveQ.values()]; saveQ.clear(); setSave("Saving…");
    try{ for(const f of list) await api("PUT","/api/files/"+encodeURIComponent(f.id),{tx:f.tx}); setSave("Saved"); }
    catch(e){ setSave("Couldn't save: "+e.message); } },400);
}
async function patchFile(file, body, msg){
  try{ await api("PUT","/api/files/"+encodeURIComponent(file.id),body); Object.assign(file,body); invalidate(); render(); if(msg) toast(msg); }
  catch(e){ toast("Couldn't save: "+e.message); render(); }
}
async function removeFile(file){
  try{ await api("DELETE","/api/files/"+encodeURIComponent(file.id)); S.files=S.files.filter(f=>f!==file); refreshFam(); invalidate(); render(); toast("Removed "+file.name); }
  catch(e){ toast("Couldn't remove: "+e.message); }
}
let ruleQ={}, ruleT;
function setRules(map){
  for(const [k,v] of Object.entries(map)){ S.rules[k]=typeof v==="string"?v:v.c; }
  Object.assign(ruleQ,map); clearTimeout(ruleT);
  ruleT=setTimeout(async()=>{ const set=ruleQ; ruleQ={}; try{ await api("POST","/api/rules",{set}); }catch(e){ setSave("Couldn't save merchant rules: "+e.message); } },300);
}
function saveBudgets(scope, data){ return api("PUT","/api/budgets",{scope,data}).catch(e=>toast("Couldn't save: "+e.message)); }
function refreshFam(){
  const own=new Map(); S.files.forEach(f=>f.tx.forEach(t=>{ const k=txKey(t); own.set(k,(own.get(k)||0)+1); }));
  S.famView=S.family.map(f=>{ const left=new Map(own); return {...f, tx:f.tx.filter(t=>{ const k=txKey(t), n=left.get(k)||0; if(n>0){ left.set(k,n-1); return false; } return true; })}; }).filter(f=>f.tx.length);
}
async function loadData(){
  const d=await api("GET","/api/data");
  S.rules=d.rules||{}; S.notes=d.notes||{}; S.meta=d.meta||{}; S.lookups=d.lookups||{};
  S.budgets=d.budgets||{}; S.goals=Array.isArray(S.budgets.goals)?S.budgets.goals:[]; delete S.budgets.goals;
  S.files=(d.files||[]).filter(f=>f.mine).map(f=>({...f,mine:true}));
  S.family=(d.files||[]).filter(f=>!f.mine).map(f=>({...f,ro:true}));
  let changed=0;
  S.files.forEach(f=>{ let ch=false; f.tx.forEach(t=>{
    const k=merchantKey(t[1]);
    // PayNow to people used to be guessed as "Transfers"; they are "People" now
    if(t[3]==="Transfers"&&t[4]===1&&!S.rules[k]&&parseDesc(t[1]).kind==="paynow"){ t[3]="People"; ch=true; }
    if(t[3]==="Other"||t[4]===1){ const c=S.rules[k]; if(c&&c!==t[3]){ setCat(t,c,0); ch=true; changed++; } }
  }); if(ch) saveFile(f); });
  refreshFam(); invalidate();
  return changed;
}

/* ---------- example data ---------- */
function isExample(){ return !S.files.length && !S.famView.length; }
function exampleFiles(){
  if(S.ex) return S.ex;
  const out=[]; const people=["Me","Mum"];
  const base=new Date(); base.setDate(1);
  const items={Me:[["MINDEF NS ALLOWANCE",+1200,1],["MST GRAB* A-9TNTTNG SI SGP",-14.6,9],["MST MCDONALD'S (PRWP) SI SGP",-9.8,6],["SPOTIFY P3D2A",-11.98,1],["BAT SHOPEE SG MP Singapore SGP",-42.5,2],["MOOMOO SG FUND TRANSFER",-300,1],["KOI THE TAMPINES",-4.9,5],["TCG CARDS CARD SHOP",-68,1],["MST BUS/MRT 943155847 SI SGP",-28.4,1],["GOLDEN VILLAGE",-15.5,1],["ICT PayNow Transfer 6755039 To: JOHN TAN",-40,1],["ICT PayNow Transfer 8415015 To: AISG E-COMMERCE PRIVATE LI",-23.9,1]],
             Mum:[["SALARY ABC PTE LTD",+4800,1],["NTUC FAIRPRICE",-86.3,4],["SHENG SIONG",-54.2,3],["SP SERVICES",-138.6,1],["SINGTEL MOBILE",-45,1],["NETFLIX.COM",-18.98,1],["GREAT EASTERN LIFE",-220,1],["GUARDIAN HEALTH",-23.4,1],["KOUFU FOODCOURT",-7.2,8],["UNIQLO ION",-59.9,1],["ENDOWUS FUND",-800,1]]};
  people.forEach(p=>{ const tx=[];
    for(let m=3;m>=0;m--){ const d0=new Date(base.getFullYear(),base.getMonth()-m,1); const lastDay=m===0?Math.max(2,new Date().getDate()):28;
      items[p].forEach(([desc,amt,n],k)=>{ for(let j=0;j<n;j++){ const day=Math.min(lastDay,1+((k*7+j*5+m*3)%27)); const wob=Math.abs(amt)<100?(1+((k+j+m)%5-2)*.08):1;
        tx.push([iso(d0.getFullYear(),d0.getMonth()+1,day),desc,Math.round(amt*wob*100)/100,""]); } }); }
    tx.forEach(t=>{ const [c,u]=autoCategory(t[1],t[2],{}); setCat(t,c,u); });
    out.push({id:"ex-"+p,name:`Example ${p} statement.csv`,person:p,account:p==="Me"?"…123-4":"…987-6",example:true,tx}); });
  S.ex=out; return out;
}

/* ---------- the numbers ---------- */
let TXC=null;
function invalidate(){ TXC=null; }
function srcFiles(){ return isExample()?exampleFiles():[...S.files,...S.famView]; }
function allTx(){
  if(TXC) return TXC;
  const out=[];
  srcFiles().forEach(f=>{ const first=f.tx.reduce((m,t)=>!m||t[0]<m?t[0]:m,""); f.tx.forEach((t,i)=>{
    const key=merchantKey(t[1]); const meta=S.meta[key]||{}; const pd=purchaseDate(t[0],t[1]);
    const share=t[5]||(meta.share&&S.rules[key]===t[3]?meta.share:"");
    out.push({id:f.id+":"+i, date:pd<first?t[0]:pd, post:t[0], desc:t[1], raw:t[2], amt:applyShare(t[2],share), share, cat:t[3]||"Other", unsure:t[4]===1,
      person:f.person, acct:f.account||f.name, file:f, idx:i, ro:!!f.ro, key, tag:meta.tag||""});
  }); });
  const pairs=pairTransfers(out.filter(t=>["Transfers","People","Income","Other"].includes(t.cat)));
  out.forEach(t=>{ t.pair=pairs.get(t.id)||null; });
  TXC=out; return out;
}
const byPerson=tx=>S.person==="All"?tx:tx.filter(t=>t.person===S.person);
const inMonth=(tx,m=S.month)=>m==="all"?tx:tx.filter(t=>t.date.startsWith(m));
function months(tx){ return [...new Set(tx.map(t=>t.date.slice(0,7)))].sort(); }
function mine(){ return byPerson(allTx()); }
function scoped(){ return inMonth(mine()); }
function kindOf(t){
  if(t.pair||t.cat==="Transfers") return "own";
  if(t.cat==="Investing") return "invest";
  if(t.cat==="People") return "people";
  if(t.cat==="Income") return "income";
  return "spend";
}
const isSpend=t=>kindOf(t)==="spend";
function totals(tx){
  const o={spend:0,inc:0,invIn:0,invOut:0,pplOut:0,pplIn:0,ownOut:0,ownIn:0,nOwn:0};
  tx.forEach(t=>{ const k=kindOf(t);
    if(k==="spend"){ o.spend-=t.amt; if(t.share&&t.raw<0) o.pplOut+=t.amt-t.raw; }
    else if(k==="income") o.inc+=t.amt;
    else if(k==="invest"){ if(t.amt<0) o.invIn-=t.amt; else o.invOut+=t.amt; }
    else if(k==="people"){ if(t.amt<0) o.pplOut-=t.amt; else o.pplIn+=t.amt; }
    else { if(t.amt<0) o.ownOut-=t.amt; else o.ownIn+=t.amt; o.nOwn++; }
  });
  o.inv=o.invIn-o.invOut; o.moneyIn=o.inc+o.pplIn; o.out=o.spend+Math.max(0,o.inv)+o.pplOut; o.left=o.moneyIn-o.spend-o.pplOut;
  return o;
}
function spendByCat(tx){ const o={}; tx.filter(isSpend).forEach(t=>{ o[t.cat]=(o[t.cat]||0)-t.amt; }); for(const k in o) if(o[k]<=0.004) delete o[k]; return o; }
function prevMonths(m, n=3){ const ms=months(mine()).filter(x=>x<m); return ms.slice(-n); }
function usualFor(m){
  const ms=prevMonths(m); if(!ms.length) return null;
  const all=mine(); const cats={}; let tot=0;
  ms.forEach(x=>{ const tx=inMonth(all,x); tot+=totals(tx).spend; const c=spendByCat(tx); for(const k in c) cats[k]=(cats[k]||0)+c[k]; });
  for(const k in cats) cats[k]/=ms.length;
  return {total:tot/ms.length, cats, n:ms.length};
}
function lastDate(tx){ return tx.reduce((m,t)=>t.post>m?t.post:m,""); }
function recurring(){
  const g={}; mine().filter(isSpend).forEach(t=>{ (g[t.key]=g[t.key]||[]).push(t); });
  return Object.entries(g).map(([k,a])=>{
    const ms=new Set(a.map(t=>t.date.slice(0,7))); const tot=a.reduce((s,t)=>s-t.amt,0); const avg=tot/a.length;
    const amts=a.map(t=>-t.amt); const spread=Math.max(...amts)-Math.min(...amts);
    const monthly=ms.size>=2&&a.length<=ms.size+1&&spread<=Math.max(2,avg*.15);
    const subs=a.some(t=>t.cat==="Subscriptions");
    const tag=monthly?"monthly":a.length>1?"usage":"once";
    const last=a.map(t=>t.date).sort().pop();
    return {k, n:a.length, ms:ms.size, tot, avg, monthly, subs, tag, last, cat:a[0].cat, desc:a[0].desc};
  }).filter(r=>(r.monthly||r.subs)&&r.tot>0).sort((a,b)=>b.tot-a.tot);
}
function upcoming(){
  const today=new Date().toISOString().slice(0,10);
  return recurring().filter(r=>r.monthly).map(r=>{
    const d=new Date(r.last+"T00:00:00"); let nx=new Date(d.getFullYear(),d.getMonth()+1,Math.min(d.getDate(),28));
    const ymd=x=>x.getFullYear()+"-"+pad(x.getMonth()+1)+"-"+pad(x.getDate());
    while(ymd(nx)<today) nx=new Date(nx.getFullYear(),nx.getMonth()+1,nx.getDate());
    return {...r,next:ymd(nx)};
  }).sort((a,b)=>a.next.localeCompare(b.next));
}
function peopleList(){ return [...new Set(srcFiles().map(f=>f.person))]; }
function niceName(k){ return k.replace(/^TRANSFER /,"Account ").replace(/\b(\d{3}-\d{5,7}-\d)\b/,m=>"…"+m.slice(-5)); }

/* ---------- navigation ---------- */
const TABS=[["home","Overview","i-home"],["spend","Spending","i-spend"],["moves","Money moves","i-moves"],["goals","Goals","i-goals"]];
const SUBS={spend:[["cats","Categories"],["bills","Bills"],["sort","To sort"]], moves:[["in","Money in"],["accounts","Accounts"],["investing","Investing"],["people","People"]], goals:[["limits","Limits"],["goals","Goals"]]};
function go(tab, sub){ S.tab=tab; if(sub) S.sub[tab]=sub; const h="#"+tab+(SUBS[tab]?"/"+S.sub[tab]:""); if(location.hash!==h) history.replaceState(null,"",h); render(); window.scrollTo({top:0}); }
function readHash(){ const [t,s]=location.hash.slice(1).split("/"); if(TABS.some(x=>x[0]===t)){ S.tab=t; if(s&&SUBS[t]&&SUBS[t].some(x=>x[0]===s)) S.sub[t]=s; } }
window.addEventListener("hashchange",()=>{ readHash(); render(); });
function sortGroups(includeGuesses){
  const g={};
  S.files.forEach(f=>f.tx.forEach(t=>{ const unsure=t[4]===1; if(!(t[3]==="Other"||(includeGuesses&&unsure))) return;
    const k=merchantKey(t[1]); const o=g[k]=g[k]||{k,items:[],out:0,inn:0,people:new Set(),cat:t[3],guess:unsure&&t[3]!=="Other"};
    o.items.push({t,f}); if(t[2]<0) o.out-=t[2]; else o.inn+=t[2]; o.people.add(f.person); }));
  return Object.values(g).sort((a,b)=>(S.skipped.has(a.k)-S.skipped.has(b.k))||(b.out+b.inn)-(a.out+a.inn));
}
function renderNav(){
  const n=sortGroups(false).length;
  const btn=([id,label,ic])=>`<button type="button" data-tab="${id}" ${S.tab===id?'aria-current="page"':""}><svg class="i"><use href="#${ic}"/></svg>${label}${id==="spend"&&n?`<span class="badge" aria-label="${n} to sort">${n}</span>`:""}</button>`;
  $("tabbar").innerHTML=TABS.map(btn).join(""); $("sideNav").innerHTML=TABS.map(btn).join("");
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>go(b.dataset.tab));
  const subs=SUBS[S.tab]; const st=$("subtabs"); st.hidden=!subs;
  if(subs){ st.innerHTML=subs.map(([id,l])=>`<button role="tab" type="button" aria-selected="${S.sub[S.tab]===id}" data-sub="${id}">${l}${id==="sort"&&n?` <span class="badge">${n}</span>`:""}</button>`).join("");
    st.querySelectorAll("[data-sub]").forEach(b=>b.onclick=()=>go(S.tab,b.dataset.sub)); }
}
function renderHead(){
  const people=peopleList();
  if(S.person!=="All"&&!people.includes(S.person)) S.person="All";
  $("who").hidden=people.length<2;
  $("who").innerHTML=["All",...people].map(p=>`<button type="button" aria-pressed="${p===S.person}" data-p="${esc(p)}">${esc(p==="All"?"Everyone":p)}</button>`).join("");
  $("who").querySelectorAll("button").forEach(b=>b.onclick=()=>{ S.person=b.dataset.p; render(); });
  const ms=months(allTx());
  if(!S.month||(S.month!=="all"&&!ms.includes(S.month))) S.month=ms[ms.length-1]||"all";
  $("monthSel").innerHTML=ms.slice().reverse().map(m=>`<option value="${m}" ${m===S.month?"selected":""}>${monthLabel(m,1)}</option>`).join("")+`<option value="all" ${S.month==="all"?"selected":""}>All time</option>`;
  const T=TABS.find(t=>t[0]===S.tab)[1];
  $("title").textContent = S.tab==="home" ? (S.month==="all"?"All time":monthLabel(S.month,1)) : T;
  $("exampleBanner").hidden=!isExample();
  $("whoSide").innerHTML=S.me.email?`${esc(S.me.email)} · <button class="link" type="button" data-signout>Sign out</button>`:"";
  document.querySelectorAll("[data-signout]").forEach(b=>b.onclick=signOut);
}
$("monthSel").onchange=e=>{ S.month=e.target.value; render(); };
$("addTop").onclick=$("addSide").onclick=()=>openUpload();

/* ---------- render ---------- */
function render(){
  invalidate(); renderHead(); renderNav();
  const v=$("view");
  if(S.tab==="home") v.innerHTML=homeHTML();
  else if(S.tab==="spend") v.innerHTML=S.sub.spend==="cats"?catsHTML():S.sub.spend==="bills"?billsHTML():sortHTML();
  else if(S.tab==="moves") v.innerHTML={in:moneyInHTML,accounts:accountsHTML,investing:investHTML,people:peopleHTML}[S.sub.moves]();
  else v.innerHTML=S.sub.goals==="limits"?limitsHTML():goalsHTML();
  bindView(v);
}
function bindView(v){
  v.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{ const [t,s]=b.dataset.go.split("/"); if(b.dataset.open) S.open=b.dataset.open; go(t,s); });
  v.querySelectorAll("[data-grp]").forEach(b=>b.onclick=()=>{ S.open=S.open===b.dataset.grp?null:b.dataset.grp; render(); });
  v.querySelectorAll("[data-tx]").forEach(b=>b.onclick=()=>{ const t=allTx().find(x=>x.id===b.dataset.tx); if(t) openIdentifyTx(t); });
  v.querySelectorAll("[data-key]").forEach(b=>b.onclick=()=>openIdentifyKey(b.dataset.key, !!b.dataset.queue));
  v.querySelectorAll("[data-more]").forEach(b=>b.onclick=()=>{ S.showAll[b.dataset.more]=1; render(); });
  v.querySelectorAll("[data-by]").forEach(b=>b.onclick=()=>{ S.by=b.dataset.by; S.open=null; render(); });
  const q=v.querySelector("#q"); if(q){ q.oninput=()=>{ S.q=q.value; const box=$("qres"); if(box){ box.innerHTML=searchHTML(); bindView(box); } }; }
  const h={aiSort:()=>lookupGroups(sortGroups(false).slice(0,60)), aiTips:openTips, editLimits:()=>openLimits(false), suggestLimits:()=>openLimits(true), exportCsv:exportCsv, upload:()=>openUpload(),
    famRefresh:async()=>{ try{ await loadData(); render(); toast("Family statements refreshed"); }catch(e){ toast("Couldn't refresh: "+e.message); } }};
  v.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>h[b.dataset.act]&&h[b.dataset.act]());
  v.querySelectorAll("[data-goal]").forEach(b=>b.onclick=()=>openGoal(b.dataset.goal));
  v.querySelectorAll("[data-newgoal]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); openGoal(null,b.dataset.newgoal); });
  v.querySelectorAll("[data-whose]").forEach(b=>b.onclick=()=>whose(b.dataset.k,b.dataset.whose));
  v.querySelectorAll("[data-file]").forEach(b=>b.onclick=()=>fileAction(b));
}

/* ---------- charts ---------- */
function ringSVG(parts, scale, tickFrac, size=220, r=88, w=22){
  const C=2*Math.PI*r, c=size/2; let acc=0, g=`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--raise)" stroke-width="${w}"/>`;
  parts.forEach(([col,v,label])=>{ const len=Math.min(v/scale*C, Math.max(0,C-acc)); if(len<=0.5) return;
    g+=`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${Math.max(0.5,len-1.5).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 ${c} ${c})"><title>${esc(label||"")}</title></circle>`; acc+=len; });
  if(tickFrac!=null){ const a=Math.min(1,tickFrac)*2*Math.PI-Math.PI/2; g+=`<line x1="${(c+(r-w/2-6)*Math.cos(a)).toFixed(1)}" y1="${(c+(r-w/2-6)*Math.sin(a)).toFixed(1)}" x2="${(c+(r+w/2+4)*Math.cos(a)).toFixed(1)}" y2="${(c+(r+w/2+4)*Math.sin(a)).toFixed(1)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`; }
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${g}</svg>`;
}
function niceTop(mx){ const step=Math.pow(10,Math.floor(Math.log10(Math.max(1,mx)))); const nice=[1,2,2.5,5,10].map(x=>x*step).find(x=>mx/x<=4)||step*10; return {top:Math.max(nice,Math.ceil(mx/nice)*nice), nice}; }
function inOutChart(data){
  const W=Math.max(340,data.length*74+62),H=232,pl=54,pr=8,pt=12,pb=34;
  const {top,nice}=niceTop(Math.max(1,...data.map(d=>Math.max(d.inn,d.out))));
  const y=v=>pt+(H-pt-pb)*(1-v/top); const bw=(W-pl-pr)/data.length; const b=Math.min(28,bw*.3);
  let g=""; for(let v=0;v<=top+1e-9;v+=nice) g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${fmt(v,1)}</text>`;
  data.forEach((d,i)=>{ const cx=pl+bw*i+bw/2;
    g+=`<rect x="${cx-b-1}" y="${y(d.inn)}" width="${b}" height="${Math.max(0,y(0)-y(d.inn))}" rx="3" fill="var(--in)"><title>${monthLabel(d.m)} in: ${fmt(d.inn)}</title></rect>`;
    g+=`<rect x="${cx+1}" y="${y(d.out)}" width="${b}" height="${Math.max(0,y(0)-y(d.out))}" rx="3" fill="var(--out)"><title>${monthLabel(d.m)} out: ${fmt(d.out)}</title></rect>`;
    const net=d.inn-d.out; g+=`<text x="${cx}" y="${H-18}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted)">${monthLabel(d.m)}</text><text x="${cx}" y="${H-4}" text-anchor="middle" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="${net>=0?"var(--in)":"var(--out-ink)"}">${net>=0?"+":"−"}${fmt(Math.abs(net),1)}</text>`; });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${Math.round(W*1.5)}px" role="img" aria-label="Money in and money out per month">${g}</svg></div>`;
}
function catBar(c, v, max, usual, opts={}){
  const over=usual!=null&&v>usual*1.05;
  return `<${opts.tag||"div"} class="cbar" ${opts.attrs||""}>${catIcon(c)}<span style="min-width:0"><span class="nm">${esc(opts.label||catName(c))}</span>
    <span class="track"><b style="width:${Math.min(100,v/max*100).toFixed(1)}%;background:${catCol(c)}"></b>${usual!=null?`<u style="left:${Math.min(99,usual/max*100).toFixed(1)}%"></u>`:""}</span></span>
    <span class="amt" style="${over?"color:var(--out-ink)":""}">${money(v)}</span></${opts.tag||"div"}>`;
}
const calIcon=d=>{ const x=new Date(d+"T00:00:00"); return `<span class="cal"><b>${x.getDate()}</b><span>${x.toLocaleDateString("en-SG",{month:"short"})}</span></span>`; };

/* ---------- Overview ---------- */
function homeHTML(){
  const tx=scoped(); const T=totals(tx); const m=S.month;
  const byCat=Object.entries(spendByCat(tx)).sort((a,b)=>b[1]-a[1]);
  const U=m!=="all"?usualFor(m):null;
  const cur=m===ymNow(); const ld=lastDate(tx); const day=cur&&ld?+ld.slice(8,10):null; const D=m!=="all"?dim(m):null;
  const scale=Math.max(U?U.total:T.spend, T.spend, 1);
  const tick=U&&cur&&day?(U.total*day/D)/scale:(U&&T.spend>U.total?U.total/scale:null);
  const ring=ringSVG(byCat.map(([c,v])=>[catCol(c),v,`${catName(c)} ${money(v)}`]), scale, tick);
  const facts=[];
  if(cur&&day){ const pace=T.spend/day*D; facts.push(`<span class="fact ${U&&pace>U.total*1.05?"warn":"ok"}">On pace for ${money(pace)}</span>`, `<span class="fact">Day ${day} / ${D}</span>`);
    if(U){ const left=U.total-T.spend; facts.push(left>0?`<span class="fact">${money(left/Math.max(1,D-day))}/day to stay at usual</span>`:`<span class="fact warn">${money(-left)} over usual</span>`); } }
  else if(U&&U.total>0){ const d=Math.round((T.spend/U.total-1)*100); facts.push(`<span class="fact ${d>5?"warn":"ok"}">${Math.abs(d)}% ${d>=0?"above":"below"} usual</span>`); }
  const max=Math.max(1,...byCat.map(x=>Math.max(x[1],U&&U.cats[x[0]]||0)));
  const cats=byCat.slice(0,7).map(([c,v])=>catBar(c,v,max,U?U.cats[c]||0:null,{tag:"button",attrs:`type="button" data-go="spend/cats" data-open="${esc(c)}"`})).join("");
  const outParts=[["Spent",T.spend,"var(--out)"],["Invested",Math.max(0,T.inv),"var(--accent)"],["To people",T.pplOut,"var(--people)"]].filter(x=>x[1]>0.004);
  const outTot=outParts.reduce((s,x)=>s+x[1],0);
  const bills=upcoming().slice(0,3);
  const all=mine(); const allMs=months(all); const ms=allMs.slice(-6); const inv=ms.map(x=>({m:x,v:Math.max(0,totals(inMonth(all,x)).inv)})); const invMax=Math.max(1,...inv.map(x=>x.v));
  const invTot=totals(all).inv;
  const left=`<div class="card"><div class="ringwrap"><div class="ring">${ring}<div class="c"><span class="label">Spent</span><b>${money(T.spend)}</b><span class="small muted">${U?`usual ${money(U.total)}`:m==="all"?`over ${months(tx).length} months`:"first month"}</span></div></div>${facts.length?`<div class="facts">${facts.join("")}</div>`:""}</div></div>
    <div class="card"><div class="row between"><h2>Where it went</h2>${U?`<span class="usual"><i></i>usual</span>`:""}</div>${cats||`<p class="small muted">No spending in this period.</p>`}
      ${byCat.length>7?`<button class="link" type="button" data-go="spend/cats">All ${byCat.length} categories</button>`:""}</div>`;
  const right=`<div class="card"><div class="row between"><h2>Money out</h2><span class="mono">${money(outTot)}</span></div>
      <div class="stackbar" role="img" aria-label="${outParts.map(x=>x[0]+" "+money(x[1])).join(", ")}">${outParts.map(x=>`<i style="width:${(x[1]/Math.max(1,outTot)*100).toFixed(1)}%;background:${x[2]}"></i>`).join("")}</div>
      <div class="leg">${outParts.map(x=>`<div><span><i style="background:${x[2]}"></i>${x[0]}</span><span>${money(x[1])}</span></div>`).join("")||`<p class="small muted">Nothing went out.</p>`}</div>
      ${T.nOwn?`<button class="link" type="button" data-go="moves/accounts">${money(Math.max(T.ownIn,T.ownOut))} moved between your accounts · not counted</button>`:""}</div>
    <button class="cardlink" type="button" data-go="moves/in"><span><span class="label">Money in</span><br><b class="mono" style="font-size:22px;color:var(--in)">${money(T.moneyIn)}</b></span><span style="text-align:right"><span class="label">Left over</span><br><b class="mono" style="font-size:22px;${T.left<0?"color:var(--out-ink)":""}">${T.left<0?"−":""}${money(Math.abs(T.left))}</b></span></button>
    ${bills.length?`<div class="card"><div class="row between"><h2>Coming up</h2><button class="link" type="button" data-go="spend/bills">All bills</button></div>${bills.map(b=>`<div class="bill">${calIcon(b.next)}<span class="nm">${esc(niceName(b.k))}</span><span class="a">${fmt(b.avg)}</span></div>`).join("")}</div>`:""}
    ${invTot>0?`<button class="cardlink" type="button" data-go="moves/investing"><span><span class="label">Invested since ${monthLabel(allMs[0])}</span><br><b class="mono" style="font-size:22px">${money(invTot)}</b></span><span class="minibars" aria-hidden="true">${inv.map(x=>`<span><i style="height:${Math.max(3,Math.round(x.v/invMax*34))}px"></i>${monthLabel(x.m)[0]}</span>`).join("")}</span></button>`:""}
    ${S.ai&&!isExample()?`<div class="card flat"><div class="row between"><span><b>Ask AI for tips</b><br><span class="small muted">Uses totals only, never your transactions.</span></span><button class="btn sm" type="button" data-act="aiTips">Get tips</button></div></div>`:""}`;
  return `${limitAlerts()}<div class="grid two"><div class="stack">${left}</div><div class="stack">${right}</div></div>`;
}
function limitAlerts(){
  if(isExample()||S.month==="all") return "";
  const B=S.budgets[S.person]||{}; if(!Object.keys(B).length) return "";
  const tx=scoped(); const sp=spendByCat(tx); const T=totals(tx);
  const over=Object.entries(B).filter(([c,b])=>c!=="Total"&&(sp[c]||0)>b).map(([c,b])=>`${catName(c)} ${money(sp[c])} of ${money(b)}`);
  if(B.Total&&T.spend>B.Total) over.unshift(`Total ${money(T.spend)} of ${money(B.Total)}`);
  return over.length?`<div class="alert bad" role="alert"><b>Over your limit</b><span>${esc(over.join(" · "))}</span></div>`:"";
}

/* ---------- Spending › Categories ---------- */
function catsHTML(){
  const tx=scoped(); const sp=tx.filter(isSpend); const tot=sp.reduce((s,t)=>s-t.amt,0);
  const U=S.month!=="all"?usualFor(S.month):null;
  const g={}; sp.forEach(t=>{ const k=S.by==="category"?t.cat:t.key; (g[k]=g[k]||[]).push(t); });
  const list=Object.entries(g).map(([k,items])=>({k,items,sum:-items.reduce((s,t)=>s+t.amt,0)})).filter(x=>Math.abs(x.sum)>0.004).sort((a,b)=>b.sum-a.sum);
  const lim=S.by==="merchant"&&!S.showAll.shops?25:999;
  const max=Math.max(1,...list.map(x=>Math.max(x.sum,S.by==="category"&&U?U.cats[x.k]||0:0)));
  const rows=list.slice(0,lim).map(x=>{ const c=S.by==="category"?x.k:x.items[0].cat; const usual=S.by==="category"&&U?U.cats[x.k]||0:null; const open=S.open===x.k;
    const its=x.items.slice().sort((a,b)=>b.date.localeCompare(a.date)); const more=its.length>8&&!S.showAll["g:"+x.k];
    return `<div class="grp"><button type="button" data-grp="${esc(x.k)}" aria-expanded="${open}">${catIcon(c)}<span style="min-width:0"><span class="nm">${esc(S.by==="category"?catName(x.k):niceName(x.k))} <span class="tiny muted">×${x.items.length}</span></span>
      <span class="track"><b style="width:${Math.min(100,Math.max(0,x.sum)/max*100).toFixed(1)}%;background:${catCol(c)}"></b>${usual!=null?`<u style="left:${Math.min(99,usual/max*100).toFixed(1)}%"></u>`:""}</span></span>
      <span class="amt" style="${usual!=null&&x.sum>usual*1.05?"color:var(--out-ink)":""}">${money(x.sum)}</span></button>
      ${open?`<div class="items">${(more?its.slice(0,8):its).map(itemHTML).join("")}${more?`<button class="link" type="button" data-more="g:${esc(x.k)}">Show all ${its.length}</button>`:""}</div>`:""}</div>`; }).join("");
  return `<div class="card"><div class="row between"><span><span class="label">${S.month==="all"?"All time":monthLabel(S.month,1)}</span><br><span class="big">${money(tot)}</span></span>
      <span class="chips"><button class="chip" type="button" data-by="category" aria-pressed="${S.by==="category"}">By category</button><button class="chip" type="button" data-by="merchant" aria-pressed="${S.by==="merchant"}">By shop</button></span></div>
    <label class="row" style="gap:8px;flex-wrap:nowrap"><svg class="i" style="color:var(--muted)"><use href="#i-search"/></svg><input id="q" class="search" type="text" placeholder="Search all transactions" aria-label="Search all transactions" value="${esc(S.q)}" style="flex:1"></label>
    <div id="qres">${S.q?searchHTML():""}</div>
    <div>${rows||`<p class="small muted">No spending in this period.</p>`}</div>
    ${list.length>lim?`<button class="link" type="button" data-more="shops">Show all ${list.length} shops</button>`:""}
    ${U&&S.by==="category"?`<span class="usual"><i></i>usual for a month (average of the ${U.n} before)</span>`:""}</div>`;
}
function itemHTML(t, showCat){
  return `<button class="it" type="button" data-tx="${esc(t.id)}"><span class="d"><b>${dayMon(t.date)}</b>${showCat?`<span class="t" style="color:${catCol(t.cat)}">${esc(catName(t.cat))}</span> `:""}${esc(niceName(t.key))}${t.share?` <span class="t">your share</span>`:""}${S.person==="All"&&peopleList().length>1?` <span class="t">${esc(t.person)}</span>`:""}</span><span class="a ${t.amt>0?"in":""}">${fmt(t.amt)}</span></button>`;
}
function searchHTML(){
  const q=S.q.trim().toLowerCase(); if(!q) return "";
  const hits=mine().filter(t=>t.desc.toLowerCase().includes(q)||t.key.toLowerCase().includes(q)||catName(t.cat).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="card flat" style="gap:4px"><span class="small"><b>${hits.length}</b> match${hits.length===1?"":"es"} · ${fmt(hits.reduce((s,t)=>s+t.amt,0))}</span><div class="items" style="padding:0">${hits.slice(0,60).map(t=>itemHTML(t,1)).join("")}</div>${hits.length>60?`<span class="tiny muted">Showing the latest 60.</span>`:""}</div>`;
}

/* ---------- Spending › Bills ---------- */
function billsHTML(){
  const rec=recurring(); const up=upcoming().slice(0,4); const first=months(mine())[0];
  const tags={monthly:["Monthly","var(--accent-2)"],usage:["Pay as you go","var(--warn-ink)"],once:["Once","var(--muted)"]};
  const max=Math.max(1,...rec.map(r=>r.tot)); const perMonth=rec.filter(r=>r.monthly).reduce((s,r)=>s+r.avg,0);
  return `<div class="grid two"><div class="stack">
    <div class="card"><h2>Coming up</h2>${up.length?up.map(b=>`<div class="bill">${calIcon(b.next)}<span class="nm">${esc(niceName(b.k))}</span><span class="a">${fmt(b.avg)}</span></div>`).join("")+`<span class="small muted">Expected from past months. About ${money(perMonth)} a month in fixed bills.</span>`:`<p class="small muted">Repeat bills show here once there are two months of statements.</p>`}</div>
    </div><div class="stack"><div class="card"><div class="row between"><h2>All repeat charges</h2><span class="mono">${money(rec.reduce((s,r)=>s+r.tot,0))}</span></div>
    ${rec.map(r=>`<button class="repeat" type="button" data-key="${esc(r.k)}" style="border:0;background:none;text-align:left;width:100%"><span class="nm"><b>${esc(niceName(r.k))}</b><span style="color:${tags[r.tag][1]}">${tags[r.tag][0]}${r.monthly?` · ${fmt(r.avg)}/mo`:` · ${r.n}×`}</span></span><span class="hbar"><i style="width:${Math.max(2,r.tot/max*100).toFixed(1)}%;background:${catCol(r.cat)}"></i></span><span class="mono">${money(r.tot)}</span></button>`).join("")||`<p class="small muted">No subscriptions or repeat charges found yet.</p>`}
    ${first?`<span class="tiny muted">Totals since ${monthLabel(first,1)}. Tap one to change how it's sorted.</span>`:""}</div></div></div>`;
}

/* ---------- Spending › To sort ---------- */
function sortHTML(){
  if(isExample()) return `<div class="card"><p class="small muted">Unknown transactions from your own statements show up here so you can say what they were.</p></div>`;
  const need=sortGroups(false); const guesses=sortGroups(true).filter(g=>g.guess);
  const card=(g,q)=>`<button class="sortcard" type="button" data-key="${esc(g.k)}" ${q?'data-queue="1"':""}><b>${esc(niceName(g.k))}</b><span class="a">${g.out?fmt(-g.out):""}${g.out&&g.inn?" / ":""}${g.inn?"+"+fmt(g.inn):""}</span><span class="s">${g.items.length}× · ${esc([...g.people].join(", "))}${S.lookups[g.k]&&S.lookups[g.k].what?` · ${esc(S.lookups[g.k].what)}`:""}${g.guess?` · guessed ${esc(catName(g.cat))}`:""}</span></button>`;
  const unlooked=need.filter(g=>!S.lookups[g.k]).length;
  return `<div class="grid two"><div class="stack"><div class="card"><div class="row between"><span><span class="label">Needs you</span><br><span class="big">${need.length}</span></span>${S.ai&&unlooked?`<button class="btn ghost sm" type="button" data-act="aiSort" ${S.looking?"disabled":""}>${S.looking?`<span class="spinner"></span>Looking up…`:`Identify ${unlooked} with AI`}</button>`:""}</div>
      ${need.length?`<button class="btn" type="button" data-key="${esc(need[0].k)}" data-queue="1">Start sorting</button>`:`<p class="small"><b>All sorted.</b> New unknowns appear here after each upload.</p>`}
      <div class="stack" style="gap:8px">${need.map(g=>card(g,1)).join("")}</div></div></div>
    <div class="stack">${guesses.length?`<div class="card"><h2>Best guesses to check</h2><p class="small muted">Sorted automatically, mostly PayNow to people. Tap any that look wrong.</p><div class="stack" style="gap:8px">${guesses.slice(0,S.showAll.guess?999:12).map(g=>card(g)).join("")}</div>${guesses.length>12&&!S.showAll.guess?`<button class="link" type="button" data-more="guess">Show all ${guesses.length}</button>`:""}</div>`:""}</div></div>`;
}

/* ---------- sheets ---------- */
function closeSheets(){ document.querySelectorAll(".scrim").forEach(s=>s.remove()); }
function sheet(html, label){
  closeSheets(); const sc=document.createElement("div"); sc.className="scrim";
  sc.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><span class="grab"></span>${html}</div>`;
  sc.addEventListener("click",e=>{ if(e.target===sc) sc.remove(); });
  document.body.appendChild(sc);
  sc.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>sc.remove());
  setTimeout(()=>{ const f=sc.querySelector("[data-x]"); if(f) f.focus(); },30);
  return sc;
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheets(); });
const closeBtn=`<button class="iconbtn ghost" type="button" data-x aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button>`;

/* ---------- Identify sheet ---------- */
const KINDS=[["purchase","Purchase","Counts as spending."],["split","Split bill","Only your share counts as spending."],["friend","Paid / paid back a friend","Shown under People, not spending."],["own","My other account","Not counted. Money just moved."],["family","Family","Shown under People with a Family tag."],["refund","Refund or income","Counts as money in."]];
function kindFrom(cat,tag,share){ if(share) return "split"; if(cat==="People") return tag==="family"?"family":"friend"; if(cat==="Transfers") return "own"; if(cat==="Income") return tag==="family"?"family":"refund"; return "purchase"; }
function groupFor(k){ const items=[]; S.files.forEach(f=>f.tx.forEach(t=>{ if(merchantKey(t[1])===k) items.push({t,f}); })); return items; }
function openIdentifyKey(k, queue){ const items=groupFor(k); if(!items.length){ toast(isExample()?"This is example data. Add your own statements to sort them.":"That one is from a family member's shared statement. They can change it."); return; } sheetIdentify(k, items, null, queue); }
function openIdentifyTx(t){
  if(t.ro||t.file.example){ toast(t.file.example?"This is example data. Add your own statements to sort them.":`This is from ${t.person}'s shared statement. They can change it.`); return; }
  sheetIdentify(t.key, groupFor(t.key), {t:t.file.tx[t.idx], f:t.file});
}
function hintHTML(l){ return l&&l.what?`<div class="hint"><svg class="i"><use href="#i-search"/></svg><span>${esc(l.what)}${l.category&&CATS.includes(l.category)?` · looks like <b>${esc(catName(l.category))}</b>`:""}</span></div>`:""; }
function sheetIdentify(k, items, focus, queue){
  const meta=S.meta[k]||{}; const t0=(focus||items[0]).t;
  const st={kind:kindFrom(t0[3],meta.tag,t0[5]||meta.share), cat:NON_SPEND.has(t0[3])||t0[3]==="Other"?"Shopping":t0[3], scope:focus?"one":"always", share:t0[5]||meta.share||"", note:S.notes[k]||""};
  const lk=S.lookups[k]; if(t0[3]==="Other"&&lk&&CATS.includes(lk.category)&&!NON_SPEND.has(lk.category)&&lk.category!=="Other") st.cat=lk.category;
  const outT=items.reduce((s,{t})=>s+(t[2]<0?-t[2]:0),0), inT=items.reduce((s,{t})=>s+(t[2]>0?t[2]:0),0);
  const pd=parseDesc(t0[1]);
  const need=queue?sortGroups(false):null; const pos=need?Math.max(1,need.findIndex(g=>g.k===k)+1):0;
  const sc=sheet(`<div class="row between"><span class="small muted" style="font-weight:700">${need?`To sort · ${pos} of ${need.length}`:"What was this?"}</span>${closeBtn}</div>
    <div><h1>${esc(niceName(k))}</h1><span class="small muted">${pd.kind==="paynow"?"PayNow":"Card / bank"} · ${items.length}× · ${outT?money(outT)+" out":""}${outT&&inT?" · ":""}${inT?money(inT)+" in":""}</span></div>
    <div class="lines">${items.slice().sort((a,b)=>b.t[0].localeCompare(a.t[0])).slice(0,4).map(({t})=>`<span title="${esc(t[1])}">${dayMon(t[0])} · ${esc(parseDesc(t[1]).raw.slice(0,60))}</span><span>${fmt(t[2])}</span>`).join("")}</div>
    <div id="idHint">${hintHTML(lk)||(S.ai?`<button class="link" type="button" id="idLook">Look this up with AI</button>`:"")}</div>
    <label class="f">What was it? <span class="tiny muted" style="font-weight:400">optional, saved for the family</span><input type="text" id="idNote" maxlength="80" placeholder="e.g. Flowers for a birthday" value="${esc(st.note)}"></label>
    <div class="stack" style="gap:6px"><span class="small" style="font-weight:700">What kind of payment?</span><div class="chips" id="idKinds"></div><span class="small muted" id="idKindHelp"></span></div>
    <label class="f" id="idShareBox" hidden>My share of each payment<input type="text" id="idShare" inputmode="decimal" placeholder="e.g. 20.00 or 50%" value="${esc(st.share)}" class="mono"></label>
    <div class="stack" style="gap:6px" id="idCatBox"><span class="small" style="font-weight:700">Category</span><div class="chips" id="idCats"></div></div>
    <fieldset><legend>Apply to</legend>${focus?`<label class="radio"><input type="radio" name="idScope" value="one"> Just this one</label>`:""}${items.length>1?`<label class="radio"><input type="radio" name="idScope" value="all"> All ${items.length}</label>`:""}<label class="radio"><input type="radio" name="idScope" value="always"> ${items.length>1?`All ${items.length}`:"This one"} + future ones</label></fieldset>
    <div class="actions"><button class="btn ghost" type="button" id="idSkip">${queue?"Skip":"Cancel"}</button><button class="btn" type="button" id="idSave">${queue&&need.length>1?"Save and next":"Save"}</button></div>`, "What was this?");
  const paint=()=>{
    sc.querySelector("#idKinds").innerHTML=KINDS.map(([id,l])=>`<button class="chip" type="button" data-k="${id}" aria-pressed="${st.kind===id}">${l}</button>`).join("");
    sc.querySelector("#idKindHelp").textContent=KINDS.find(x=>x[0]===st.kind)[2];
    sc.querySelector("#idShareBox").hidden=st.kind!=="split";
    sc.querySelector("#idCatBox").hidden=!(st.kind==="purchase"||st.kind==="split");
    sc.querySelector("#idCats").innerHTML=SPEND_CATS.map(c=>`<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${st.cat===c}">${esc(catName(c))}</button>`).join("");
    sc.querySelectorAll("#idKinds [data-k]").forEach(b=>b.onclick=()=>{ st.kind=b.dataset.k; paint(); });
    sc.querySelectorAll("#idCats [data-c]").forEach(b=>b.onclick=()=>{ st.cat=b.dataset.c; paint(); });
    sc.querySelectorAll('input[name="idScope"]').forEach(r=>{ r.checked=r.value===st.scope; r.onchange=()=>{ st.scope=r.value; }; });
  };
  paint();
  const look=sc.querySelector("#idLook"); if(look) look.onclick=async()=>{ sc.querySelector("#idHint").innerHTML=`<div class="row small"><span class="spinner"></span>Looking up…</div>`; await lookupGroups([{k,items,out:outT,inn:inT,people:new Set()}],true); const l=S.lookups[k]; sc.querySelector("#idHint").innerHTML=hintHTML(l)||`<span class="small muted">Nothing found.</span>`; if(l&&CATS.includes(l.category)&&!NON_SPEND.has(l.category)&&l.category!=="Other"){ st.cat=l.category; paint(); } };
  const next=()=>{ sc.remove(); render(); if(queue){ const n=sortGroups(false).filter(g=>!S.skipped.has(g.k)); if(n.length) openIdentifyKey(n[0].k,true); else toast("All sorted"); } };
  sc.querySelector("#idSkip").onclick=()=>{ if(queue) S.skipped.add(k); next(); };
  sc.querySelector("#idSave").onclick=()=>{
    st.note=sc.querySelector("#idNote").value.trim(); st.share=sc.querySelector("#idShare").value.trim().replace(/\s/g,"");
    if(st.kind==="split"&&!/^(\d{1,6}(\.\d{1,2})?|(100|[1-9]?\d)(\.\d+)?%)$/.test(st.share)){ toast("Enter your share, e.g. 20.00 or 50%"); sc.querySelector("#idShare").focus(); return; }
    applyIdentify(k, items, focus, st); next();
  };
}
function applyIdentify(k, items, focus, st){
  const c={purchase:st.cat, split:st.cat, friend:"People", own:"Transfers", family:"People", refund:"Income"}[st.kind];
  const tag=st.kind==="family"?"family":st.kind==="own"?"own":""; const share=st.kind==="split"?st.share:"";
  const touched=new Set();
  const setT=({t,f})=>{ t[3]=c; t.length=4; if(share&&st.scope!=="always"){ t[4]=0; t[5]=share; } touched.add(f); };
  if(st.scope==="one"&&focus) setT(focus); else items.forEach(setT);
  if(st.scope==="always"){
    setRules({[k]:{c, note:st.note, share, tag}});
    if(st.note) S.notes[k]=st.note; else delete S.notes[k];
    if(share||tag) S.meta[k]={share,tag}; else delete S.meta[k];
  }
  S.skipped.delete(k); touched.forEach(saveFile); invalidate();
  toast(`${niceName(k)} → ${st.kind==="purchase"||st.kind==="split"?catName(c):KINDS.find(x=>x[0]===st.kind)[1]}`);
}
function cleanExample(t){ return parseDesc(t[1]).raw.replace(/\d{4}-\d{4}-\d{4}-\d{4}/g,"").replace(/\b\d{6,}\b/g,"").replace(/\s+/g," ").trim().slice(0,90); }
async function lookupGroups(groups, quiet){
  groups=groups.filter(g=>!S.lookups[g.k]); if(!groups.length||S.looking) return;
  const BATCH=10; let applied=0, done=0; const keys=new Set();
  try{
    for(let i=0;i<groups.length;i+=BATCH){
      const part=groups.slice(i,i+BATCH);
      S.looking=`Looking up ${groups.length-done}…`; if(!quiet&&S.tab==="spend") render();
      const res=await api("POST","/api/lookup",{merchants:part.map(g=>({name:g.k, examples:[...new Set(g.items.map(({t})=>cleanExample(t)))].slice(0,2), direction:g.out&&!g.inn?"out":g.inn&&!g.out?"in":"both"}))});
      for(const [k,r] of Object.entries(res.results||{})){ S.lookups[k]=r; if(r.applied&&CATS.includes(r.category)){ S.rules[k]=r.category; keys.add(k); applied++; } }
      done+=part.length;
    }
    const touched=new Set(); S.files.forEach(f=>f.tx.forEach(t=>{ const k=merchantKey(t[1]); if(keys.has(k)){ setCat(t,S.rules[k],0); touched.add(f); } })); touched.forEach(saveFile);
    if(!quiet) toast(applied?`Sorted ${applied} of ${groups.length} automatically${groups.length>applied?". The rest need you.":""}`:`Lookup done. ${groups.length===1?"This one needs":"These need"} you.`);
  }catch(e){ toast("Lookup stopped: "+e.message); }
  S.looking=null; if(!quiet&&!document.querySelector(".scrim")) render();
}
function autoLookup(){ if(S.ai) lookupGroups(sortGroups(false).slice(0,40), false); }

/* ---------- Money moves ---------- */
function moneyInHTML(){
  const tx=scoped(); const T=totals(tx);
  const src={}; tx.forEach(t=>{ const k=kindOf(t); if(t.amt>0&&(k==="income"||k==="people")){ const o=src[t.key]=src[t.key]||{k:t.key,v:0,n:0,cat:t.cat,tag:t.tag}; o.v+=t.amt; o.n++; } });
  const list=Object.values(src).sort((a,b)=>b.v-a.v); const max=Math.max(1,...list.map(x=>x.v));
  const all=mine(); const ms=months(all).slice(-12); const data=ms.map(m=>{ const o=totals(inMonth(all,m)); return {m,inn:o.moneyIn,out:o.spend+o.pplOut}; });
  const rate=T.moneyIn?Math.round(T.left/T.moneyIn*100):null;
  return `<div class="grid two"><div class="stack"><div class="card"><div class="row between"><span><span class="label">Money in · ${S.month==="all"?"all time":monthLabel(S.month,1)}</span><br><span class="big" style="color:var(--in)">${money(T.moneyIn)}</span></span>
      <span style="text-align:right"><span class="label">Kept</span><br><span class="big" style="font-size:22px">${rate==null?"–":rate+"%"}</span></span></div>
      ${list.slice(0,12).map(x=>`<button class="cbar" type="button" data-key="${esc(x.k)}">${catIcon(x.cat)}<span style="min-width:0"><span class="nm">${esc(niceName(x.k))}${x.tag==="family"?` <span class="pill ok">Family</span>`:""} <span class="tiny muted">×${x.n}</span></span><span class="track"><b style="width:${(x.v/max*100).toFixed(1)}%;background:var(--in)"></b></span></span><span class="amt">${money(x.v)}</span></button>`).join("")||`<p class="small muted">No money in this period.</p>`}
      <span class="tiny muted">Counts pay, allowances, interest and money from people. Transfers from your own accounts and investment withdrawals aren't counted. "Kept" is money in minus spending and money to people.</span></div></div>
    <div class="stack"><div class="card"><div class="row between"><h2>Money in vs money out</h2><span class="legend"><span><i style="background:var(--in)"></i>In</span><span><i style="background:var(--out)"></i>Out</span></span></div>
      ${data.length?inOutChart(data):`<p class="small muted">No data yet.</p>`}<span class="tiny muted">Out = spending + money to people. Investing is shown separately. The number under each month is what was left over.</span></div></div></div>`;
}
function acctDigits(a){ return String(a||"").replace(/\D/g,""); }
function accountsHTML(){
  const all=mine(); const ms=[...new Set(all.map(t=>t.post.slice(0,7)))].sort().slice(-6); const n=ms.length||1;
  const accts={}; srcFiles().filter(f=>S.person==="All"||f.person===S.person).forEach(f=>{ const id=f.person+"|"+(f.account||f.name); const a=accts[id]=accts[id]||{label:f.account?shortAcct(f.account):f.name,person:f.person,tx:[]}; });
  all.forEach(t=>{ const a=accts[t.person+"|"+t.acct]; if(a) a.tx.push(t); });
  const known=[...new Set(srcFiles().map(f=>acctDigits(f.account)).filter(x=>x.length>=6))];
  const cov=a=>ms.map((m,i)=>{ const d=[...new Set(a.tx.filter(t=>t.post.startsWith(m)).map(t=>t.post))].sort(); if(!d.length) return "none"; return i<ms.length-1||+d[d.length-1].slice(8,10)>=dim(m)-3?"":"part"; });
  const cards=Object.values(accts).map(a=>{ const ld=lastDate(a.tx); return `<div class="acct"><span><b>${esc(a.label)}</b><br><span class="s">${esc(a.person)} · ${a.tx.length} items${ld?` · up to ${dayMon(ld)}`:""}</span></span><span class="pill ok">Added</span>
    <div class="months" style="--n:${n}">${cov(a).map(c=>`<i class="${c}"></i>`).join("")}</div><div class="mlabels" style="--n:${n}">${ms.map(m=>`<span>${monthLabel(m)}</span>`).join("")}</div></div>`; });
  const tr={}; all.filter(t=>t.cat==="Transfers"&&!t.pair).forEach(t=>{ const o=tr[t.key]=tr[t.key]||{k:t.key,n:0,inn:0,out:0}; o.n++; if(t.amt>0) o.inn+=t.amt; else o.out-=t.amt; });
  const missing=Object.values(tr).filter(o=>{ const d=acctDigits(o.k); return !(d.length>=6&&known.some(x=>x.slice(-6)===d.slice(-6))); }).sort((a,b)=>(b.inn+b.out)-(a.inn+a.out));
  const miss=missing.slice(0,6).map(o=>`<div class="acct"><span><b>${esc(niceName(o.k))}</b><br><span class="s">${o.n} transfer${o.n===1?"":"s"}${o.inn?` · ${money(o.inn)} in`:""}${o.out?` · ${money(o.out)} out`:""}</span></span><span class="pill warn">Not added</span>
    <div class="months" style="--n:${n}">${ms.map(()=>`<i class="none"></i>`).join("")}</div></div>`);
  const pairs=all.filter(t=>t.pair&&t.amt<0); const pairTot=pairs.reduce((s,t)=>s-t.amt,0);
  const asks={}; all.filter(t=>t.unsure&&(t.cat==="People"||t.cat==="Transfers")&&!t.ro&&!t.file.example).forEach(t=>{ const o=asks[t.key]=asks[t.key]||{k:t.key,n:0,v:0}; o.n++; o.v+=t.amt; });
  const askList=Object.values(asks).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,5);
  const T=totals(inMonth(all,S.month));
  const outs=[["Spending",T.spend,"var(--out)"],["Investing",Math.max(0,T.inv),"var(--accent)"],["People",T.pplOut,"var(--people)"],["Own accounts",T.ownOut,"var(--grey)"]].filter(x=>x[1]>0.004); const om=Math.max(1,...outs.map(x=>x[1]));
  return `<div class="grid two"><div class="stack">
    <div class="card"><div class="row between"><h2>Your accounts</h2><button class="btn ghost sm" type="button" data-act="upload">Add</button></div>${cards.join("")||`<p class="small muted">No statements yet.</p>`}
      ${miss.length?`<span class="label" style="margin-top:4px">Transfers point to these</span>${miss.join("")}<span class="tiny muted">Add their statements so money moving between them nets out.</span>`:""}
      <span class="tiny muted">Bank exports only include posted transactions. Card payments from the last few days may still be pending and will appear in your next export. Overlaps are skipped automatically.</span></div>
    ${askList.length?`<div class="card"><div class="row between"><h2>Whose is this?</h2><span class="badge">${askList.length}</span></div>${askList.map(a=>`<div class="ask"><span><b>${esc(niceName(a.k))}</b> <span class="small muted">${a.n}× · ${fmt(a.v)}</span></span><div class="row"><button class="btn ghost sm" type="button" data-whose="own" data-k="${esc(a.k)}">Mine</button><button class="btn ghost sm" type="button" data-whose="family" data-k="${esc(a.k)}">Family</button><button class="btn ghost sm" type="button" data-whose="friend" data-k="${esc(a.k)}">Someone else</button></div></div>`).join("")}</div>`:""}
    </div><div class="stack">
    <div class="card"><div class="row between"><h2>Where money went</h2><span class="small muted">${S.month==="all"?"All time":monthLabel(S.month,1)}</span></div>${outs.map(([l,v,c])=>`<div class="repeat"><span class="nm"><b>${l}</b></span><span class="hbar"><i style="width:${Math.max(2,v/om*100).toFixed(1)}%;background:${c}"></i></span><span class="mono">${money(v)}</span></div>`).join("")||`<p class="small muted">Nothing yet.</p>`}
      ${pairs.length?`<span class="small"><b>${pairs.length}</b> transfer${pairs.length===1?"":"s"} matched between your accounts (${money(pairTot)}), not counted as spending or income.</span>`:""}</div>
    ${filesHTML()}</div></div>`;
}
function whose(k, kind){
  const items=groupFor(k); if(!items.length) return;
  applyIdentify(k, items, null, {kind, cat:"Other", scope:"always", share:"", note:S.notes[k]||""}); render();
}
function filesHTML(){
  if(isExample()) return "";
  const own=S.files.map(f=>{ const ds=f.tx.map(t=>t[0]).sort(); return `<div class="file"><span style="min-width:0"><b>${esc(f.name)}</b><span class="tiny muted">${esc(f.person)}${f.account?" · "+esc(shortAcct(f.account)):""} · ${f.tx.length} items${ds.length?` · ${dayMon(ds[0])} – ${dayMon(ds[ds.length-1])}`:""}</span></span>
    <span class="acts"><button class="share" type="button" aria-pressed="${!!f.shared}" data-file="share" data-id="${esc(f.id)}">${f.shared?"Shared":"Private"}</button><button class="btn ghost sm" type="button" data-file="acct" data-id="${esc(f.id)}">Edit</button><button class="btn ghost sm" type="button" data-file="rm" data-id="${esc(f.id)}">Remove</button></span></div>`; }).join("");
  const fam=S.family.map(f=>`<div class="file"><span style="min-width:0"><b>${esc(f.name)}</b><span class="tiny muted">${esc(f.person)} · shared by ${esc(f.ownerName||"family")} · ${f.tx.length} items</span></span><span class="pill ok">Family</span></div>`).join("");
  return `<div class="card"><div class="row between"><h2>Statement files</h2><button class="btn ghost sm" type="button" data-act="famRefresh">Refresh family</button></div>${own}${fam}
    <p class="tiny muted">Files are private until you tap <b>Private</b> to share one with family. Categories you set help the whole household.</p>
    <div class="row"><button class="btn ghost sm" type="button" data-act="exportCsv">Export combined CSV</button></div></div>`;
}
function fileAction(b){
  const f=S.files.find(x=>x.id===b.dataset.id); if(!f) return; const a=b.dataset.file;
  if(a==="share"){ b.disabled=true; patchFile(f,{shared:!f.shared}, !f.shared?`${f.name} is now shared with family`:`${f.name} is private again`); }
  else if(a==="rm"){ if(b.dataset.armed){ removeFile(f); } else { b.dataset.armed=1; b.textContent="Tap to confirm"; b.style.color="var(--out-ink)"; setTimeout(()=>{ if(b.isConnected){ delete b.dataset.armed; b.textContent="Remove"; b.style.color=""; } },3000); } }
  else if(a==="acct"){
    const sc=sheet(`<div class="row between"><b>Statement details</b>${closeBtn}</div>
      <label class="f">Whose account<input type="text" id="fPerson" value="${esc(f.person)}" maxlength="30"></label>
      <label class="f">Account number or name<input type="text" id="fAcct" value="${esc(f.account||"")}" maxlength="40" placeholder="e.g. 123-45692-9 or POSB Savings"></label>
      <button class="btn" type="button" id="fSave">Save</button>`,"Statement details");
    sc.querySelector("#fSave").onclick=()=>{ const person=sc.querySelector("#fPerson").value.trim()||f.person, account=sc.querySelector("#fAcct").value.trim(); sc.remove(); patchFile(f,{person,account},"Saved"); };
  }
}
function investHTML(){
  const all=mine(); const tx=inMonth(all,S.month).filter(t=>kindOf(t)==="invest");
  const ms=months(all).slice(-8); const mv=ms.map(m=>({m,v:totals(inMonth(all,m)).inv})); const mmax=Math.max(1,...mv.map(x=>Math.abs(x.v)));
  const p={}; tx.forEach(t=>{ const o=p[t.key]=p[t.key]||{k:t.key,i:0,o:0}; if(t.amt<0) o.i-=t.amt; else o.o+=t.amt; });
  const list=Object.values(p).sort((a,b)=>(b.i-b.o)-(a.i-a.o)); const max=Math.max(1,...list.flatMap(x=>[x.i,x.o]));
  const T=totals(tx);
  return `<div class="grid two"><div class="stack"><div class="card"><span><span class="label">Net invested · ${S.month==="all"?"all time":monthLabel(S.month,1)}</span><br><span class="big">${money(T.inv)}</span></span>
      <div class="minibars" style="height:70px" aria-hidden="true">${mv.map(x=>`<span><i style="height:${Math.max(3,Math.round(Math.abs(x.v)/mmax*50))}px;${x.v<0?"background:var(--grey)":""}"></i>${monthLabel(x.m)}</span>`).join("")}</div>
      <span class="tiny muted">Put in ${money(T.invIn)} · taken out ${money(T.invOut)}</span></div></div>
    <div class="stack"><div class="card"><div class="row between"><h2>By platform</h2><span class="legend"><span><i style="background:var(--accent)"></i>Put in</span><span><i style="background:var(--grey)"></i>Taken out</span></span></div>
      ${list.map(x=>`<button class="duo" type="button" data-key="${esc(x.k)}"><span class="nm"><b>${esc(niceName(x.k))}</b></span><span class="bars">${x.i?`<i style="width:${Math.max(3,x.i/max*100).toFixed(1)}%;background:var(--accent)"></i>`:""}${x.o?`<i style="width:${Math.max(3,x.o/max*100).toFixed(1)}%;background:var(--grey)"></i>`:""}</span><span class="n">${x.i-x.o>=0?"+":"−"}${money(Math.abs(x.i-x.o))}</span></button>`).join("")||`<p class="small muted">No investing in this period.</p>`}
      <span class="tiny muted">Something here that isn't investing? Tap it to change it.</span></div></div></div>`;
}
function peopleHTML(){
  const tx=scoped().filter(t=>kindOf(t)==="people"||t.tag==="family"||(t.share&&t.raw<0));
  const p={}; tx.forEach(t=>{ const o=p[t.key]=p[t.key]||{k:t.key,s:0,g:0,tag:t.tag,split:0}; if(t.share&&kindOf(t)==="spend"){ o.s+=t.amt-t.raw; o.split=1; } else if(t.amt<0) o.s-=t.amt; else o.g+=t.amt; });
  const list=Object.values(p).sort((a,b)=>(b.s+b.g)-(a.s+a.g)); const max=Math.max(1,...list.flatMap(x=>[x.s,x.g]));
  const T=totals(scoped());
  return `<div class="card"><div class="row between"><span><span class="label">Sent</span><br><span class="big" style="font-size:24px">${money(T.pplOut)}</span></span><span style="text-align:right"><span class="label">Received</span><br><span class="big" style="font-size:24px;color:var(--in)">${money(T.pplIn)}</span></span></div>
    <span class="legend"><span><i style="background:var(--people)"></i>Sent</span><span><i style="background:var(--in)"></i>Received</span></span>
    ${list.slice(0,S.showAll.ppl?999:20).map(x=>`<button class="duo" type="button" data-key="${esc(x.k)}"><span class="nm"><b>${esc(niceName(x.k))}</b>${x.tag==="family"?`<span>FAMILY</span>`:x.split?`<span>SPLIT BILL</span>`:""}</span><span class="bars">${x.s?`<i style="width:${Math.max(3,x.s/max*100).toFixed(1)}%;background:var(--people)"></i>`:""}${x.g?`<i style="width:${Math.max(3,x.g/max*100).toFixed(1)}%;background:var(--in)"></i>`:""}</span><span class="n" style="${x.g>x.s?"color:var(--in)":""}">${x.g-x.s>=0?"+":"−"}${money(Math.abs(x.g-x.s))}</span></button>`).join("")||`<p class="small muted">No money to or from people in this period.</p>`}
    ${list.length>20&&!S.showAll.ppl?`<button class="link" type="button" data-more="ppl">Show all ${list.length}</button>`:""}
    <span class="tiny muted">Tap a person to mark a split bill, a purchase, or family. Received from family counts as money in.</span></div>`;
}

/* ---------- Goals ---------- */
function limitsHTML(){
  const B=S.budgets[S.person]||{}; const all=mine(); const m=S.month==="all"?(months(all).pop()||ymNow()):S.month;
  const ms=months(all).filter(x=>x<=m).slice(-6); const vals=ms.map(x=>({m:x,v:totals(inMonth(all,x)).spend}));
  const cap=B.Total||0; const vmax=Math.max(1,cap,...vals.map(x=>x.v))*1.08; const under=vals.filter(x=>cap&&x.v<=cap).length;
  const sp=spendByCat(inMonth(all,m)); const cats=Object.keys(B).filter(c=>c!=="Total");
  const rows=cats.map(c=>({c,s:sp[c]||0,b:B[c]})).sort((a,b)=>b.s/b.b-a.s/a.b);
  const cur=m===ymNow(); const ld=lastDate(inMonth(all,m)); const frac=cur&&ld?+ld.slice(8,10)/dim(m):1;
  return `<div class="grid two"><div class="stack"><div class="card"><div class="row between"><b>${cap?`Monthly cap ${money(cap)}`:"Monthly spending"}</b>${cap?`<span class="small muted">${under} of ${vals.length} months under</span>`:""}</div>
      <div class="capbars">${vals.map(x=>`<div><em>${money(x.v)}</em><span class="col"><i style="height:${(x.v/vmax*100).toFixed(1)}%;background:${cap&&x.v>cap?"var(--out)":"var(--accent)"}"></i>${cap?`<u style="bottom:${(cap/vmax*100).toFixed(1)}%"></u>`:""}</span><span>${monthLabel(x.m)}</span></div>`).join("")}</div>
      ${!cap?`<span class="small muted">Set a monthly cap to see which months stayed under it.</span>`:""}</div></div>
    <div class="stack"><div class="card"><div class="row between"><b>${monthLabel(m,1)} by category</b><button class="btn ghost sm" type="button" data-act="editLimits">${Object.keys(B).length?"Edit limits":"Set limits"}</button></div>
      ${rows.map(r=>{ const pct=r.s/r.b; const col=pct>1?"var(--out)":pct>frac*1.05&&pct>.5?"var(--warn)":"var(--accent)"; return `<div class="lim">${catIcon(r.c)}<span style="min-width:0"><span class="small" style="font-weight:600">${esc(catName(r.c))}</span><span class="track"><b style="width:${Math.min(100,pct*100).toFixed(1)}%;background:${col}"></b>${cur?`<u style="left:${(frac*100).toFixed(1)}%;opacity:.45"></u>`:""}</span></span><span class="v"><span style="${pct>1?"color:var(--out-ink);font-weight:700":""}">${money(r.s)}</span><span class="muted">/${money(r.b)}</span></span></div>`; }).join("")
        ||`<p class="small muted">No limits yet. A limit per category warns you on the Overview when you go over.</p><button class="btn sm" type="button" data-act="suggestLimits">Suggest from my spending</button>`}
      ${cur&&rows.length?`<span class="tiny muted">The thin line shows how far through the month we are.</span>`:""}</div></div></div>`;
}
function suggestLimits(){
  const all=mine(); const ms=months(all).filter(m=>m!==ymNow()).slice(-3); const out={}; if(!ms.length) return out;
  const s=spendByCat(all.filter(t=>ms.includes(t.date.slice(0,7)))); let tot=0;
  for(const [c,v] of Object.entries(s)){ const avg=v/ms.length; tot+=avg; if(avg>=5&&c!=="Other") out[c]=Math.ceil(avg/10)*10; }
  if(tot>0) out.Total=Math.ceil(tot/50)*50; return out;
}
function openLimits(suggest){
  const cur={...(S.budgets[S.person]||{})}; const sug=suggest?suggestLimits():null; const vals=sug&&Object.keys(sug).length?sug:cur;
  const sc=sheet(`<div class="row between"><b>Monthly limits · ${esc(S.person==="All"?"Everyone":S.person)}</b>${closeBtn}</div>
    <p class="small muted">In SGD per month. Leave blank for no limit.${sug?" Filled in from your average over the last few full months, rounded up.":""}</p>
    <label class="f">Total monthly cap<input type="number" inputmode="decimal" min="0" step="50" data-c="Total" value="${vals.Total||""}" class="mono"></label>
    <div class="binputs">${SPEND_CATS.map(c=>`<label>${esc(catName(c))}<input type="number" inputmode="decimal" min="0" step="10" data-c="${esc(c)}" value="${vals[c]||""}"></label>`).join("")}</div>
    <div class="row"><button class="btn" type="button" data-save>Save limits</button><button class="btn ghost sm" type="button" data-avg>Fill from my average</button><button class="btn ghost sm" type="button" data-clear>Clear all</button></div>`,"Monthly limits");
  sc.querySelector("[data-avg]").onclick=()=>{ const s=suggestLimits(); if(!Object.keys(s).length){ toast("Needs at least one full month of statements"); return; } sc.querySelectorAll("input[data-c]").forEach(i=>i.value=s[i.dataset.c]||""); };
  sc.querySelector("[data-clear]").onclick=()=>sc.querySelectorAll("input[data-c]").forEach(i=>i.value="");
  sc.querySelector("[data-save]").onclick=()=>{ const o={}; sc.querySelectorAll("input[data-c]").forEach(i=>{ const v=parseFloat(i.value); if(v>0) o[i.dataset.c]=Math.round(v*100)/100; });
    if(Object.keys(o).length) S.budgets[S.person]=o; else delete S.budgets[S.person]; saveBudgets(S.person,o); sc.remove(); render(); toast("Limits saved"); };
}
const GK={save:["Save up","piggy","#0E7C70"],invest:["Invest","chart","#22769A"],spend:["Spend less","down","#B8427A"],buffer:["Keep a buffer","shield","#5468C9"]};
function goalProgress(g){
  const all=g.who&&g.who!=="All"?allTx().filter(t=>t.person===g.who):allTx();
  if(g.kind==="spend"){ const m=S.month==="all"?(months(all).pop()||ymNow()):S.month; const v=totals(inMonth(all,m)).spend; return {v, label:`${money(v)} of ${money(g.target)} in ${monthLabel(m)}`, frac:g.target?v/g.target:0, bad:v>g.target}; }
  const T=totals(all.filter(t=>!g.start||t.date.slice(0,7)>=g.start)); const v=g.kind==="invest"?T.inv:T.left;
  return {v, label:`${money(v)} of ${money(g.target)}`, frac:g.target?Math.max(0,v)/g.target:0};
}
function goalsHTML(){
  const all=mine(); const first=months(all)[0];
  const card=g=>{ const P=goalProgress(g); const [l,,col]=GK[g.kind]; const frac=Math.min(1,Math.max(0,P.frac));
    return `<button class="card goal" type="button" data-goal="${esc(g.id)}" style="text-align:left;cursor:pointer"><span class="rg">${ringSVG([[P.bad?"var(--out)":col,frac*100,""]],100,null,96,38,10)}<span>${g.target?Math.round(P.frac*100)+"%":"no target"}</span></span>
      <span class="info"><b>${esc(g.name||l)}</b><span class="small muted">${l}${g.who&&g.who!=="All"?" · "+esc(g.who):""}${g.start&&g.kind!=="spend"?" · since "+monthLabel(g.start,1):""}</span><span class="mono">${g.target?P.label:money(P.v)}</span></span></button>`; };
  const T=totals(all);
  const invDefault=!S.goals.some(g=>g.kind==="invest")&&T.inv>0?`<div class="card goal"><span class="rg">${ringSVG([],100,null,96,38,10)}<span class="tiny muted">no target</span></span><span class="info"><b>Invest</b><span class="mono">${money(T.inv)}${first?` since ${monthLabel(first)}`:""}</span><button class="btn ghost sm" type="button" data-newgoal="invest" style="align-self:flex-start">Set target</button></span></div>`:"";
  return `<div class="grid two"><div class="stack">${S.goals.map(card).join("")}${invDefault}${!S.goals.length&&!invDefault?`<div class="card"><p class="small muted">No goals yet. Pick one to start.</p></div>`:""}</div>
    <div class="stack"><div class="card"><h2>New goal</h2><div class="kinds">${Object.entries(GK).map(([k,[l,ic,col]])=>`<button type="button" data-newgoal="${k}"><span class="ic" style="background:color-mix(in srgb, ${col} 16%, var(--surface));color:${col}">${svgI(IC[ic])}</span>${l}</button>`).join("")}</div>
      <span class="tiny muted">Save up and Keep a buffer track money in minus spending and money to people. Invest tracks net investing. Spend less tracks a month's spending against a cap.</span></div></div></div>`;
}
function openGoal(id, kind){
  const g=id?S.goals.find(x=>x.id===id):{id:Math.random().toString(36).slice(2,10),kind,name:"",target:0,start:ymNow(),who:S.person};
  if(!g) return; const [l]=GK[g.kind]; const ms=months(allTx());
  const sc=sheet(`<div class="row between"><b>${id?"Edit goal":"New goal"} · ${l}</b>${closeBtn}</div>
    <label class="f">Name<input type="text" id="gName" maxlength="40" value="${esc(g.name)}" placeholder="${g.kind==="save"?"e.g. Japan trip":g.kind==="buffer"?"e.g. Emergency fund":g.kind==="spend"?"e.g. Under $1,300 a month":"e.g. Invest $20k"}"></label>
    <label class="f">${g.kind==="spend"?"Monthly cap":"Target"} (SGD)<input type="number" inputmode="decimal" min="0" step="50" id="gTarget" value="${g.target||""}" class="mono"></label>
    ${g.kind!=="spend"?`<label class="f">Counting from<select id="gStart">${[...new Set([...ms,ymNow()])].sort().reverse().map(m=>`<option value="${m}" ${m===g.start?"selected":""}>${monthLabel(m,1)}</option>`).join("")}</select></label>`:""}
    <div class="row"><button class="btn" type="button" id="gSave">Save goal</button>${id?`<button class="btn ghost sm" type="button" id="gDel">Delete</button>`:""}</div>`,"Goal");
  sc.querySelector("#gSave").onclick=()=>{ g.name=sc.querySelector("#gName").value.trim(); g.target=parseFloat(sc.querySelector("#gTarget").value)||0; const s=sc.querySelector("#gStart"); if(s) g.start=s.value;
    if(!id) S.goals.push(g); saveBudgets("goals",S.goals); sc.remove(); render(); toast("Goal saved"); };
  const d=sc.querySelector("#gDel"); if(d) d.onclick=()=>{ S.goals=S.goals.filter(x=>x!==g); saveBudgets("goals",S.goals); sc.remove(); render(); toast("Goal deleted"); };
}

/* ---------- Add statements ---------- */
function openUpload(){
  if(!document.querySelector(".scrim[data-up]")){ const sc=sheet(`<div class="row between"><h1 style="font-size:24px">Add statements</h1>${closeBtn}</div><div id="upBody" class="stack"></div>`,"Add statements"); sc.dataset.up=1; }
  renderUpload();
}
function renderUpload(){
  const box=document.getElementById("upBody"); if(!box) return;
  const people=[...new Set([...S.files.map(f=>f.person),S.me.name].filter(Boolean))];
  const who=S.upPerson||defaultPerson(); const ready=S.pending.filter(p=>!p.busy&&!p.locked);
  box.innerHTML=`<label class="f">Whose accounts?<input type="text" id="upWho" list="upPeople" value="${esc(who)}" maxlength="30" placeholder="e.g. Bryan, Mum, Dad"><datalist id="upPeople">${people.map(p=>`<option value="${esc(p)}">`).join("")}</datalist></label>
    <div class="drop" id="drop"><svg class="i" style="width:28px;height:28px;color:var(--accent)"><use href="#i-add"/></svg><b>Pick several files at once</b><span class="small muted">CSV · Excel · PDF, from any bank or card</span><label class="btn" for="fileIn">Choose files</label></div>
    <div id="reviews" class="stack"></div>
    ${ready.length>1?`<button class="btn dark" type="button" id="addAll">Add all ${ready.length} files</button>`:""}
    <div id="upAccts"></div>`;
  const drop=$("drop");
  ["dragenter","dragover"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("over");}));
  ["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("over");}));
  drop.addEventListener("drop",ev=>handleFiles(ev.dataTransfer.files));
  $("upWho").onchange=e=>{ S.upPerson=e.target.value.trim(); S.pending.forEach(p=>{ if(!p.personSet&&S.upPerson) p.person=S.upPerson; }); renderUpload(); };
  const aa=$("addAll"); if(aa) aa.onclick=async()=>{ aa.disabled=true; for(const p of S.pending.filter(p=>!p.busy&&!p.locked)) await addFile(p, true); toast("All files added"); };
  renderReviews();
  $("upAccts").innerHTML=accountsSummary(who);
}
function accountsSummary(who){
  if(isExample()) return "";
  const files=S.files.filter(f=>f.person===who); if(!files.length) return "";
  const all=allTx().filter(t=>t.person===who); const ms=months(all).slice(-6); const n=ms.length||1;
  const g={}; files.forEach(f=>{ const id=f.account||f.name; (g[id]=g[id]||[]).push(f); });
  const pairs=allTx().filter(t=>t.pair&&t.amt<0&&t.person===who).length;
  return `<div class="card flat"><div class="row between"><h2>${esc(who)}'s accounts</h2>${pairs?`<span class="pill ok">${pairs} transfers paired</span>`:""}</div>
    ${Object.entries(g).map(([id,fs])=>{ const tx=all.filter(t=>t.acct===id); const ld=lastDate(tx); return `<div class="acct" style="background:var(--surface)"><span><b>${esc(fs[0].account?shortAcct(id):id)}</b><br><span class="s">${fs.length} file${fs.length===1?"":"s"} · ${tx.length} items${ld?" · up to "+dayMon(ld):""}</span></span><span class="pill ok">Added</span>
      <div class="months" style="--n:${n}">${ms.map(m=>`<i class="${tx.some(t=>t.post.startsWith(m))?"":"none"}"></i>`).join("")}</div><div class="mlabels" style="--n:${n}">${ms.map(m=>`<span>${monthLabel(m)}</span>`).join("")}</div></div>`; }).join("")}</div>`;
}
function renderReviews(){
  const box=$("reviews"); if(!box) return; box.innerHTML="";
  for(const p of S.pending){
    const el=document.createElement("div"); el.className="review";
    if(p.busy){ el.innerHTML=`<div class="row"><span class="spinner"></span><b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b></div><p class="small muted">${esc(p.busy)}</p>`; box.appendChild(el); continue; }
    if(p.locked){
      el.innerHTML=`<b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b>
        <p class="small">${p.pwBad?"That password didn't work. Try again.":"This PDF is password-protected. Enter the password your bank set for e-statements."}</p>
        <div class="row"><input type="text" autocomplete="off" aria-label="Statement password" placeholder="Statement password" style="flex:1"><button class="btn sm" type="button" data-a="unlock">Unlock</button><button class="btn ghost sm" type="button" data-a="skip">Discard</button></div>
        <p class="tiny muted">The password is only used to open the file on this screen and is never saved.</p>`;
      el.querySelector('[data-a="unlock"]').onclick=async()=>{ const pw=el.querySelector("input").value; p.busy="Unlocking…"; renderUpload(); try{ await pdfToRows(p,pw); }catch(e){ p.pwBad=true; } p.busy=null; renderUpload(); };
      el.querySelector('[data-a="skip"]').onclick=()=>{ S.pending=S.pending.filter(x=>x!==p); renderUpload(); };
      box.appendChild(el); continue;
    }
    const tx=extract(p.rows,p.map);
    const existing=S.files.filter(f=>f.person===p.person).flatMap(f=>f.tx);
    const {fresh,dup}=dedupeCount(existing, tx.map(t=>t.slice(0,3)));
    const ds=tx.map(t=>t[0]).sort();
    const hdr = p.map.header>=0 ? p.rows[p.map.header] : (p.rows[0]||[]).map((_,i)=>"Column "+(i+1));
    const opt=(sel)=>`<option value="-1">(none)</option>`+hdr.map((h,i)=>`<option value="${i}" ${i===sel?"selected":""}>${esc(String(h||"Column "+(i+1)).slice(0,30))}</option>`).join("");
    const aiBtn = p.pdf&&S.ai ? `<button class="btn ghost sm" type="button" data-a="ai">${p.viaAI?"Read again with AI":"Read with AI instead"}</button>` : "";
    const note = p.pdf ? `<p class="tiny muted">${p.viaAI?"Read by AI. Check a few rows against the statement.":tx.length?`Read from the PDF text (${p.pdfKind==="bank"?"bank account layout":"card layout"}).`:p.noText?"This PDF is a scanned image with no text to read.":"No transaction lines were recognised."}${!p.viaAI&&S.ai?" If rows look wrong, read it with AI.":""}</p>` : "";
    el.innerHTML=`<div class="row between"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b><span class="pill ${fresh.length?"ok":"warn"}">${fresh.length} new${dup?` · ${dup} already had`:""}</span></div>
      <span class="small muted">${tx.length} rows${ds.length?` · ${dayMon(ds[0])} – ${dayMon(ds[ds.length-1])}`:""}</span>
      <div class="grid2"><label>Whose<input type="text" data-k="person" value="${esc(p.person)}" maxlength="30"></label><label>Account<input type="text" data-k="account" value="${esc(p.account||"")}" maxlength="40" placeholder="number or name"></label></div>
      ${note}
      <details ${tx.length||p.pdf?"":"open"}><summary class="small" style="cursor:pointer;font-weight:700">Adjust columns</summary>
        <div class="grid2" style="margin-top:8px">
          <label>Date<select data-k="date">${opt(p.map.date)}</select></label>
          <label>Description<select data-k="desc">${opt(p.map.descs[0]??-1)}</select></label>
          <label>Amount layout<select data-k="mode"><option value="single" ${p.map.mode==="single"?"selected":""}>One amount column</option><option value="split" ${p.map.mode==="split"?"selected":""}>Separate debit / credit</option></select></label>
          ${p.map.mode==="single"?`<label>Amount<select data-k="amount">${opt(p.map.amount)}</select></label>`:`<label>Debit (out)<select data-k="debit">${opt(p.map.debit)}</select></label><label>Credit (in)<select data-k="credit">${opt(p.map.credit)}</select></label>`}
          <label>Header row<select data-k="header">${p.rows.slice(0,40).map((r,i)=>`<option value="${i}" ${i===p.map.header?"selected":""}>Row ${i+1}: ${esc(r.slice(0,3).join(" | ").slice(0,30))}</option>`).join("")}<option value="-1" ${p.map.header<0?"selected":""}>No header</option></select></label>
        </div>
        ${p.map.mode==="single"?`<label class="small row" style="margin-top:8px"><input type="checkbox" data-k="flip" ${p.map.flip?"checked":""}> Purchases show as positive numbers (credit card statement)</label>`:""}
        <div class="preview" style="margin-top:8px"><table>${tx.slice(0,4).map(t=>`<tr><td class="num">${t[0]}</td><td style="white-space:normal">${esc(t[1].slice(0,50))}</td><td class="num" style="text-align:right">${fmt(t[2])}</td></tr>`).join("")||`<tr><td class="out">No rows recognised yet.</td></tr>`}</table></div>
      </details>
      <div class="row"><button class="btn sm" type="button" data-a="add" ${fresh.length?"":"disabled"}>${fresh.length?`Add ${fresh.length}`:"Nothing new"}</button>${aiBtn}<button class="btn ghost sm" type="button" data-a="skip">Discard</button></div>`;
    el.querySelectorAll("[data-k]").forEach(inp=>inp.onchange=()=>{
      const k=inp.dataset.k, v=inp.type==="checkbox"?inp.checked:inp.value;
      if(k==="person"){ p.person=v.trim()||"Me"; p.personSet=1; renderUpload(); return; }
      if(k==="account"){ p.account=v.trim(); return; }
      if(k==="desc"){ p.map.descs=[+v].filter(x=>x>=0); p.map.descAlt=[]; }
      else if(k==="mode") p.map.mode=v;
      else if(k==="flip") p.map.flip=v;
      else p.map[k]=+v;
      if(k==="header"&&p.map.header>=0){ const m2=detect(p.rows.slice(p.map.header)); if(m2.header===0){ Object.assign(p.map,{date:m2.date,amount:m2.amount,debit:m2.debit,credit:m2.credit,descs:m2.descs,descAlt:m2.descAlt,mode:m2.mode}); } }
      renderUpload();
    });
    el.querySelector('[data-a="add"]').onclick=()=>addFile(p);
    el.querySelector('[data-a="skip"]').onclick=()=>{ S.pending=S.pending.filter(x=>x!==p); renderUpload(); };
    const ab=el.querySelector('[data-a="ai"]'); if(ab) ab.onclick=()=>readWithAI(p);
    box.appendChild(el);
  }
}
async function addFile(p, quiet){
  const learned={};
  const tx=extract(p.rows,p.map).map(t=>{
    if(t[3]&&CATS.includes(t[3])){ const k=merchantKey(t[1]); if(t[3]!=="Other"&&!S.rules[k]) learned[k]=t[3]; setCat(t,t[3],0); }
    else { const [c,u]=categorize(t[1],t[2]); setCat(t,c,u); }
    return t; });
  if(Object.keys(learned).length) setRules(learned);
  const groups={}; tx.forEach(t=>{ const who=t.person||p.person; (groups[who]=groups[who]||[]).push(t); });
  const msgs=[]; let i=0;
  S.pending=S.pending.filter(x=>x!==p);
  for(const [who,rows] of Object.entries(groups)){
    const existing=S.files.filter(f=>f.person===who).flatMap(f=>f.tx);
    const {fresh,dup}=dedupeCount(existing, rows.map(t=>t.slice()));
    if(fresh.length){ const file={id:p.id+(i?"-"+i:""), name:p.name, person:who, account:p.account||"", added:Date.now()+i, tx:fresh, shared:false, mine:true}; i++;
      S.files.push(file); await createFile(file); }
    msgs.push(`${fresh.length} new for ${who}${dup?` (${dup} already had)`:""}`);
  }
  if(p.person&&!S.me.name&&p.person!=="Me"){ S.me.name=p.person; api("PUT","/api/me",{name:p.person}).catch(()=>{}); }
  refreshFam(); invalidate(); S.month=null; render(); renderUpload();
  if(!quiet){ const nL=Object.keys(learned).length; toast(`Added ${msgs.join(", ")}${nL?`. Learned ${nL} merchant${nL===1?"":"s"}`:""}`); }
  autoLookup();
}

/* ---------- AI tips & export ---------- */
function openTips(){
  const sc=sheet(`<div class="row between"><b>Tips from AI</b>${closeBtn}</div>
    <label class="f">Anything to aim for?<input type="text" id="tGoals" placeholder="e.g. save $500 a month, trip in June" value="${esc(S.goals.map(g=>`${GK[g.kind][0]}${g.name?" ("+g.name+")":""}${g.target?" "+money(g.target):""}`).join("; "))}"></label>
    <button class="btn" type="button" id="tGo">Get tips</button><p class="tiny muted">Sends totals by category, month and person, your limits and top merchants. Individual transactions stay out of it.</p><div class="ai" id="tOut" role="status"></div>`,"Tips from AI");
  sc.querySelector("#tGo").onclick=async()=>{
    const tx=scoped(); const all=mine(); const ms=months(all).slice(-6); const people=[...new Set(tx.map(t=>t.person))];
    const monthly=ms.map(m=>{ const T=totals(inMonth(all,m)); return `${m}: in ${T.moneyIn.toFixed(0)}, spend ${T.spend.toFixed(0)}, to people ${T.pplOut.toFixed(0)}, invested ${T.inv.toFixed(0)}`; }).join("\n");
    const perPerson=people.map(p=>{ const pt=tx.filter(t=>t.person===p); const T=totals(pt); const c=spendByCat(pt); return `${p}: in ${T.moneyIn.toFixed(0)}, spend ${T.spend.toFixed(0)}, invested ${T.inv.toFixed(0)}; by category: ${Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v.toFixed(0)).join(", ")}`; }).join("\n");
    const mm={}; tx.filter(isSpend).forEach(t=>{ mm[t.key]=(mm[t.key]||0)-t.amt; });
    const top=Object.entries(mm).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+" "+v.toFixed(0)).join(", ");
    const rec=recurring().filter(r=>r.monthly).map(r=>`${r.k} ~${r.avg.toFixed(2)}/mo`).join(", ");
    const B=S.budgets[S.person]||{}; const sp=spendByCat(tx); const bud=Object.keys(B).length?Object.entries(B).map(([c,b])=>`${c}: limit ${b}, spent ${(c==="Total"?totals(tx).spend:sp[c]||0).toFixed(0)}`).join("; "):"none set";
    const unsorted=tx.filter(t=>t.cat==="Other"&&t.amt<0).reduce((s,t)=>s-t.amt,0);
    const out=sc.querySelector("#tOut"); out.innerHTML=`<div class="row"><span class="spinner"></span><span class="muted">Thinking…</span></div>`; sc.querySelector("#tGo").disabled=true;
    try{ const r=await api("POST","/api/analyse",{data:{period:S.month==="all"?"all time":S.month, monthly, perPerson, top, recurring:rec||"none detected", budgets:bud, unsorted:unsorted.toFixed(0), goals:sc.querySelector("#tGoals").value.trim()||"none given", hasBudgets:!!Object.keys(B).length}}); out.textContent=r.text||"No answer came back."; }
    catch(e){ out.textContent="Couldn't get tips: "+e.message; }
    sc.querySelector("#tGo").disabled=false;
  };
}
function exportCsv(){
  const rows=[["Date","Posted","Person","Account","Merchant","Description","Amount","Your share","Category"],...allTx().slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t.post,t.person,t.acct,t.key,t.desc,t.raw,t.share?t.amt:"",t.cat])];
  const cell=v=>{ let s=String(v); if(/^[=+\-@]/.test(s)&&isNaN(+s)) s="'"+s; return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
  const csv=rows.map(r=>r.map(cell).join(",")).join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="family-ledger.csv"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}

/* ---------- boot ---------- */
async function boot(){
  readHash(); render(); setSave("Loading…");
  try{
    S.me=await api("GET","/api/me"); S.ai=!!S.me.ai;
    const changed=await loadData();
    setSave(S.files.length?"Saved":"");
    S.month=null; render();
    if(changed) toast(`Applied ${changed} new household categor${changed===1?"y":"ies"}`);
    if(S.ai&&sortGroups(false).some(g=>!S.lookups[g.k])) autoLookup();
  }catch(e){
    setSave(e.status===401||e.status===403?"Not signed in":"Offline");
    if(e.login){ showLogin(e.status===403?e.message:""); return; }
    $("alerts").innerHTML=`<div class="alert bad" role="alert"><b>${e.status===401||e.status===403?"You're not signed in":"Couldn't reach the server"}</b><span>${esc(e.message)}</span></div>`;
  }
}

/* ---------- Google sign-in ---------- */
async function showLogin(msg){
  $("view").innerHTML=""; $("subtabs").hidden=true; $("exampleBanner").hidden=true; $("tabbar").hidden=true;
  const box=$("alerts");
  box.innerHTML=`<div class="card" role="region" aria-label="Sign in" style="align-items:flex-start">
    <h2>Sign in to Family Ledger</h2>
    <span class="small muted">Use the Google account your family added.</span>
    <div id="gBtn" style="min-height:44px"></div>
    <span id="loginMsg" role="status" class="small muted">${esc(msg||"")}</span></div>`;
  let cfg; try{ cfg=await api("GET","/api/login-config"); }catch(e){ $("loginMsg").textContent="Couldn't reach the server."; return; }
  if(!cfg.clientId){ $("loginMsg").textContent="Google sign-in isn't set up yet."; return; }
  if(!window.google||!google.accounts){
    await new Promise((ok,bad)=>{ const sc=document.createElement("script"); sc.src="https://accounts.google.com/gsi/client"; sc.async=true; sc.onload=ok; sc.onerror=bad; document.head.appendChild(sc); }).catch(()=>{});
  }
  if(!window.google||!google.accounts){ $("loginMsg").textContent="Couldn't load Google sign-in. Check your connection or ad blocker."; return; }
  google.accounts.id.initialize({ client_id:cfg.clientId, ux_mode:"popup", callback:async(res)=>{
    $("loginMsg").textContent="Signing in…";
    try{ await api("POST","/api/login",{credential:res.credential}); box.innerHTML=""; $("tabbar").hidden=false; boot(); }
    catch(e){ $("loginMsg").textContent=e.message; }
  }});
  google.accounts.id.renderButton($("gBtn"),{theme:"outline",size:"large",shape:"pill",text:"signin_with"});
}
async function signOut(){ try{ await api("POST","/api/logout",{}); }catch(e){} if(window.google&&google.accounts) google.accounts.id.disableAutoSelect(); location.reload(); }
boot();
