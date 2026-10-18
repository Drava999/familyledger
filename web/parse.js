/*PURE-START*/
const CATS = ["Food & Dining","Groceries","Transport","Shopping","Bills & Utilities","Subscriptions","Health","Entertainment","Travel","Education","Insurance","Cash","Income","Transfers","Investing","People","Other"];
const NON_SPEND = new Set(["Income","Transfers","Investing","People"]);
const SPEND_CATS = CATS.filter(c=>!NON_SPEND.has(c));
const RULES = [
 [/salary|payroll|mindef|\bsaf\b|ns pay|allowance|interest earned|interest credit|dividend|cashback|refund|rebate|giro.*(cpf|iras) refund/i,"Income"],
 [/grab ?food|foodpanda|deliveroo|mcdonald|kfc|kentucky fried|burger|starbucks|toast box|ya kun|kopitiam|koufu|food ?court|hawker|restaurant|\bcafe\b|caf[eé]|coffee|bakery|bread|subway|pizza|sushi|\bbbq\b|\bmala\b|ma la|hotpot|hai ?di ?lao|shi li fang|bubble tea|\btea\b|liho|\bkoi\b|gong cha|chicken|chicke\b|eatery|kitchen|dining|jollibee|swensen|din tai fung|old chang kee|mr bean|luckin|shake shack|4 ?fingers|brotherbird|biryani|nasi ?lemak|nasilemak|zensho|sukiya|japanese r|marche|helens|hanbaobao|vending|mos burger|texas chicken|popeyes|saizeriya|pastamania|ichiban|ajisen|yoshinoya|pepper lunch|crystal jade|tim ho wan|paris baguette|bengawan|prata|kopi|canteen|battercatch|fong sheng|chefgenie|acai|wanton|noodle|\bstall\b|sarbat|kanom|\bthai\b|vegetarian|coca.?cola|\brice\b|\bmee\b|laksa|satay|dim sum|ramen|bak kut teh|kway|porridge|\bdrinks?\b|dessert|bistro|\bgrill\b|\bdeli\b|\bfood\b|eats\b/i,"Food & Dining"],
 [/ntuc|fairprice|sheng siong|cold storage|\bgiant\b|prime supermarket|don don donki|redmart|market place|supermarket|mustafa|7.?eleven|cheers|lifestylemart|minimart|provision/i,"Groceries"],
 [/grab|gojek|\btada\b|ryde|\bcdg\b|comfort|citycab|cabcharge|taxi|simplygo|transitlink|ez-?link|bus\b|\bmrt\b|smrt|sbs transit|\bshell\b|esso|caltex|\bspc\b|sinopec|parking|\berp\b|\blta\b|zig\b/i,"Transport"],
 [/netflix|spotify|apple\.com|itunes|icloud|youtube|disney|google storage|google one|google g1|chatgpt|openai|claude|anthropic|adobe|microsoft 365|game pass|playstation plus|patreon|canva|notion|cloudflare|telegram|pricecharting|github|dropbox|nordvpn|expressvpn|squarespace|wix|godaddy|namecheap/i,"Subscriptions"],
 [/sp services|sp group|singtel|starhub|\bm1\b|circles|\bgiga\b|simba|myrepublic|town council|conservancy|\bpub\b|\bhdb\b|utilities/i,"Bills & Utilities"],
 [/guardian|watsons|unity pharm|clinic|polyclinic|hospital|dental|medical|pharmacy|raffles medical|parkway|healthway|optical|vision|activesg|fitness|\bgym\b|anytime fitness|physio/i,"Health"],
 [/golden village|\bgv\b|shaw theatres|cathay cineplex|steam|playstation|nintendo|epic games|sistic|ticket|klook|bowling|karaoke|escape room|arcade|timezone|mobile legends|google play|genshin|hoyoverse|riot games|blackout|speedyninja|war robots|my\.? ?games|codashop|seagm|razer gold|google play|house ?\+? ?bubble|spa\b|massage/i,"Entertainment"],
 [/airasia|scoot|singapore airlines|jetstar|cathay pacific|agoda|booking\.com|airbnb|expedia|trip\.com|hotel|changi/i,"Travel"],
 [/\bntu\b|\bnus\b|\bsmu\b|tuition|udemy|coursera|popular book|kinokuniya|school|\bexam\b|skillsfuture/i,"Education"],
 [/prudential|great eastern|income insurance|ntuc income|aviva|singlife|manulife|\bfwd\b|\baia\b|insurance/i,"Insurance"],
 [/moomoo|tiger brokers|syfe|endowus|stashaway|ibkr|interactive brokers|saxo|\bcdp\b|poems|\bfutu\b|webull|fsmone|\bssb\b|t-bill|\bcpf\b|plus500|stonex|phillip|\buob ?kay ?hian|tiger brok|\bidt u\d{7,9}\b/i,"Investing"],
 [/\batm\b|cash withdrawal|wdl atm|nets cash/i,"Cash"],
 [/shopee|spaylater|lazada|amazon|taobao|qoo10|uniqlo|zara|h&m|ikea|courts|harvey norman|best denki|challenger|decathlon|daiso|muji|popmart|pop mart|carousell|ebay|etsy|\btcg\b|tiktok shop|mr diy|moneymax|sun and sand|beauty|salon|barber|sephora|cotton on|charles & keith|love bonito|typo|miniso|valu\$|don don|aisg|antom|alipay|\banta\b|my greatest child|nike|adidas|puma|skechers|courts|popular\b|book ?shop|bookstore/i,"Shopping"],
 [/payment.{0,6}thank you|thank you.{0,6}payment|fast payment|funds? transfer|i-?bank|\bibg\b|\bgiro\b|transfer|\btfr\b|\btrf\b|bill payment.*card|card payment|credit card payment|top ?up|topup|paylah|\bwise\b|revolut|youtrip|instarem/i,"Transfers"],
];
const MON = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function pad(n){return String(n).padStart(2,"0");}
function iso(y,m,d){ if(y<100) y+=2000; if(m<1||m>12||d<1||d>31) return null; return `${y}-${pad(m)}-${pad(d)}`; }
function parseDate(v){
  if(v==null||v==="") return null;
  if(v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth()+1, v.getDate());
  if(typeof v==="number" && v>20000 && v<80000){ const d=new Date(Math.round((v-25569)*864e5)); return iso(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate()); }
  const s=String(v).trim(); let m;
  if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return iso(+m[1],+m[2],+m[3]);
  if((m=s.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{2,4})\b/))) return iso(+m[3],+m[2],+m[1]); // day-first (Singapore)
  if((m=s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,4})[a-z]*[-\/ ,]+(\d{2,4})/)) && MON[m[2].toLowerCase()]) return iso(+m[3],MON[m[2].toLowerCase()],+m[1]);
  if((m=s.match(/^([A-Za-z]{3,4})[a-z]*[ -](\d{1,2}),?[ -](\d{2,4})/)) && MON[m[1].toLowerCase()]) return iso(+m[3],MON[m[1].toLowerCase()],+m[2]);
  return null;
}
function parseNum(v){
  if(v==null||v==="") return null;
  if(typeof v==="number") return v;
  let s=String(v).trim(); if(!s) return null;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bDR\b|DB$/i.test(s) || /-$/.test(s);
  const cr = /\bCR\b/i.test(s);
  s = s.replace(/[^0-9.]/g,""); if(!s||!/\d/.test(s)) return null;
  const n = parseFloat(s); if(isNaN(n)) return null;
  return cr ? n : (neg ? -n : n);
}

