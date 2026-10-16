
const $ = id => document.getElementById(id);
const COLORS = {"Food & Dining":"--c2","Groceries":"--c5","Transport":"--c6","Shopping":"--c4","Bills & Utilities":"--c3","Subscriptions":"--c7","Health":"--c1","Entertainment":"--c8","Travel":"--c6","Education":"--c3","Insurance":"--c1","Cash":"--c9","Other":"--c9","Income":"--in","Transfers":"--c9","Investing":"--c1"};
const PCOL = ["--c1","--c2","--c3","--c4","--c5","--c7"];
const S = { me:{}, ai:false, files:[], family:[], famView:[], rules:{}, notes:{}, lookups:{}, budgets:{}, person:"All", range:"all", cat:null, q:"", txShown:60, pending:[], trendCat:null, triageAll:false, skipped:new Set(), triDone:0, looking:null, ex:null };

function merchantKey(desc){ return parseDesc(desc).key; }
function categorize(desc, amt){ return autoCategory(desc, amt, S.rules); }
function setCat(t, c, unsure){ t[3]=c; if(unsure) t[4]=1; else t.length=4; }

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
  p.doc=doc; p.locked=false; p.pdfKind=r.kind; p.noText=!full.replace(/\s/g,"").length;
  p.rows=[["Date","Description","Amount"],...r.tx];
  p.map={header:0,date:0,descs:[1],descAlt:[],amount:2,debit:-1,credit:-1,mode:"single",flip:false};
  if(r.kind==="card"&&r.tx.length){ const pos=r.tx.filter(t=>t[2]>0).length/r.tx.length; if(pos>.6) p.map.flip=true; }
}
async function readWithClaude(p){
  if(!S.ai){ toast("PDF reading needs Workers AI turned on for this site"); return; }
  if(p.buf.byteLength>8e6){ toast("That PDF is over 8 MB. Try the bank's CSV export instead."); return; }
  p.busy="Reading the statement with AI…"; renderReviews();
  try{
    const bytes=new Uint8Array(p.buf); let bin=""; for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    const res=await api("POST","/api/pdf",{name:p.name,data:btoa(bin)});
    const tx=(res.transactions||[]).filter(t=>Array.isArray(t)&&parseDate(t[0])&&typeof t[2]==="number"&&t[2]).map(t=>[parseDate(t[0]), String(t[1]||"(no description)").slice(0,140), Math.round(t[2]*100)/100]);
    p.rows=[["Date","Description","Amount"],...tx]; p.map={header:0,date:0,descs:[1],descAlt:[],amount:2,debit:-1,credit:-1,cat:-1,person:-1,mode:"single",flip:false}; p.viaClaude=true;
  }catch(e){ toast("Couldn't read it: "+e.message); }
  p.busy=null; renderReviews();
}