/* --- merchant names: turn raw bank text into a stable, readable merchant --- */
const MONTHS3="JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
const DROP_WORDS=new Set(["PTE","LTD","PRIVATE","LIMITED","PT","LLP","INC","CO","OTHR","NETS","CONTACTLESS","POINT","OF","SALE","TRANSACTION","PURCHASE","DEBIT","CARD","VISA","MASTERCARD","SI"]);
const END_WORDS=new Set(["SG","SGP","SIN","SING","SINGAP","SINGAPO","SINGAPOR","SINGAPORE","GP","USA","US","IRL","GBR","GB","MYS","MY","PE","DU","IN","ON","AN","PR","HKG","HK","AUS","JPN","JP","IDN","THA","TH","NLD","DEU","FRA","CHN","KOR","TWN","CAN","LUX","CA","NL"]);
function mainDesc(desc){
  // v1 stored several columns joined with " · "; use the most informative piece
  if(desc.includes(" · ")){ const parts=desc.split(" · ").map(x=>x.trim()).filter(Boolean); return parts.sort((a,b)=>b.length-a.length)[0]||desc; }
  return desc;
}
function parseDesc(desc){
  const raw=mainDesc(String(desc||"")).replace(/\s+/g," ").trim();
  let s=raw, kind="card", m;
  if((m=s.match(/\b(to|from):\s*(.+?)\s*(?:\bOTHR\b.*)?$/i)) && m[2].trim().length>1){ s=m[2]; kind=/paynow|fast|nets qr|ict|ibg/i.test(raw)?"paynow":"card"; if(/nets qr/i.test(raw)) kind="card"; }
  else if((m=s.match(/\bNETS\s+\d+\s*,\s*(.+?)(?:\s+NETS CONTACTLESS)?\s*$/i))) s=m[1];
  const acct=raw.match(/\b\d{3}-\d{5,7}-\d\b/);
  const lead=(raw.match(/^([A-Z]{2,5})\b/)||[])[1]||"";
  s=s.replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g," ")
     .replace(/\b[A-Z]{3}\d[\d,]*\.\d{2}\b/g," ")
     .replace(new RegExp("\\b\\d{1,2}("+MONTHS3+")\\b","gi")," ")
     .replace(/\([^)]*\)?/g," ")
     .replace(/\*.*$/,"")
     .replace(/@.*$/,"")
     .replace(/\s-\s*\S.*$/,"")
     .replace(/\.(com|co|sg|io|net|org)\b/gi,"")
     .replace(/\bPRIVATE LI(M|MI|MIT|MITE|MITED)?\b/gi," ");
  for(let i=0;i<3;i++) s=s.replace(/^\s*(ICT|IDT|TRF|RTF|ADV|POS|MST|BAT|NETS|IBG|GIRO|FAST|PAYNOW TRANSFER|INCOMING PAYNOW REF|PAYNOW|BILL PAYMENT)\b\s*/i,"");
  s=s.replace(/^(QASHIER|ADYEN SG|ADYEN|STRIPE|SQ|SUMUP|GKASH|FOMO ?PAY|SHOPBACK|HITPAY|2C2P)[-\s*]+/i,"");
  let w=s.toUpperCase().replace(/[^A-Z0-9& ]/g," ").split(/\s+/).filter(Boolean)
    .filter(t=>!DROP_WORDS.has(t))
    .filter(t=>!/^\d{3,}$/.test(t))
    .filter(t=>!(/\d/.test(t)&&/[A-Z]/.test(t)&&((t.match(/\d/g)||[]).length>=4)&&t.length>=6))
    .filter(t=>!(t.length===1&&/[A-Z]/.test(t)));
  while(w.length>1 && END_WORDS.has(w[w.length-1])) w.pop();
  w=w.filter((t,i)=>t!==w[i-1]);
  let key=(acct&&kind!=="paynow")?"TRANSFER "+acct[0]:w.slice(0,2).join(" ");
  if(!key){
    if(acct) key="TRANSFER "+acct[0];
    else { const t=raw.replace(/^[A-Z]{2,5}\s+/,"").split(/[\s.]+/)[0]||""; key=(lead+" "+t.toUpperCase().replace(/[^A-Z0-9]/g,"")).trim().slice(0,24)||raw.slice(0,20).toUpperCase(); }
  }
  return {key, name:w.join(" ")||key, kind, raw};
}
function oldMerchantKey(desc){ return desc.toUpperCase().replace(/\d{3,}/g," ").replace(/\b(SINGAPORE|SGP|SG|PTE|LTD|POS|NETS|VISA|MASTERCARD|DEBIT|PURCHASE|TRANSACTION|REF|SI)\b/g," ").replace(/[^A-Z& ]/g," ").replace(/\s+/g," ").trim().split(" ").slice(0,3).join(" ") || desc.slice(0,20).toUpperCase(); }
const BIZ=/\b(PTE|LTD|LIMITED|PRIVATE|LLP|ENTERPRISE|TRADING|CONCEPTS|CAFE|SHOP|STORE|MART|RESTAURANT|E-?COMMERCE|HOLDINGS|SERVICES|GROUP|CENTRE|CENTER|KITCHEN|FOOD|BAKERY|TRANSACTION|SG-|ADYEN|QASHIER|STRIPE|CLINIC|STUDIO|ACADEMY|MARKET|SUPPLY|TECH|MEDIA)\b/i;
// returns [category, unsure(0|1)]
function autoCategory(desc, amt, rules){
  const d=parseDesc(desc); rules=rules||{};
  if(rules[d.key]) return [rules[d.key],0];
  const ok=oldMerchantKey(desc); if(rules[ok]) return [rules[ok],0];
  const hay = d.kind==="paynow" ? d.name : d.raw+" "+d.name;
  for(const [re,c] of RULES){
    if(!re.test(hay)) continue;
    if(c==="Income"&&amt<0) continue;
    if(c==="Shopping"&&amt>0&&/carousell|etsy|tcg/i.test(hay)) return ["Income",1];
    return [c,0];
  }
  if(d.kind==="paynow"){
    if(BIZ.test(d.raw.replace(/^.*\b(?:to|from):/i,""))) return [amt>0?"Income":"Other", amt>0?1:0];
    return ["People",1];
  }
  return amt>0 ? ["Income",1] : ["Other",0];
}