/* ---------- files in ---------- */
const drop=$("drop");
["dragenter","dragover"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop",ev=>handleFiles(ev.dataTransfer.files));
$("fileIn").onchange=e=>{ handleFiles([...e.target.files]); e.target.value=""; };
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
function defaultPerson(){ const people=[...new Set(S.files.map(x=>x.person))]; return S.me.name||people[0]||"Me"; }
async function handleFiles(list){
  for(const f of list){
    const p={id:Math.random().toString(36).slice(2,10), name:f.name, person:defaultPerson()};
    try{
      if(/\.pdf$/i.test(f.name)||f.type==="application/pdf"){
        p.pdf=true; p.buf=await f.arrayBuffer(); S.pending.push(p); p.busy="Reading PDF…"; renderReviews();
        try{ await pdfToRows(p); }
        catch(e){ if(e&&e.name==="PasswordException"){ p.locked=true; p.pwBad=e.code===2; p.rows=[]; p.map={header:-1,date:0,descs:[],amount:0,mode:"single"}; } else { S.pending=S.pending.filter(x=>x!==p); toast(e.message||"Couldn't read that PDF"); } }
        p.busy=null;
      } else {
        p.rows=await readSheet(f); p.map=detect(p.rows);
        const tx=extract(p.rows,p.map);
        if(p.map.mode==="single"&&tx.length){ const pos=tx.filter(t=>t[2]>0).length/tx.length; if(pos>.8) p.map.flip=true; }
        S.pending.push(p);
      }
    }catch(e){ toast(e.message||"Couldn't read that file"); }
  }
  renderReviews();
}
function renderReviews(){
  const box=$("reviews"); box.innerHTML="";
  for(const p of S.pending){
    const el=document.createElement("div"); el.className="review";
    const people=[...new Set([...S.files.map(x=>x.person),...S.pending.map(x=>x.person)])];
    if(p.busy){ el.innerHTML=`<div class="row"><span class="spinner"></span><b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b></div><p class="small muted">${esc(p.busy)}</p>`; box.appendChild(el); continue; }
    if(p.locked){
      el.innerHTML=`<b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b>
        <p class="small">${p.pwBad?"That password didn't work. Try again.":"This PDF is password-protected. Enter the password your bank set for e-statements."}</p>
        <div class="row"><input type="text" id="pw-${p.id}" autocomplete="off" placeholder="Statement password" style="flex:1"><button class="btn sm" data-a="unlock">Unlock</button><button class="btn ghost sm" data-a="skip">Discard</button></div>
        <p class="small muted">The password is used only to open the file on this screen and is never saved.</p>`;
      el.querySelector('[data-a="unlock"]').onclick=async()=>{ const pw=el.querySelector("input").value; p.busy="Unlocking…"; renderReviews(); try{ await pdfToRows(p,pw); }catch(e){ p.pwBad=true; } p.busy=null; renderReviews(); };
      el.querySelector('[data-a="skip"]').onclick=()=>{ S.pending=S.pending.filter(x=>x!==p); renderReviews(); };
      box.appendChild(el); continue;
    }
    const tx=extract(p.rows,p.map);
    const hdr = p.map.header>=0 ? p.rows[p.map.header] : (p.rows[0]||[]).map((_,i)=>"Column "+(i+1));
    const opt=(sel)=>`<option value="-1">(none)</option>`+hdr.map((h,i)=>`<option value="${i}" ${i===sel?"selected":""}>${esc(String(h||"Column "+(i+1)).slice(0,30))}</option>`).join("");
    const claudeBtn = p.pdf&&S.ai ? `<button class="btn ghost sm" data-a="claude">${p.viaClaude?"Read again with AI":"Read with AI instead"}</button>` : "";
    const nCat=tx.filter(t=>t[3]).length, peopleIn=[...new Set(tx.map(t=>t.person).filter(Boolean))];
    const colNote = (nCat||peopleIn.length) ? `<p class="small muted">${nCat?`Keeps the categories already in this file for ${nCat} rows and learns them for next time. `:""}${peopleIn.length?`Splits rows by the Person column: ${esc(peopleIn.join(", "))}.`:""}</p>` : "";
    const pdfNote = colNote + (p.pdf ? `<p class="small muted">${p.viaClaude?"Read by AI. Check a few rows against the statement.":tx.length?`Read from the PDF text (${p.pdfKind==="bank"?"bank account layout":"card layout"}). If rows look wrong, ${S.ai?"try reading it with AI.":"try the bank's CSV export instead."}`:p.noText?"This PDF is a scanned image with no text to read."+(S.ai?" AI can read it instead.":""):"No transaction lines were recognised."+(S.ai?" AI can read it instead.":"")}</p>` : "");
    el.innerHTML=`<div class="row" style="justify-content:space-between"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b><span class="small ${tx.length?"":"out"}">${tx.length} transactions found</span></div>
      <label class="small" style="display:flex;flex-direction:column;gap:4px;font-weight:700">Whose account is this?
        <input type="text" id="person-${p.id}" list="pl-${p.id}" value="${esc(p.person)}" data-k="person" placeholder="e.g. Bryan, Mum, Dad"><datalist id="pl-${p.id}">${people.map(x=>`<option value="${esc(x)}">`).join("")}</datalist></label>
      ${pdfNote}
      <details ${tx.length||p.pdf?"":"open"}><summary class="small" style="cursor:pointer;font-weight:700">Adjust columns</summary>
        <div class="grid2" style="margin-top:8px">
          <label>Date<select data-k="date">${opt(p.map.date)}</select></label>
          <label>Description<select data-k="desc">${opt(p.map.descs[0]??-1)}</select></label>
          <label>Amount layout<select data-k="mode"><option value="single" ${p.map.mode==="single"?"selected":""}>One amount column</option><option value="split" ${p.map.mode==="split"?"selected":""}>Separate debit / credit</option></select></label>
          ${p.map.mode==="single"?`<label>Amount<select data-k="amount">${opt(p.map.amount)}</select></label>`:`<label>Debit (out)<select data-k="debit">${opt(p.map.debit)}</select></label><label>Credit (in)<select data-k="credit">${opt(p.map.credit)}</select></label>`}
          <label>Header row<select data-k="header">${p.rows.slice(0,40).map((r,i)=>`<option value="${i}" ${i===p.map.header?"selected":""}>Row ${i+1}: ${esc(r.slice(0,3).join(" | ").slice(0,30))}</option>`).join("")}<option value="-1" ${p.map.header<0?"selected":""}>No header</option></select></label>
        </div>
        ${p.map.mode==="single"?`<label class="small row" style="margin-top:8px"><input type="checkbox" data-k="flip" ${p.map.flip?"checked":""}> Purchases show as positive numbers (credit card statement)</label>`:""}
      </details>
      <div class="preview"><table>${tx.slice(0,4).map(t=>`<tr><td class="num">${t[0]}</td><td style="white-space:normal">${esc(t[1].slice(0,50))}</td><td class="num ${t[2]<0?"out":"in"}" style="text-align:right">${fmt(t[2])}</td></tr>`).join("")||`<tr><td class="out">No rows recognised yet.</td></tr>`}</table></div>
      <div class="row"><button class="btn sm" data-a="add" ${tx.length?"":"disabled"}>Add ${tx.length} transactions</button>${claudeBtn}<button class="btn ghost sm" data-a="skip">Discard</button></div>`;
    el.querySelectorAll("[data-k]").forEach(inp=>inp.onchange=()=>{
      const k=inp.dataset.k, v=inp.type==="checkbox"?inp.checked:inp.value;
      if(k==="person"){ p.person=v.trim()||"Me"; return; }
      if(k==="desc"){ p.map.descs=[+v].filter(x=>x>=0); p.map.descAlt=[]; }
      else if(k==="mode") p.map.mode=v;
      else if(k==="flip") p.map.flip=v;
      else p.map[k]=+v;
      if(k==="header"&&p.map.header>=0){ const m2=detect(p.rows.slice(p.map.header)); if(m2.header===0){ Object.assign(p.map,{date:m2.date,amount:m2.amount,debit:m2.debit,credit:m2.credit,descs:m2.descs,descAlt:m2.descAlt,mode:m2.mode}); } }
      renderReviews();
    });
    el.querySelector('[data-k="person"]').oninput=e=>{ p.person=e.target.value.trim()||"Me"; };
    el.querySelector('[data-a="add"]').onclick=()=>addFile(p);
    el.querySelector('[data-a="skip"]').onclick=()=>{ S.pending=S.pending.filter(x=>x!==p); renderReviews(); };
    const cb=el.querySelector('[data-a="claude"]'); if(cb) cb.onclick=()=>readWithClaude(p);
    box.appendChild(el);
  }
}
function txKey(t){ return t[0]+"|"+t[1]+"|"+t[2]; }
async function addFile(p){
  const learned={};
  const tx=extract(p.rows,p.map).map(t=>{
    if(t[3]&&CATS.includes(t[3])){ const k=merchantKey(t[1]); if(t[3]!=="Other"&&!S.rules[k]) learned[k]=t[3]; setCat(t,t[3],0); }
    else { const [c,u]=categorize(t[1],t[2]); setCat(t,c,u); }
    return t; });
  if(Object.keys(learned).length) setRules(learned);
  const groups={}; tx.forEach(t=>{ const who=t.person||p.person; (groups[who]=groups[who]||[]).push(t); });
  const msgs=[]; let i=0;
  S.pending=S.pending.filter(x=>x!==p); renderReviews();
  for(const [who,rows] of Object.entries(groups)){
    const seen=new Set(S.files.filter(f=>f.person===who).flatMap(f=>f.tx.map(txKey)));
    const fresh=rows.filter(t=>!seen.has(txKey(t))).map(t=>t.slice());
    const file={id:p.id+(i?"-"+i:""), name:p.name, person:who, added:Date.now()+i, tx:fresh, shared:false, mine:true}; i++;
    S.files.push(file); await createFile(file);
    msgs.push(`${fresh.length} for ${who}${rows.length>fresh.length?` (${rows.length-fresh.length} duplicates skipped)`:""}`);
  }
  if(p.person&&!S.me.name&&p.person!=="Me"){ S.me.name=p.person; api("PUT","/api/me",{name:p.person}).catch(()=>{}); }
  refreshFam(); render();
  const nL=Object.keys(learned).length;
  toast(`Added ${msgs.join(", ")}${nL?`. Learned ${nL} merchant${nL===1?"":"s"}`:""}`);
  autoLookup();
}

/* ---------- storage (Cloudflare API) ---------- */
async function api(method, path, body){
  let r;
  try{ r=await fetch(path,{method, headers:body?{"content-type":"application/json"}:{}, body:body?JSON.stringify(body):undefined, credentials:"same-origin"}); }
  catch(e){ throw new Error("You seem to be offline. Check your connection."); }
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok){ const err=new Error((j&&j.error)||("Server error "+r.status)); err.status=r.status; err.login=!!(j&&j.login); throw err; }
  return j;
}
function setSave(t){ $("saveState").textContent=t; }
async function createFile(file){
  try{ const r=await api("POST","/api/files",{id:file.id,name:file.name,person:file.person,added:file.added,shared:false,tx:file.tx}); file.id=r.id; setSave("Saved"); }
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
async function removeFile(file){
  try{ await api("DELETE","/api/files/"+encodeURIComponent(file.id)); S.files=S.files.filter(f=>f!==file); refreshFam(); render(); toast("Removed "+file.name); }
  catch(e){ toast("Couldn't remove: "+e.message); }
}
async function moveFile(file, shared){
  try{ await api("PUT","/api/files/"+encodeURIComponent(file.id),{shared}); file.shared=shared; render();
    toast(shared?`${file.name} is now shared with family`:`${file.name} is private again`); }
  catch(e){ toast("Couldn't change sharing: "+e.message); render(); }
}
let ruleQ={}, ruleT;
function setRule(k,c){ setRules({[k]:c}); }
function setRules(map){
  Object.assign(S.rules,map); Object.assign(ruleQ,map); clearTimeout(ruleT);
  ruleT=setTimeout(async()=>{ const set=ruleQ; ruleQ={}; try{ await api("POST","/api/rules",{set}); }catch(e){ setSave("Couldn't save merchant rules: "+e.message); } },300);
}
let budT;
function saveBudgets(){ clearTimeout(budT); const scope=S.person, data=S.budgets[scope]||{};
  budT=setTimeout(async()=>{ try{ await api("PUT","/api/budgets",{scope,data}); }catch(e){ toast("Couldn't save budgets: "+e.message); } },300); }
function refreshFam(){
  const own=new Set(S.files.flatMap(f=>f.tx.map(txKey)));
  S.famView=S.family.map(f=>({...f, tx:f.tx.filter(t=>!own.has(txKey(t)))})).filter(f=>f.tx.length);
}
async function loadData(){
  const d=await api("GET","/api/data");
  S.rules=d.rules||{}; S.notes=d.notes||{}; S.lookups=d.lookups||{}; S.budgets=d.budgets||{};
  S.files=(d.files||[]).filter(f=>f.mine).map(f=>({...f,mine:true}));
  S.family=(d.files||[]).filter(f=>!f.mine).map(f=>({...f,ro:true}));
  // apply household rules that arrived since last visit (from family or web lookups)
  let changed=0;
  S.files.forEach(f=>{ let ch=false; f.tx.forEach(t=>{ if(t[3]==="Other"||t[4]===1){ const c=S.rules[merchantKey(t[1])]; if(c&&c!==t[3]){ setCat(t,c,0); ch=true; changed++; } } }); if(ch) saveFile(f); });
  refreshFam();
  return changed;
}

/* ---------- example data ---------- */
function exampleFiles(){
  if(S.ex) return S.ex;
  const out=[]; const people=["Me","Mum"];
  const base=new Date(); base.setDate(1);
  const items={Me:[["MINDEF NS ALLOWANCE",+1200,1],["MST GRAB* A-9TNTTNG SI SGP",-14.6,9],["MST MCDONALD'S (PRWP) SI SGP",-9.8,6],["SPOTIFY P3D2A",-11.98,1],["BAT SHOPEE SG MP Singapore SGP",-42.5,2],["MOOMOO SG FUND TRANSFER",-300,1],["KOI THE TAMPINES",-4.9,5],["TCG CARDS CARD SHOP",-68,1],["MST BUS/MRT 943155847 SI SGP",-28.4,1],["GOLDEN VILLAGE",-15.5,1],["ICT PayNow Transfer 6755039 To: MUM",-150,1],["ICT PayNow Transfer 8415015 To: AISG E-COMMERCE PRIVATE LI",-23.9,1]],
             Mum:[["SALARY ABC PTE LTD",+4800,1],["NTUC FAIRPRICE",-86.3,4],["SHENG SIONG",-54.2,3],["SP SERVICES",-138.6,1],["SINGTEL MOBILE",-45,1],["NETFLIX.COM",-18.98,1],["GREAT EASTERN LIFE",-220,1],["GUARDIAN HEALTH",-23.4,1],["KOUFU FOODCOURT",-7.2,8],["UNIQLO ION",-59.9,1],["PAYNOW FROM SON",+150,1],["ENDOWUS FUND",-800,1]]};
  people.forEach(p=>{ const tx=[];
    for(let m=2;m>=0;m--){ const d0=new Date(base.getFullYear(),base.getMonth()-m,1);
      items[p].forEach(([desc,amt,n],k)=>{ for(let j=0;j<n;j++){ const day=Math.min(28,1+((k*7+j*5+m*3)%27)); const wob=Math.abs(amt)<100?(1+((k+j+m)%5-2)*.08):1;
        tx.push([iso(d0.getFullYear(),d0.getMonth()+1,day),desc,Math.round(amt*wob*100)/100,""]); } }); }
    tx.forEach(t=>{ const [c,u]=autoCategory(t[1],t[2],{}); setCat(t,c,u); });
    out.push({id:"ex-"+p,name:`Example ${p} statement.csv`,person:p,example:true,tx}); });
  S.ex=out; return out;
}

/* ---------- analysis helpers ---------- */
function fmt(n,short){ const a=Math.abs(n); const s=short&&a>=10000?(a/1000).toFixed(a>=100000?0:1)+"k":a.toLocaleString("en-SG",{minimumFractionDigits:short?0:2,maximumFractionDigits:short?0:2}); return (n<0?"−":"")+"$"+s; }
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(t){ const d=document.createElement("div"); d.className="toast"; d.setAttribute("role","status"); d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),2600); }
function isExample(){ return !S.files.length && !S.famView.length; }
function srcFiles(){ return isExample()?exampleFiles():[...S.files,...S.famView]; }
function allTx(){ return srcFiles().flatMap(f=>f.tx.map((t,i)=>({date:t[0],desc:t[1],amt:t[2],cat:t[3],unsure:t[4]===1,person:f.person,file:f,idx:i,ro:!!f.ro}))); }
function months(tx){ return [...new Set(tx.map(t=>t.date.slice(0,7)))].sort(); }
function inRange(tx){
  const ms=months(allTx()); if(S.range==="all") return tx;
  if(S.range.startsWith("last")){ const n=+S.range.slice(4); const keep=new Set(ms.slice(-n)); return tx.filter(t=>keep.has(t.date.slice(0,7))); }
  return tx.filter(t=>t.date.startsWith(S.range));
}
const byPerson=tx=>S.person==="All"?tx:tx.filter(t=>t.person===S.person);
function scoped(){ return byPerson(inRange(allTx())); }
function monthLabel(ym){ const [y,m]=ym.split("-"); return new Date(+y,+m-1,1).toLocaleDateString("en-SG",{month:"short",year:"2-digit"}); }
function ymNow(){ const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1); }
const isSpend=t=>t.amt<0&&!NON_SPEND.has(t.cat);
function totals(tx){
  let inc=0,spend=0,save=0;
  tx.forEach(t=>{ if(t.cat==="Income"&&t.amt>0) inc+=t.amt; else if(t.cat==="Investing") save+=-t.amt; else if(!NON_SPEND.has(t.cat)) spend+=-t.amt; });
  return {inc,spend,save};
}
function spendByCat(tx){ const o={}; tx.forEach(t=>{ if(!NON_SPEND.has(t.cat)&&t.cat) o[t.cat]=(o[t.cat]||0)-t.amt; }); for(const k in o) if(o[k]<=0) delete o[k]; return o; }
function recurring(tx){
  const g={}; tx.filter(isSpend).forEach(t=>{ const k=merchantKey(t.desc); (g[k]=g[k]||[]).push(t); });
  return Object.entries(g).map(([k,a])=>{ const ms=new Set(a.map(t=>t.date.slice(0,7))); const avg=a.reduce((s,t)=>s-t.amt,0)/a.length; const spread=Math.max(...a.map(t=>-t.amt))-Math.min(...a.map(t=>-t.amt));
    return {k,ms:ms.size,count:a.length,avg,ok:ms.size>=2&&a.length<=ms.size+1&&spread<=Math.max(2,avg*.15),person:[...new Set(a.map(t=>t.person))].join(", ")}; })
    .filter(r=>r.ok).sort((a,b)=>b.avg-a.avg);
}
function peopleList(){ return [...new Set(srcFiles().map(f=>f.person))]; }
function pcol(p){ const i=peopleList().indexOf(p); return PCOL[(i<0?0:i)%PCOL.length]; }