/* --- PDF statements: rebuild rows from positioned text --- */
const AMT_RE=/^\(?-?S?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?$/;
const SKIP_RE=/balance (brought|carried) forward|^total|opening balance|closing balance|sub-?total|previous balance|new balance|minimum (payment|amount)|statement balance|credit limit|^balance$|payment due/i;
function pdfWords(line){
  const out=[];
  line.items.forEach(it=>{
    const str=it.str; if(!str.trim()) return;
    const re=/\S+/g; let m; const L=Math.max(1,str.length);
    while((m=re.exec(str))){ const x0=it.x+it.w*(m.index/L), x1=it.x+it.w*((m.index+m[0].length)/L); out.push({t:m[0],x0,x1,cx:(x0+x1)/2}); }
  });
  return out.sort((a,b)=>a.x0-b.x0);
}
function pdfDateAt(words, year, stmtMonth){
  // returns {date, used} for a date at the start of the line
  if(!words.length) return null;
  const a=words[0].t, b=(words[1]||{}).t||"", c=(words[2]||{}).t||"";
  let m, d, mo, y=null, used=0;
  if((m=a.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/))){ d=+m[1]; mo=+m[2]; y=m[3]?+m[3]:null; used=1; }
  else if((m=a.match(/^(\d{1,2})[\-\s]?([A-Za-z]{3,4})(?:[\-]?(\d{2,4}))?$/)) && MON[m[2].toLowerCase()]){ d=+m[1]; mo=MON[m[2].toLowerCase()]; y=m[3]?+m[3]:null; used=1; }
  else if(/^\d{1,2}$/.test(a) && MON[b.toLowerCase().replace(/[^a-z]/g,"")]){ d=+a; mo=MON[b.toLowerCase().replace(/[^a-z]/g,"")]; used=2; if(/^\d{4}$/.test(c)){ y=+c; used=3; } }
  else return null;
  if(!y){ y=year; if(stmtMonth && mo>stmtMonth) y=year-1; }
  const dt=iso(y,mo,d); return dt?{date:dt,used}:null;
}
function parsePdfLines(lines, fullText){
  // statement date / year
  let year=null, stmtMonth=null;
  const sd=fullText.match(/statement date\s*:?\s*(\d{1,2}[\s\-\/][A-Za-z]{3,9}[\s\-\/,]*\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if(sd){ const p=parseDate(sd[1].replace(/,/g," ").replace(/\s+/g," ")); if(p){ year=+p.slice(0,4); stmtMonth=+p.slice(5,7); } }
  if(!year){ const ys={}; (fullText.match(/\b20[1-4]\d\b/g)||[]).forEach(y=>ys[y]=(ys[y]||0)+1); const best=Object.entries(ys).sort((a,b)=>b[1]-a[1])[0]; year=best?+best[0]:new Date().getFullYear(); }
  let cols=null, prevBal=null, last=null, cont=0; const tx=[]; let kind="card";
  for(const line of lines){
    const words=pdfWords(line); if(!words.length) continue;
    const text=words.map(w=>w.t).join(" ");
    if(/withdraw|debit/i.test(text) && /deposit|credit/i.test(text) && !/\d+\.\d{2}/.test(text)){
      const f=re=>{ const w=words.find(w=>re.test(w.t)); return w?w.cx:null; };
      cols={wd:f(/withdraw|debit/i), dep:f(/deposit|credit/i), bal:f(/balance/i)}; kind="bank"; last=null; continue;
    }
    // amounts with optional CR/DR suffix
    const amts=[];
    for(let i=0;i<words.length;i++){
      const t=words[i].t; if(!AMT_RE.test(t)) continue;
      let v=parseFloat(t.replace(/[^0-9.]/g,"")); const nx=(words[i+1]||{}).t||"";
      let cr=/^CR$/i.test(nx), neg=/^\(|^-/.test(t);
      amts.push({v,cx:words[i].cx,cr,neg,i});
    }
    const dt=pdfDateAt(words, year, stmtMonth);
    let start=dt?dt.used:0;
    if(dt){ const d2=pdfDateAt(words.slice(start), year, stmtMonth); if(d2) start+=d2.used; }
    const firstAmt=amts.length?amts[0].i:words.length;
    const desc=words.slice(start, firstAmt).map(w=>w.t).filter(t=>!/^(CR|DR)$/i.test(t)).join(" ").trim();
    if(SKIP_RE.test(desc)||SKIP_RE.test(text)){
      if(/brought forward|opening balance|previous balance/i.test(text) && amts.length) prevBal=amts[amts.length-1].v*(amts[amts.length-1].cr?1:1);
      last=null; continue;
    }
    if(dt && amts.length && desc){
      let amt=null, bal=null;
      if(cols && (cols.wd!=null||cols.dep!=null)){
        for(const a of amts){
          const opts=[["wd",cols.wd],["dep",cols.dep],["bal",cols.bal]].filter(o=>o[1]!=null).sort((p,q)=>Math.abs(p[1]-a.cx)-Math.abs(q[1]-a.cx));
          const which=opts[0][0];
          if(which==="wd") amt=-a.v; else if(which==="dep") amt=a.v; else bal=a.v;
        }
        if(amt==null && bal!=null && prevBal!=null) amt=Math.round((bal-prevBal)*100)/100;
      } else if(amts.length>=2 && kind==="bank"){
        const a=amts[0].v; bal=amts[amts.length-1].v;
        amt = prevBal!=null ? (bal>=prevBal? a : -a) : -a;
      } else {
        const a=amts[0]; amt = (a.cr||a.neg) ? -a.v : a.v; // card: purchases positive, credits negative (flipped later)
      }
      if(bal!=null) prevBal=bal;
      if(amt){ last=[dt.date, desc.slice(0,140), Math.round(amt*100)/100]; tx.push(last); cont=0; }
      continue;
    }
    // continuation of the previous description
    if(last && !dt && !amts.length && cont<2 && text.length<80 && !/page \d|continued|statement|account no/i.test(text)){ last[1]=(last[1]+" "+text).slice(0,140); cont++; continue; }
    if(amts.length) last=null;
  }
  return {tx, kind, year};
}
function groupPdfItems(pages){
  // pages: [[{str,x,y,w}]] -> lines sorted top to bottom
  const lines=[];
  pages.forEach((items,pi)=>{
    const rows=[];
    items.filter(it=>it.str&&it.str.trim()).sort((a,b)=>b.y-a.y||a.x-b.x).forEach(it=>{
      let r=rows.find(r=>Math.abs(r.y-it.y)<=2.5); if(!r){ r={y:it.y,page:pi,items:[]}; rows.push(r); }
      r.items.push(it);
    });
    rows.sort((a,b)=>b.y-a.y).forEach(r=>{ r.items.sort((a,b)=>a.x-b.x); lines.push(r); });
  });
  return lines;
}

/* --- card purchase date: "... SI SGP 12OCT" posted on 14 Oct -> spent on 12 Oct --- */
function purchaseDate(posted, desc){
  const m=String(desc||"").toUpperCase().match(new RegExp("(?:^|[^0-9A-Z])(\\d{1,2})("+MONTHS3+")(?![A-Z])"));
  if(!m||!posted) return posted;
  const py=+posted.slice(0,4), pm=+posted.slice(5,7), mo=MON[m[2].toLowerCase()], d=+m[1];
  const y = mo>pm ? py-1 : py; const c=iso(y,mo,d); if(!c) return posted;
  const diff=(Date.parse(posted)-Date.parse(c))/864e5;
  return diff>=0&&diff<=15 ? c : posted;
}
/* --- account number from the lines above a CSV's header row --- */
function accountFromRows(rows, header){
  const lim=Math.max(0,Math.min(header>=0?header:8, 15));
  for(let i=0;i<lim;i++){ const line=(rows[i]||[]).join(" "); const m=line.match(/\b(\d{3}-\d{5,7}-\d|\d{3}-\d-\d{6}|\d{4}-\d{4}-\d{4}-\d{4}|\d{9,12})\b/); if(m) return m[1]; }
  return "";
}
function shortAcct(a){ a=String(a||""); if(!a) return ""; const d=a.replace(/[^0-9-]/g,""); return /\d{3}-\d{5,7}-\d/.test(d)||d.length>6 ? "…"+d.slice(-5) : a; }
/* --- overlap: keep only rows not already present, counting identical rows --- */
function txKey(t){ return t[0]+"|"+t[1]+"|"+t[2]; }
function dedupeCount(existing, incoming){
  const have=new Map(); existing.forEach(t=>{ const k=txKey(t); have.set(k,(have.get(k)||0)+1); });
  const fresh=[]; let dup=0;
  incoming.forEach(t=>{ const k=txKey(t); const n=have.get(k)||0; if(n>0){ have.set(k,n-1); dup++; } else fresh.push(t); });
  return {fresh, dup};
}
/* --- transfers between the family's own accounts: same amount, opposite sign, within 3 days, different accounts --- */
function pairTransfers(items){
  // items: [{id, date, amt, acct, cat}] -> Map(id -> partner id)
  const pairs=new Map(); const ins=items.filter(t=>t.amt>0).sort((a,b)=>a.date.localeCompare(b.date));
  const byAmt=new Map(); ins.forEach(t=>{ const k=t.amt.toFixed(2); (byAmt.get(k)||byAmt.set(k,[]).get(k)).push(t); });
  items.filter(t=>t.amt<0).sort((a,b)=>a.date.localeCompare(b.date)).forEach(o=>{
    const cands=byAmt.get((-o.amt).toFixed(2)); if(!cands) return;
    const i=cands.findIndex(c=>!pairs.has(c.id)&&c.acct!==o.acct&&(c.cat==="Transfers"||o.cat==="Transfers")&&Math.abs(Date.parse(c.date)-Date.parse(o.date))<=3*864e5);
    if(i>=0){ pairs.set(o.id,cands[i].id); pairs.set(cands[i].id,o.id); }
  });
  return pairs;
}
/* --- split bill share: "50%" or a fixed amount --- */
function applyShare(amt, share){
  if(!share||amt>=0) return amt;
  const s=String(share); if(s.endsWith("%")) return Math.round(amt*parseFloat(s)/100*100)/100;
  const v=parseFloat(s); return isFinite(v)&&v>0 ? -Math.min(v,-amt) : amt;
}
/* --- business: FloofMart's Ledger tab (date, type, category, amount, notes, contributors, amount spent by each) --- */
const BIZ_COLS={date:["date","day","when"], type:["type","kind"], cat:["category","cat"], amt:["amount","amt","total","cost"], notes:["notes","note","description","what","item"],
  who:["contributors","contributor","paid by","who","by"], each:["amount spent by each","spent by each","each","split"]};
const BIZ_INCOME=/^(revenue|income|sale|sales)$/i;
function bizNum(v){ if(typeof v==="number") return isFinite(v)?v:0; const n=Number(String(v==null?"":v).replace(/^\s*S\$/i,"").replace(/[$,\s]/g,"")); return isFinite(n)?n:0; }
function bizHeader(rows){
  for(let i=0;i<Math.min(rows.length,15);i++){
    const names=(rows[i]||[]).map(c=>String(c==null?"":c).trim().toLowerCase());
    const col={}; for(const [k,alts] of Object.entries(BIZ_COLS)){ const j=names.findIndex(n=>n&&alts.includes(n)); if(j>=0) col[k]=j; }
    if(col.amt!=null&&(col.type!=null||col.notes!=null)) return {row:i,col};
  }
  return null;
}
// rows (arrays of cells) -> ledger rows {r:sheet row, d:ISO date or "", t:type, c:category, a:amount, n:notes, w:[[name, amount]]}
function parseBizLedger(rows){
  const h=bizHeader(rows); if(!h) return null;
  const out=[]; const {col}=h; const cell=(r,k)=>col[k]==null?"":r[col[k]];
  rows.slice(h.row+1).forEach((r,i)=>{
    r=r||[]; const a=Math.round(Math.abs(bizNum(cell(r,"amt")))*100)/100;
    const t=String(cell(r,"type")||"").trim(), n=String(cell(r,"notes")||"").replace(/\s+/g," ").trim();
    if(!a&&!t&&!n) return;
    const names=String(cell(r,"who")||"").split(/\s*[;,\/&+]\s*|\s+and\s+/i).map(x=>x.trim()).filter(Boolean);
    const each=String(cell(r,"each")||"").split(/\s*[;,\/]\s*/).map(x=>x.trim()).filter(Boolean);
    let w=[];
    if(names.length&&each.length===names.length&&each.every(x=>/^\$?-?[\d.,]+$/.test(x))) w=names.map((nm,k)=>[nm,Math.round(bizNum(each[k])*100)/100]);
    else if(names.length) w=names.map(nm=>[nm,Math.round(a/names.length*100)/100]);
    out.push({r:h.row+i+2, d:parseDate(cell(r,"date"))||"", t:t||"Expense", c:String(cell(r,"cat")||"").trim(), a, n, w});
  });
  return out;
}
// what this row means for the family's own bank accounts
function bizExpense(row, self){
  const me=(self||[]).map(x=>String(x||"").trim().toLowerCase()).filter(Boolean).concat(["you","me","myself","own","self"]);
  const income=BIZ_INCOME.test(row.t||"");
  let mine=row.a, others=[];
  if(row.w&&row.w.length){ mine=0; row.w.forEach(([nm,v])=>{ if(me.includes(String(nm).toLowerCase())) mine+=v; else others.push(nm); }); mine=Math.round(mine*100)/100; }
  return {mine, income, others};
}
// ledger rows vs bank transactions. tx: [{id, date, post, raw, cat, pair}]. links: {"r<row>": txId | "none", "t<txId>": 1}
// returns {byTx: Map(txId -> row), byRow: Map(row -> txId), skipped: Set(row)}
const BIZ_DAYS=5;
function matchBusiness(rows, tx, links, self){
  links=links||{}; const byTx=new Map(), byRow=new Map(), skipped=new Set();
  const cands=tx.filter(t=>t.raw<0&&!t.pair&&t.cat!=="Income"&&t.cat!=="Transfers");
  const byId=new Map(cands.map(t=>[t.id,t]));
  const amtKey=v=>Math.round(Math.abs(v)*100);
  const byAmt=new Map(); cands.forEach(t=>{ const k=amtKey(t.raw); (byAmt.get(k)||byAmt.set(k,[]).get(k)).push(t); });
  const todo=[];
  for(const row of rows){
    const L=links["r"+row.r];
    if(L==="none"){ skipped.add(row.r); continue; }
    if(L&&byId.has(L)&&!byTx.has(L)){ byTx.set(L,row); byRow.set(row.r,L); continue; }
    const E=bizExpense(row,self); if(E.income||E.mine<=0) continue;
    todo.push({row,mine:E.mine});
  }
  const dist=(t,d)=>Math.min(Math.abs(Date.parse(t.date)-Date.parse(d)),Math.abs(Date.parse(t.post)-Date.parse(d)))/864e5;
  // dated rows first (nearest in time), then undated rows only when exactly one candidate is left for that amount
  todo.filter(x=>x.row.d).sort((a,b)=>a.row.d.localeCompare(b.row.d)).forEach(({row,mine})=>{
    const list=(byAmt.get(amtKey(mine))||[]).filter(t=>!byTx.has(t.id)&&dist(t,row.d)<=BIZ_DAYS).sort((a,b)=>dist(a,row.d)-dist(b,row.d));
    if(list.length){ byTx.set(list[0].id,row); byRow.set(row.r,list[0].id); }
  });
  todo.filter(x=>!x.row.d).forEach(({row,mine})=>{
    const list=(byAmt.get(amtKey(mine))||[]).filter(t=>!byTx.has(t.id));
    if(list.length===1){ byTx.set(list[0].id,row); byRow.set(row.r,list[0].id); }
  });
  return {byTx, byRow, skipped};
}
/*PURE-END*/