/* ---------- budgets ---------- */
function budgetMonth(){ if(/^\d{4}-\d{2}$/.test(S.range)) return S.range; const ms=months(byPerson(allTx())); return ms[ms.length-1]||ymNow(); }
function budgetRows(){
  const B=S.budgets[S.person]||{}; const m=budgetMonth();
  const spent=spendByCat(byPerson(allTx()).filter(t=>t.date.startsWith(m)));
  const cur=m===ymNow(); const d=new Date(); const dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); const frac=cur?d.getDate()/dim:1;
  const rows=Object.entries(B).filter(([c,v])=>v>0).map(([c,b])=>{ const s=spent[c]||0; const proj=cur?s/Math.max(frac,.05):s;
    const state = s>b?"bad":(cur&&proj>b*1.02&&frac>=.25)||s>=b*.8?"warn":"ok"; return {c,b,s,proj,state}; }).sort((a,b)=>b.s/b.b-a.s/a.b);
  const unb=Object.entries(spent).filter(([c])=>!(B[c]>0)).reduce((s,[,v])=>s+v,0);
  return {rows,m,cur,frac,unb,has:rows.length>0};
}
function renderBudgets(){
  const R=budgetRows(); const who=S.person==="All"?"Everyone":S.person;
  $("budgetTitle").textContent=`Budgets · ${monthLabel(R.m)}${R.cur?" so far":""}`;
  if(!R.has){
    $("budgets").innerHTML=`<p class="small muted">No monthly budgets set for ${esc(who)}. Set a limit per category to track progress here and get a warning when you're heading over.</p><div class="row"><button class="btn sm" id="budSuggest">Suggest from my spending</button></div>`;
    $("budSuggest").onclick=()=>openBudgetEditor(true); $("budgetEdit").textContent="Set budgets"; return;
  }
  $("budgetEdit").textContent="Edit";
  $("budgets").innerHTML=R.rows.map(r=>{ const pct=Math.min(100,r.s/r.b*100);
    const pill = r.state==="bad"?`<span class="pill bad">Over by ${fmt(r.s-r.b,1)}</span>`:r.state==="warn"?(R.cur&&r.proj>r.b?`<span class="pill warn">On pace for ${fmt(r.proj,1)}</span>`:`<span class="pill warn">${Math.round(r.s/r.b*100)}% used</span>`):`<span class="pill ok">${fmt(r.b-r.s,1)} left</span>`;
    return `<div class="bud"><span class="nm"><i style="background:var(${COLORS[r.c]||"--c9"})"></i>${esc(r.c)} ${pill}</span><span class="amt">${fmt(r.s,1)} <span class="muted">/ ${fmt(r.b,1)}</span></span>
      <span class="track" role="img" aria-label="${esc(r.c)}: ${Math.round(r.s/r.b*100)}% of budget"><b style="width:${pct}%;background:var(${r.state==="bad"?"--out":r.state==="warn"?"--warn":"--accent"})"></b>${R.cur?`<u style="left:${R.frac*100}%"></u>`:""}</span></div>`; }).join("")
    + `<p class="small muted">${R.cur?"The thin line marks how far through the month we are. ":""}${R.unb>0?`Spending in categories without a budget: ${fmt(R.unb,1)}.`:""}</p>`;
}
function suggestBudgets(){
  const tx=byPerson(allTx()); const now=ymNow(); const ms=months(tx).filter(m=>m!==now).slice(-3); const out={};
  if(!ms.length) return out;
  const s=spendByCat(tx.filter(t=>ms.includes(t.date.slice(0,7))));
  for(const [c,v] of Object.entries(s)){ const avg=v/ms.length; if(avg>=5&&c!=="Other") out[c]=Math.ceil(avg/10)*10; }
  return out;
}
function openBudgetEditor(suggest){
  document.querySelectorAll(".sheet").forEach(s=>s.remove());
  const cur={...(S.budgets[S.person]||{})}; const sug=suggest?suggestBudgets():null; const vals=sug&&Object.keys(sug).length?sug:cur;
  const sh=document.createElement("div"); sh.className="sheet"; sh.setAttribute("role","dialog"); sh.setAttribute("aria-label","Monthly budgets");
  sh.innerHTML=`<div class="row" style="justify-content:space-between"><b>Monthly budgets · ${esc(S.person==="All"?"Everyone":S.person)}</b><button class="btn ghost sm" data-x>Close</button></div>
    <p class="small muted">Monthly limit in SGD. Leave blank for no budget. ${sug?"Filled in from your average over the last few full months, rounded up.":""}</p>
    <div class="binputs">${SPEND_CATS.map(c=>`<label>${esc(c)}<input type="number" inputmode="decimal" min="0" step="10" id="bud-${c.replace(/\W/g,"")}" data-c="${esc(c)}" value="${vals[c]||""}"></label>`).join("")}</div>
    <div class="row"><button class="btn sm" data-save>Save budgets</button><button class="btn ghost sm" data-avg>Fill from my average</button><button class="btn ghost sm" data-clear>Clear all</button></div>`;
  document.body.appendChild(sh);
  sh.querySelector("[data-x]").onclick=()=>sh.remove();
  sh.querySelector("[data-avg]").onclick=()=>{ const s=suggestBudgets(); if(!Object.keys(s).length){ toast("Needs at least one full month of statements"); return; } sh.querySelectorAll("input[data-c]").forEach(i=>i.value=s[i.dataset.c]||""); };
  sh.querySelector("[data-clear]").onclick=()=>sh.querySelectorAll("input[data-c]").forEach(i=>i.value="");
  sh.querySelector("[data-save]").onclick=()=>{ const o={}; sh.querySelectorAll("input[data-c]").forEach(i=>{ const v=parseFloat(i.value); if(v>0) o[i.dataset.c]=Math.round(v*100)/100; });
    if(Object.keys(o).length) S.budgets[S.person]=o; else delete S.budgets[S.person]; saveBudgets(); sh.remove(); render(); toast("Budgets saved"); };
}
function renderAlerts(){
  const box=$("alerts"); box.innerHTML="";
  if(isExample()) return;
  const R=budgetRows(); if(!R.has) return;
  const latest=months(byPerson(allTx())).slice(-1)[0]; if(R.m!==latest) return;
  const over=R.rows.filter(r=>r.state==="bad"), pace=R.rows.filter(r=>r.state==="warn"&&R.cur&&r.proj>r.b);
  if(over.length) box.insertAdjacentHTML("beforeend",`<div class="alert bad" role="alert"><b>Over budget in ${over.length===1?esc(over[0].c):over.length+" categories"}</b><span>${over.map(r=>`${esc(r.c)}: ${fmt(r.s,1)} of ${fmt(r.b,1)}`).join(" · ")}</span></div>`);
  if(pace.length) box.insertAdjacentHTML("beforeend",`<div class="alert"><b>Heading over budget</b><span>${pace.map(r=>`${esc(r.c)}: on pace for ${fmt(r.proj,1)} of ${fmt(r.b,1)}`).join(" · ")}</span></div>`);
}

/* ---------- render ---------- */
function render(){
  const isEx=isExample(); $("exampleBanner").hidden=!isEx;
  const all=allTx(); const people=peopleList();
  if(S.person!=="All"&&!people.includes(S.person)) S.person="All";
  $("personChips").innerHTML=["All",...people].map(p=>`<button class="chip" aria-pressed="${p===S.person}" data-p="${esc(p)}">${esc(p==="All"?"Everyone":p)}</button>`).join("");
  $("personChips").querySelectorAll("button").forEach(b=>b.onclick=()=>{ S.person=b.dataset.p; S.txShown=60; render(); });
  const ms=months(all);
  const opts=[["all","All time"],["last3","Last 3 months"],["last6","Last 6 months"],["last12","Last 12 months"],...ms.slice().reverse().map(m=>[m,monthLabel(m)])];
  if(!opts.some(o=>o[0]===S.range)) S.range="all";
  $("rangeSel").innerHTML=opts.map(([v,l])=>`<option value="${v}" ${v===S.range?"selected":""}>${l}</option>`).join("");

  const tx=scoped(); const T=totals(tx); const nM=Math.max(1,months(tx).length);
  $("tIn").textContent=fmt(T.inc,1); $("tInS").textContent=fmt(T.inc/nM,1)+" / month";
  $("tOut").textContent=fmt(T.spend,1); $("tOutS").textContent=fmt(T.spend/nM,1)+" / month";
  $("tSave").textContent=fmt(T.save,1); $("tSaveS").textContent="Investing transfers";
  const rate=T.inc?Math.round((T.inc-T.spend)/T.inc*100):0;
  $("tRate").textContent=T.inc?rate+"%":"–"; $("tRate").className="v "+(rate>=20?"in":rate<0?"out":"");
  $("tRateS").textContent=T.inc?"of income not spent":"No income found";

  renderAlerts(); renderBudgets(); renderTriage();
  renderMonthChart(tx);
  const byCat={}; const byCatP={};
  tx.filter(isSpend).forEach(t=>{ byCat[t.cat]=(byCat[t.cat]||0)-t.amt; (byCatP[t.cat]=byCatP[t.cat]||{})[t.person]=((byCatP[t.cat]||{})[t.person]||0)-t.amt; });
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]); const tot=cats.reduce((s,c)=>s+c[1],0)||1; const max=cats[0]?cats[0][1]:1;
  const split=S.person==="All"&&people.length>1;
  $("cats").innerHTML=cats.map(([c,v])=>`<button class="cat" data-c="${esc(c)}" aria-pressed="${S.cat===c}"><span class="nm"><i style="background:var(${COLORS[c]||"--c9"})"></i>${esc(c)} <span class="muted small" style="font-weight:400">${Math.round(v/tot*100)}%</span></span><span class="amt">${fmt(v,1)}</span>
    <span class="track"><span style="display:flex;width:${v/max*100}%">${split?people.map(p=>`<b style="width:${((byCatP[c]||{})[p]||0)/v*100}%;background:var(${pcol(p)})"></b>`).join(""):`<b style="width:100%;background:var(${COLORS[c]||"--c9"})"></b>`}</span></span></button>`).join("")||`<p class="muted small">No spending in this period.</p>`;
  $("cats").querySelectorAll(".cat").forEach(b=>b.onclick=()=>{ S.cat=S.cat===b.dataset.c?null:b.dataset.c; S.txShown=60; renderTx(); $("txList").scrollIntoView({behavior:"smooth",block:"start"}); });
  $("personLegend").innerHTML=split?people.map(p=>`<span><i style="background:var(${pcol(p)})"></i>${esc(p)}</span>`).join(""):"";
  const mm={}; tx.filter(isSpend).forEach(t=>{ const k=merchantKey(t.desc); mm[k]=mm[k]||{v:0,n:0}; mm[k].v-=t.amt; mm[k].n++; });
  $("merchants").innerHTML=Object.entries(mm).sort((a,b)=>b[1].v-a[1].v).slice(0,7).map(([k,o])=>`<div><span>${esc(k)} <span class="muted small">×${o.n}</span></span><span class="num">${fmt(o.v,1)}</span></div>`).join("")||`<p class="muted small">Nothing yet.</p>`;
  const rec=recurring(tx);
  $("recurring").innerHTML=rec.slice(0,8).map(r=>`<div><span>${esc(r.k)} <span class="muted small">${esc(r.person)}</span></span><span class="num">${fmt(r.avg)}/mo</span></div>`).join("")+(rec.length?`<div><span class="muted">Total per month</span><span class="num"><b>${fmt(rec.reduce((s,r)=>s+r.avg,0))}</b></span></div>`:`<p class="muted small">Needs at least two months of statements.</p>`);
  renderTrends(); renderCompare(); renderTx(); renderFiles();
}
function niceTop(mx){ const step=Math.pow(10,Math.floor(Math.log10(Math.max(1,mx)))); const nice=[1,2,2.5,5,10].map(x=>x*step).find(x=>mx/x<=5)||step*10; return {top:Math.max(nice,Math.ceil(mx/nice)*nice), nice}; }
function axis(W,pl,pr,y,top,nice){ let g=""; for(let v=0;v<=top+1e-9;v+=nice){ g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-6}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${fmt(v,1)}</text>`; } return g; }
function renderMonthChart(tx){
  const ms=months(tx); const W=640,H=220,pl=52,pr=8,pt=12,pb=28;
  if(!ms.length){ $("monthChart").innerHTML=`<p class="muted small">No data in this period.</p>`; return; }
  const data=ms.map(m=>{ const T=totals(tx.filter(t=>t.date.startsWith(m))); return {m,inc:T.inc,out:Math.max(0,T.spend)}; });
  const {top,nice}=niceTop(Math.max(1,...data.map(d=>Math.max(d.inc,d.out))));
  const y=v=>pt+(H-pt-pb)*(1-v/top); const bw=(W-pl-pr)/data.length; const b=Math.min(26,bw*.32);
  let g=axis(W,pl,pr,y,top,nice);
  data.forEach((d,i)=>{ const cx=pl+bw*i+bw/2;
    g+=`<rect x="${cx-b-1}" y="${y(d.inc)}" width="${b}" height="${y(0)-y(d.inc)}" rx="3" fill="var(--in)"><title>${monthLabel(d.m)} in: ${fmt(d.inc)}</title></rect>`;
    g+=`<rect x="${cx+1}" y="${y(d.out)}" width="${b}" height="${y(0)-y(d.out)}" rx="3" fill="var(--out)"><title>${monthLabel(d.m)} spending: ${fmt(d.out)}</title></rect>`;
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="11" fill="var(--muted)">${monthLabel(d.m)}</text>`; });
  $("monthChart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(280,data.length*70)}px" role="img" aria-label="Money in and spending per month">${g}</svg>`;
}
function renderTrends(){
  let base=byPerson(allTx()); if(!/^\d{4}-\d{2}$/.test(S.range)) base=inRange(base);
  const ms=months(base);
  if(ms.length<2){ $("trendChips").innerHTML=""; $("trendChart").innerHTML=`<p class="muted small">Trends need at least two months of statements.</p>`; $("trendLegend").innerHTML=""; $("changes").innerHTML=""; $("changesTitle").hidden=true; $("trendNote").textContent=""; return; }
  $("changesTitle").hidden=false;
  const spendTx=base.filter(isSpend);
  const catTot=spendByCat(spendTx); const top=Object.entries(catTot).sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>x[0]);
  if(S.trendCat&&!top.includes(S.trendCat)) S.trendCat=null;
  $("trendChips").innerHTML=[null,...top].map(c=>`<button class="chip" aria-pressed="${c===S.trendCat}" data-c="${c?esc(c):""}">${c?esc(c):"All spending"}</button>`).join("");
  $("trendChips").querySelectorAll("button").forEach(b=>b.onclick=()=>{ S.trendCat=b.dataset.c||null; renderTrends(); });
  const sel=S.trendCat?spendTx.filter(t=>t.cat===S.trendCat):spendTx;
  const people=peopleList(); const stack=S.person==="All"&&people.length>1;
  const data=ms.map(m=>{ const o={m,tot:0,by:{}}; sel.filter(t=>t.date.startsWith(m)).forEach(t=>{ o.tot-=t.amt; o.by[t.person]=(o.by[t.person]||0)-t.amt; }); return o; });
  const W=640,H=200,pl=52,pr=8,pt=14,pb=28; const avg=data.reduce((s,d)=>s+d.tot,0)/data.length;
  const {top:tp,nice}=niceTop(Math.max(1,avg,...data.map(d=>d.tot)));
  const y=v=>pt+(H-pt-pb)*(1-v/tp); const bw=(W-pl-pr)/data.length; const b=Math.min(34,bw*.55);
  let g=axis(W,pl,pr,y,tp,nice);
  const col=S.trendCat?(COLORS[S.trendCat]||"--c9"):"--out";
  data.forEach((d,i)=>{ const cx=pl+bw*i+bw/2; let acc=0;
    if(stack){ people.forEach(p=>{ const v=Math.max(0,d.by[p]||0); if(!v) return; g+=`<rect x="${cx-b/2}" y="${y(acc+v)}" width="${b}" height="${y(acc)-y(acc+v)}" fill="var(${pcol(p)})"><title>${esc(p)} ${monthLabel(d.m)}: ${fmt(v)}</title></rect>`; acc+=v; }); }
    else g+=`<rect x="${cx-b/2}" y="${y(Math.max(0,d.tot))}" width="${b}" height="${y(0)-y(Math.max(0,d.tot))}" rx="3" fill="var(${col})"><title>${monthLabel(d.m)}: ${fmt(d.tot)}</title></rect>`;
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="11" fill="var(--muted)">${monthLabel(d.m)}</text>`; });
  g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".6"/><text x="${W-pr}" y="${y(avg)-5}" text-anchor="end" font-size="11" fill="var(--ink)" font-family="IBM Plex Mono, monospace">avg ${fmt(avg,1)}</text>`;
  $("trendChart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(280,data.length*60)}px" role="img" aria-label="${esc(S.trendCat||"All spending")} by month">${g}</svg>`;
  $("trendLegend").innerHTML=stack?people.map(p=>`<span><i style="background:var(${pcol(p)})"></i>${esc(p)}</span>`).join("")+`<span><i style="background:none;border-top:2px dashed var(--ink);height:0;border-radius:0"></i>Average</span>`:`<span><i style="background:none;border-top:2px dashed var(--ink);height:0;border-radius:0"></i>Average per month</span>`;
  const last=data[data.length-1], prev=data.slice(-4,-1); const pavg=prev.reduce((s,d)=>s+d.tot,0)/prev.length;
  const cur=last.m===ymNow();
  $("trendNote").textContent=pavg?`${monthLabel(last.m)}${cur?" so far":""}: ${fmt(last.tot,1)}, ${Math.abs(Math.round((last.tot/pavg-1)*100))}% ${last.tot>=pavg?"above":"below"} the ${prev.length}-month average`:"";
  // biggest category changes: latest month vs previous months
  const curC=spendByCat(spendTx.filter(t=>t.date.startsWith(last.m)));
  const prevC={}; prev.forEach(d=>{ const c=spendByCat(spendTx.filter(t=>t.date.startsWith(d.m))); for(const k in c) prevC[k]=(prevC[k]||0)+c[k]/prev.length; });
  const ch=[...new Set([...Object.keys(curC),...Object.keys(prevC)])].map(k=>({k,cur:curC[k]||0,avg:prevC[k]||0,d:(curC[k]||0)-(prevC[k]||0)})).filter(x=>Math.abs(x.d)>=10).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,5);
  $("changesTitle").textContent=`${monthLabel(last.m)}${cur?" so far":""} vs the previous ${prev.length===1?"month":prev.length+" months"}`;
  $("changes").innerHTML=ch.map(x=>`<div><span>${esc(x.k)} <span class="muted small">${fmt(x.cur,1)} vs ${fmt(x.avg,1)} avg</span></span><span class="num ${x.d>0?"out":"in"}">${x.d>0?"▲":"▼"} ${fmt(Math.abs(x.d),1)}</span></div>`).join("")||`<p class="muted small">No category moved by more than $10.</p>`;
}
function renderCompare(){
  const tx=inRange(allTx()); const people=[...new Set(tx.map(t=>t.person))];
  $("cmpPanel").hidden=people.length<2; if(people.length<2) return;
  $("cmpNote").textContent=S.range==="all"?"All time":($("rangeSel").selectedOptions[0]||{}).textContent||"";
  const nM=Math.max(1,months(tx).length);
  $("peopleCards").innerHTML=people.map(p=>{ const pt=tx.filter(t=>t.person===p); const T=totals(pt); const c=Object.entries(spendByCat(pt.filter(isSpend))).sort((a,b)=>b[1]-a[1])[0]; const rate=T.inc?Math.round((T.inc-T.spend)/T.inc*100):null;
    return `<div class="pcard"><h3><i style="background:var(${pcol(p)})"></i>${esc(p)}</h3><div><span class="muted">Money in</span><span class="in">${fmt(T.inc,1)}</span></div><div><span class="muted">Spending</span><span class="out">${fmt(T.spend,1)}</span></div><div><span class="muted">Per month</span><span>${fmt(T.spend/nM,1)}</span></div><div><span class="muted">Invested</span><span>${fmt(T.save,1)}</span></div><div><span class="muted">Savings rate</span><span>${rate==null?"–":rate+"%"}</span></div><div><span class="muted">Top category</span><span style="font-family:var(--body);font-weight:600;text-align:right">${c?esc(c[0]):"–"}</span></div></div>`; }).join("");
  const sp=tx.filter(isSpend); const top=Object.entries(spendByCat(sp)).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  const vals={}; sp.forEach(t=>{ (vals[t.cat]=vals[t.cat]||{})[t.person]=((vals[t.cat]||{})[t.person]||0)-t.amt; });
  const mx=Math.max(1,...top.flatMap(c=>people.map(p=>(vals[c]||{})[p]||0)));
  $("cmpBars").innerHTML=top.map(c=>`<div class="r"><span>${esc(c)}</span>${people.map(p=>{ const v=(vals[c]||{})[p]||0; return `<div class="b"><i style="width:${v/mx*100}%;background:var(${pcol(p)})" title="${esc(p)}"></i><span class="num">${fmt(v,1)}</span></div>`; }).join("")}</div>`).join("")+`<div class="legend">${people.map(p=>`<span><i style="background:var(${pcol(p)})"></i>${esc(p)}</span>`).join("")}</div>`;
}

/* ---------- needs a category (triage + web lookup) ---------- */
function triageGroups(includeGuesses){
  const g={};
  S.files.forEach(f=>f.tx.forEach(t=>{ const unsure=t[4]===1; if(!(t[3]==="Other"||(includeGuesses&&unsure))) return;
    const k=merchantKey(t[1]); const o=g[k]=g[k]||{k,items:[],out:0,inn:0,people:new Set(),cat:t[3],guess:unsure&&t[3]!=="Other"};
    o.items.push({t,f}); if(t[2]<0) o.out-=t[2]; else o.inn+=t[2]; o.people.add(f.person); }));
  return Object.values(g).sort((a,b)=>(S.skipped.has(a.k)-S.skipped.has(b.k))||(b.out+b.inn)-(a.out+a.inn));
}
function applyRulesLocally(keys){
  const touched=new Set();
  S.files.forEach(f=>f.tx.forEach(t=>{ const k=merchantKey(t[1]); if(keys.has(k)&&S.rules[k]){ setCat(t,S.rules[k],0); touched.add(f); } }));
  touched.forEach(saveFile);
}
function applyCategory(k, c){
  setRule(k,c); applyRulesLocally(new Set([k]));
  S.skipped.delete(k); S.triDone++; render(); toast(`${k} → ${c}`);
}
function lookupText(k){ const l=S.lookups[k]; return l&&l.what?l:null; }
function renderTriage(){
  const box=$("triage"); const real=S.files.length>0;
  $("triagePanel").hidden=!real; if(!real) return;
  const others=triageGroups(false), withG=triageGroups(true); const gCount=withG.length-others.length;
  const groups=S.triageAll?withG:others;
  const unlooked=groups.filter(g=>!S.lookups[g.k]).length;
  $("aiCatBtn").hidden=!S.ai||!unlooked||S.looking;
  $("aiCatBtn").textContent=`Identify ${unlooked} with AI`;
  const toggle=gCount>0?`<label class="small row"><input type="checkbox" id="triAll" ${S.triageAll?"checked":""}> Also check ${gCount} automatic guess${gCount===1?"":"es"} (mostly PayNow to people)</label>`:"";
  const status=S.looking?`<div class="guess"><div class="row"><span class="spinner"></span><span>${esc(S.looking)}</span></div></div>`:"";
  if(!groups.length){ box.innerHTML=`${status}<p class="small"><b>Everything has a category.</b> ${S.triDone?`You sorted ${S.triDone} merchant${S.triDone===1?"":"s"} this session.`:""}</p>${toggle}`; bindTriAll(); return; }
  const left=groups.length, done=S.triDone; const g=groups[0];
  const total=groups.reduce((s,x)=>s+x.out,0);
  const ex=g.items.slice().sort((a,b)=>b.t[0].localeCompare(a.t[0])).slice(0,4);
  const lk=lookupText(g.k);
  const chips=CATS.filter(c=>c!=="Other").map(c=>`<button class="chip" data-c="${c}" aria-pressed="${g.guess&&g.cat===c}">${c}</button>`).join("");
  box.innerHTML=`${status}<div class="row" style="justify-content:space-between"><span class="small"><b>${left}</b> merchant${left===1?"":"s"} to sort · ${fmt(total,1)} out</span>${done?`<span class="small muted">${done} sorted</span>`:""}</div>
    <div class="progress" aria-hidden="true"><b style="width:${done/(done+left)*100}%"></b></div>
    <div class="triage">
      <div><div class="key">${esc(g.k)}</div><span class="small muted">${g.items.length} transaction${g.items.length===1?"":"s"} · ${g.out?fmt(g.out,1)+" out":""}${g.out&&g.inn?" · ":""}${g.inn?fmt(g.inn,1)+" in":""} · ${esc([...g.people].join(", "))}</span></div>
      <div class="ex">${ex.map(({t})=>`<span title="${esc(t[1])}">${t[0].slice(5)} · ${esc(parseDesc(t[1]).raw.slice(0,70))}</span><span class="${t[2]<0?"out":"in"}">${fmt(t[2])}</span>`).join("")}</div>
      ${lk?`<div class="guess"><span><b>AI guess:</b> ${esc(lk.what)}${lk.confidence?` <span class="muted">(${esc(lk.confidence)} confidence)</span>`:""}</span>${lk.category&&CATS.includes(lk.category)&&lk.category!=="Other"?`<div class="row"><button class="btn sm" data-use="${esc(lk.category)}">Use ${esc(lk.category)}</button></div>`:""}</div>`
        :g.guess?`<div class="guess"><span>Best guess: <b>${esc(g.cat)}</b></span><div class="row"><button class="btn sm" data-keep>Keep ${esc(g.cat)}</button></div></div>`:""}
      <span class="label">Pick a category for everything from ${esc(g.k)}</span>
      <div class="chips">${chips}</div>
      <div class="row"><button class="btn ghost sm" data-skip>Skip for now</button>${S.ai&&!lk&&!S.looking?`<button class="btn ghost sm" data-ask>Look this up</button>`:""}</div>
    </div>${toggle}`;
  box.querySelectorAll(".chips [data-c]").forEach(b=>b.onclick=()=>applyCategory(g.k,b.dataset.c));
  const keep=box.querySelector("[data-keep]"); if(keep) keep.onclick=()=>applyCategory(g.k,g.cat);
  const use=box.querySelector("[data-use]"); if(use) use.onclick=()=>applyCategory(g.k,use.dataset.use);
  box.querySelector("[data-skip]").onclick=()=>{ S.skipped.add(g.k); renderTriage(); };
  const ask=box.querySelector("[data-ask]"); if(ask) ask.onclick=()=>lookupGroups([g]);
  bindTriAll();
}
function bindTriAll(){ const c=$("triAll"); if(c) c.onchange=()=>{ S.triageAll=c.checked; renderTriage(); }; }
function cleanExample(t){ return parseDesc(t[1]).raw.replace(/\d{4}-\d{4}-\d{4}-\d{4}/g,"").replace(/\b\d{6,}\b/g,"").replace(/\s+/g," ").trim().slice(0,90); }
async function lookupGroups(groups){
  groups=groups.filter(g=>!S.lookups[g.k]); if(!groups.length||S.looking) return;
  const BATCH=10; let applied=0, done=0; const keys=new Set();
  try{
    for(let i=0;i<groups.length;i+=BATCH){
      const part=groups.slice(i,i+BATCH);
      S.looking=`Looking up ${groups.length-done} merchant${groups.length-done===1?"":"s"} with AI…`; renderTriage();
      const res=await api("POST","/api/lookup",{merchants:part.map(g=>({name:g.k, examples:[...new Set(g.items.map(({t})=>cleanExample(t)))].slice(0,2), direction:g.out&&!g.inn?"out":g.inn&&!g.out?"in":"both"}))});
      for(const [k,r] of Object.entries(res.results||{})){ S.lookups[k]=r; if(r.applied&&CATS.includes(r.category)){ S.rules[k]=r.category; keys.add(k); applied++; } }
      done+=part.length;
    }
    applyRulesLocally(keys);
    toast(applied?`Filed ${applied} of ${groups.length} from the AI lookup${groups.length>applied?". The rest need you.":""}`:`Lookup done. ${groups.length===1?"This one needs":"These need"} you.`);
  }catch(e){ toast("Lookup stopped: "+e.message); }
  S.looking=null; render();
}
function autoLookup(){ if(S.ai&&S.autoLookup!==false) lookupGroups(triageGroups(false).slice(0,40)); }
$("aiCatBtn").onclick=()=>lookupGroups((S.triageAll?triageGroups(true):triageGroups(false)).slice(0,60));

/* ---------- transactions ---------- */
function renderTx(){
  let tx=scoped(); if(S.cat) tx=tx.filter(t=>t.cat===S.cat);
  if(S.q){ const q=S.q.toLowerCase(); tx=tx.filter(t=>t.desc.toLowerCase().includes(q)||merchantKey(t.desc).toLowerCase().includes(q)); }
  tx.sort((a,b)=>b.date.localeCompare(a.date));
  $("clearCat").hidden=!S.cat; $("clearCat").textContent=S.cat?`✕ ${S.cat}`:"";
  $("txCount").textContent=`${tx.length} items · ${fmt(tx.reduce((s,t)=>s+t.amt,0))}`;
  $("txList").innerHTML=tx.slice(0,S.txShown).map((t,i)=>`<div class="tx"><span class="d" title="${esc(t.desc)}">${esc(merchantKey(t.desc))}</span><span class="a ${t.amt<0?"out":"in"}">${fmt(t.amt)}</span><span class="m"><span class="num">${t.date}</span><span>${esc(t.person)}</span><button class="catbtn" data-i="${i}">${esc(t.cat)}${t.unsure?"?":""} ▾</button></span></div>`).join("")||`<p class="muted small">No transactions match.</p>`;
  $("txList").querySelectorAll(".catbtn").forEach(b=>b.onclick=()=>openCat(tx[+b.dataset.i]));
  $("moreTx").hidden=tx.length<=S.txShown;
}
$("moreTx").onclick=()=>{ S.txShown+=100; renderTx(); };
$("clearCat").onclick=()=>{ S.cat=null; renderTx(); };
$("search").oninput=e=>{ S.q=e.target.value.trim(); S.txShown=60; renderTx(); };
$("rangeSel").onchange=e=>{ S.range=e.target.value; S.txShown=60; render(); };
$("budgetEdit").onclick=()=>openBudgetEditor(false);
function openCat(t){
  if(t.ro){ toast(`This is from ${t.person}'s shared statement. They can change its categories.`); return; }
  document.querySelectorAll(".sheet").forEach(s=>s.remove());
  const k=merchantKey(t.desc);
  const sh=document.createElement("div"); sh.className="sheet"; sh.setAttribute("role","dialog");
  sh.innerHTML=`<div class="row" style="justify-content:space-between"><b style="min-width:0">${esc(k)}</b><button class="btn ghost sm" data-x>Close</button></div>
  <p class="small muted" style="word-break:break-word">${esc(t.desc)} · ${fmt(t.amt)} · ${t.date}</p>
  <label class="small row"><input type="checkbox" id="allLike" checked> Apply to everything from <b>${esc(k)}</b></label>
  <div class="chips">${CATS.map(c=>`<button class="chip" aria-pressed="${c===t.cat}" data-c="${c}">${c}</button>`).join("")}</div>`;
  document.body.appendChild(sh);
  sh.querySelector("[data-x]").onclick=()=>sh.remove();
  sh.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
    const c=b.dataset.c, all=$("allLike").checked; const touched=new Set();
    if(all){ setRule(k,c); srcFiles().filter(f=>!f.ro).forEach(f=>f.tx.forEach(x=>{ if(merchantKey(x[1])===k){ setCat(x,c,0); touched.add(f); } })); }
    else { setCat(t.file.tx[t.idx],c,0); touched.add(t.file); }
    touched.forEach(f=>{ if(!f.example) saveFile(f); });
    sh.remove(); render(); toast(all?`All ${k} → ${c}`:`Moved to ${c}`);
  });
}

/* ---------- files & family ---------- */
function renderFiles(){
  const real=S.files;
  $("files").innerHTML=real.length||S.family.length?"":`<p class="muted small">No statements added yet.</p>`;
  real.forEach(f=>{ const ds=f.tx.map(t=>t[0]).sort(); const shared=!!f.shared;
    const el=document.createElement("div"); el.className="file";
    el.innerHTML=`<span style="min-width:0"><b>${esc(f.name)}</b><span class="small muted">${esc(f.person)} · ${f.tx.length} items · ${ds[0]||""} to ${ds[ds.length-1]||""}</span></span><span class="acts"><button class="share" aria-pressed="${shared}" data-share>${shared?"Shared with family":"Private"}</button><button class="btn ghost sm" data-rm>Remove</button></span>`;
    const btn=el.querySelector("[data-rm]");
    btn.onclick=()=>{ if(btn.dataset.armed){ removeFile(f); } else { btn.dataset.armed=1; btn.textContent="Tap to confirm"; btn.style.color="var(--out)"; setTimeout(()=>{ if(btn.isConnected){ delete btn.dataset.armed; btn.textContent="Remove"; btn.style.color=""; } },3000); } };
    const sb=el.querySelector("[data-share]"); sb.onclick=()=>{ sb.disabled=true; moveFile(f, !shared); };
    $("files").appendChild(el); });
  S.family.forEach(f=>{ const ds=f.tx.map(t=>t[0]).sort(); const shown=(S.famView.find(x=>x.id===f.id)||{tx:[]}).tx.length;
    const el=document.createElement("div"); el.className="file";
    el.innerHTML=`<span style="min-width:0"><b>${esc(f.name)}</b><span class="small muted">${esc(f.person)} · shared by ${esc(f.ownerName||"family")} · ${f.tx.length} items · ${ds[0]||""} to ${ds[ds.length-1]||""}${shown<f.tx.length?` · ${f.tx.length-shown} already in your files`:""}</span></span><span class="pill ok">Family</span>`;
    $("files").appendChild(el); });
  $("famRefresh").hidden=false;
  const fn=$("famNote"); fn.hidden=false;
  const nShared=real.filter(f=>f.shared).length;
  fn.innerHTML=`<b>Family sharing</b><span>Statements are private to you until you tap <b>Private</b> to share one. Shared statements show up for everyone you've let into this site, and theirs show up for you. Merchant categories are shared by the whole household, so anything one person sorts helps everyone.</span><span class="muted">${nShared} of yours shared · ${S.family.length} from family.</span>`;
  $("privacyNote").innerHTML=`Signed in as ${esc(S.me.email||"")} · <button class="btn ghost sm" id="signOutBtn" type="button">Sign out</button><br>Statements are stored in your family's own Cloudflare database.`;
  $("signOutBtn").onclick=signOut;
  $("exportBtn").hidden=!real.length&&!S.famView.length;
  let rs=$("resortBtn"); if(!rs&&real.length){ rs=document.createElement("button"); rs.className="btn ghost sm"; rs.id="resortBtn"; $("exportBtn").parentNode.appendChild(rs); }
  if(rs){ rs.hidden=!real.length; if(!rs.dataset.armed) rs.textContent="Re-run auto-sort"; rs.onclick=()=>{ if(rs.dataset.armed){ delete rs.dataset.armed; resortAll(); } else { rs.dataset.armed=1; rs.textContent="Tap again: keeps merchant rules, resets one-off changes"; setTimeout(()=>{ if(rs.isConnected&&rs.dataset.armed){ delete rs.dataset.armed; rs.textContent="Re-run auto-sort"; } },4000); } }; }
}
function resortAll(){
  let changed=0; S.files.forEach(f=>{ let ch=false; f.tx.forEach(t=>{ const [c,u]=categorize(t[1],t[2]); if(t[3]!==c||(t[4]===1)!==!!u){ setCat(t,c,u); ch=true; changed++; } }); if(ch) saveFile(f); });
  render(); toast(changed?`Re-sorted ${changed} transactions`:"Nothing changed");
}
$("famRefresh").onclick=async()=>{ const b=$("famRefresh"); b.disabled=true; try{ await loadData(); render(); toast(`${S.family.length} family statement${S.family.length===1?"":"s"}`); }catch(e){ toast("Couldn't refresh: "+e.message); } b.disabled=false; };

/* ---------- AI analysis & export ---------- */
$("aiBtn").onclick=async()=>{
  if(!S.ai){ toast("Analysis needs Workers AI turned on for this site"); return; }
  const tx=scoped(); if(!tx.length){ toast("No transactions in this period"); return; }
  const ms=months(tx); const people=[...new Set(tx.map(t=>t.person))];
  const monthly=ms.map(m=>{ const T=totals(tx.filter(t=>t.date.startsWith(m))); return `${m}: in ${T.inc.toFixed(0)}, spend ${T.spend.toFixed(0)}, invested ${T.save.toFixed(0)}`; }).join("\n");
  const perPerson=people.map(p=>{ const pt=tx.filter(t=>t.person===p); const T=totals(pt); const c=spendByCat(pt.filter(isSpend));
    return `${p}: in ${T.inc.toFixed(0)}, spend ${T.spend.toFixed(0)}, invested ${T.save.toFixed(0)}; by category: ${Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v.toFixed(0)).join(", ")}`; }).join("\n");
  const mm={}; tx.filter(isSpend).forEach(t=>{ const k=merchantKey(t.desc); mm[k]=(mm[k]||0)-t.amt; });
  const top=Object.entries(mm).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+" "+v.toFixed(0)).join(", ");
  const rec=recurring(tx).map(r=>`${r.k} ~${r.avg.toFixed(2)}/mo`).join(", ");
  const R=budgetRows(); const bud=R.has?R.rows.map(r=>`${r.c}: budget ${r.b.toFixed(0)}, spent ${r.s.toFixed(0)} in ${R.m}${R.cur?" so far":""}`).join("; "):"none set";
  const unsorted=tx.filter(t=>t.cat==="Other"&&t.amt<0).reduce((s,t)=>s-t.amt,0);
  const out=$("aiOut"); out.hidden=false; out.innerHTML=`<div class="row"><span class="spinner"></span><span class="muted">Analysing ${ms.length} months…</span></div>`;
  $("aiBtn").disabled=true;
  try{
    const r=await api("POST","/api/analyse",{data:{period:`${ms[0]} to ${ms[ms.length-1]} (${ms.length} months)`, monthly, perPerson, top, recurring:rec||"none detected", budgets:`(${S.person==="All"?"household":S.person}) ${bud}`, unsorted:unsorted.toFixed(0), goals:$("goals").value.trim()||"none given", hasBudgets:R.has}});
    out.textContent=r.text||"No answer came back.";
  }catch(e){ out.textContent="Analysis failed: "+e.message; }
  finally{ $("aiBtn").disabled=false; }
};
$("exportBtn").onclick=()=>{
  const rows=[["Date","Person","Merchant","Description","Amount","Category"],...allTx().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t.person,merchantKey(t.desc),t.desc,t.amt,t.cat])];
  const csv=rows.map(r=>r.map(v=>{ const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }).join(",")).join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="family-ledger.csv"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
};

/* ---------- boot ---------- */
async function boot(){
  render(); setSave("Loading…");
  try{
    S.me=await api("GET","/api/me"); S.ai=!!S.me.ai;
    const changed=await loadData();
    setSave(S.files.length?"Saved":"");
    render();
    if(changed) toast(`Applied ${changed} new household categor${changed===1?"y":"ies"}`);
    if(S.ai&&triageGroups(false).some(g=>!S.lookups[g.k])) autoLookup();
  }catch(e){
    setSave(e.status===401||e.status===403?"Not signed in":"Offline");
    if(e.login){ showLogin(e.status===403?e.message:""); return; }
    $("alerts").innerHTML=`<div class="alert bad" role="alert"><b>${e.status===401||e.status===403?"You're not signed in":"Couldn't reach the server"}</b><span>${esc(e.message)}</span></div>`;
  }
}

/* ---------- Google sign-in ---------- */
async function showLogin(msg){
  const box=$("alerts");
  box.innerHTML=`<div class="alert" role="region" aria-label="Sign in" style="flex-direction:column;align-items:flex-start;gap:10px">
    <b>Sign in to Family Ledger</b>
    <span class="muted">Use the Google account your family added.</span>
    <div id="gBtn" style="min-height:44px"></div>
    <span id="loginMsg" role="status" class="muted">${esc(msg||"")}</span></div>`;
  let cfg; try{ cfg=await api("GET","/api/login-config"); }catch(e){ $("loginMsg").textContent="Couldn't reach the server."; return; }
  if(!cfg.clientId){ $("loginMsg").textContent="Google sign-in isn't set up yet."; return; }
  if(!window.google||!google.accounts){
    await new Promise((ok,bad)=>{ const sc=document.createElement("script"); sc.src="https://accounts.google.com/gsi/client"; sc.async=true; sc.onload=ok; sc.onerror=bad; document.head.appendChild(sc); }).catch(()=>{});
  }
  if(!window.google||!google.accounts){ $("loginMsg").textContent="Couldn't load Google sign-in. Check your connection or ad blocker."; return; }
  google.accounts.id.initialize({ client_id:cfg.clientId, ux_mode:"popup", callback:async(res)=>{
    $("loginMsg").textContent="Signing in…";
    try{ await api("POST","/api/login",{credential:res.credential}); box.innerHTML=""; boot(); }
    catch(e){ $("loginMsg").textContent=e.message; }
  }});
  google.accounts.id.renderButton($("gBtn"),{theme:"outline",size:"large",shape:"pill",text:"signin_with"});
}
async function signOut(){ try{ await api("POST","/api/logout",{}); }catch(e){} if(window.google&&google.accounts) google.accounts.id.disableAutoSelect(); location.reload(); }
boot();
