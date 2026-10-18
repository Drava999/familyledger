import { start } from "./harness.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
// Browser walkthrough of every screen with made-up statements. Run: node test/ui.mjs  (screenshots go to $OUT if set)
// Needs: npm i --no-save playwright xlsx@0.18.5 ; EXE=path to Chromium if Playwright's own isn't installed.
const D=fs.mkdtempSync(os.tmpdir()+"/fl-"), OUT=process.env.OUT||D;
execFileSync("python3",[new URL("./make_fixtures.py",import.meta.url).pathname, D]);
let fails=0; const ok=(c,m)=>{ console.log((c?"PASS ":"FAIL ")+m); if(!c) fails++; };
const srv=await start(8811);
const b=await chromium.launch({executablePath:process.env.EXE});
const xlsx=fs.readFileSync(new URL("../node_modules/xlsx/dist/xlsx.full.min.js",import.meta.url));
async function page(w,h){ const p=await b.newPage({viewport:{width:w,height:h}}); const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{ if(m.type()==="error") errs.push(m.text()); });
  await p.route(/cdnjs.*xlsx/,r=>r.fulfill({body:xlsx,contentType:"text/javascript"})); await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  p.errs=errs; return p; }
const p=await page(390,860);
await p.goto("http://localhost:8811/"); await p.waitForTimeout(800);
await p.screenshot({path:OUT+"/0-example.png",fullPage:true});
await p.click("#addTop"); await p.setInputFiles("#fileIn",[D+"/acctA.csv",D+"/acctB.csv"]); await p.waitForTimeout(800);
// set person
await p.fill("#upWho","Bryan"); await p.dispatchEvent("#upWho","change"); await p.waitForTimeout(300);
const pills=await p.locator(".review .pill").allInnerTexts(), accts=await p.locator('.review input[data-k="account"]').evaluateAll(es=>es.map(e=>e.value));
ok(pills.join()==="128 new,11 new", "both statements read: "+pills.join(" / "));
ok(accts.join()==="123-45692-9,245-004147-0", "account numbers detected from the files");
await p.screenshot({path:OUT+"/1-upload.png",fullPage:true});
await p.click("#addAll"); await p.waitForTimeout(1500);
await p.screenshot({path:OUT+"/2-upload-done.png",fullPage:true});
// overlap
await p.setInputFiles("#fileIn",[D+"/acctA_overlap.csv"]); await p.waitForTimeout(800);
ok((await p.locator(".review .pill").allInnerTexts()).join()==="0 new · 55 already had", "overlapping export adds nothing new");
await p.click('.review [data-a="skip"]'); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// FloofMart's Ledger: upload the export, check the matching
await p.evaluate(()=>{ location.hash="moves/biz"; }); await p.waitForTimeout(300);
await p.screenshot({path:OUT+"/m-biz-empty.png",fullPage:true});
await p.setInputFiles("#bizIn",[D+"/ledger.csv"]); await p.waitForTimeout(900);
const octText=await p.locator("#view").innerText();
ok(/3 matched/.test(octText)&&/1 not found/.test(octText)&&/undated rows only show under All time/.test(octText), "October: the three dated October buys matched, the cash sleeves not found, undated rows deferred to All time");
await p.selectOption("#monthSel","all"); await p.waitForTimeout(400);
const bizText=await p.locator("#view").innerText();
ok(/6 matched/.test(bizText)&&/3 not found/.test(bizText)&&/1 paid by others/.test(bizText), "all time: 6 matched (incl. two undated rows by unique amount), 3 not found (cash + two old lots), 1 paid by Danish: "+(bizText.match(/\d+ matched[\s\S]*?paid by others/)||[""])[0].replace(/\s+/g," "));
ok(/Card lot, bought jointly[\s\S]*\$267\.50[\s\S]*of \$535\.00/.test(bizText), "a joint buy counts only my half");
ok(/Label printer/.test(bizText)&&/Not found in your statements[\s\S]*Sleeves \(cash\)/.test(bizText), "Danish's printer listed under paid by others; the cash sleeves under not found");
await p.screenshot({path:OUT+"/m-biz.png",fullPage:true});
// link the cash row by hand, then skip it
await p.click('[data-blink]'); await p.waitForTimeout(300); await p.screenshot({path:OUT+"/m-biz-pick.png"});
await p.click("[data-none]"); await p.waitForTimeout(400);
ok(/Skipped[\s\S]*Card lot, solo/.test(await p.locator("#view").innerText()), "a row can be skipped by hand");
await p.evaluate(()=>{ location.hash="home"; }); await p.waitForTimeout(300);
ok(/Business/.test(await p.locator("#view").innerText())&&/FloofMart costs · kept out of family spending/.test(await p.locator("#view").innerText()), "Overview shows business money out separately");
const shots=[["home",""],["spend","cats"],["spend","bills"],["spend","sort"],["moves","in"],["moves","accounts"],["moves","investing"],["moves","people"],["moves","biz"],["goals","limits"],["goals","goals"]];
for(const [t,s] of shots){ await p.evaluate(([t,s])=>{ location.hash=t+(s?"/"+s:""); },[t,s]); await p.waitForTimeout(350); await p.screenshot({path:`${OUT}/m-${t}-${s||"x"}.png`,fullPage:true}); }
// identify sheet from To sort
await p.evaluate(()=>{ location.hash="spend/sort"; }); await p.waitForTimeout(300);
const sb=p.locator("text=Start sorting"); if(await sb.count()){ await sb.click(); await p.waitForTimeout(300); await p.screenshot({path:OUT+"/m-identify.png",fullPage:false}); await p.keyboard.press("Escape"); }
ok((await p.locator("#monthSel option").allInnerTexts()).join()==="October,September,August,July,All time", "months come from the statements (no stray June)");
await p.evaluate(()=>{ location.hash="moves/accounts"; }); await p.waitForTimeout(300);
ok(/transfers? matched between your accounts/.test(await p.locator("#view").innerText()), "transfers between the two accounts are paired");
const d=await page(1280,900); await d.goto("http://localhost:8811/#home"); await d.waitForTimeout(900);
for(const [t,s] of [["home",""],["spend","cats"],["moves","accounts"],["goals","limits"]]){ await d.evaluate(([t,s])=>{ location.hash=t+(s?"/"+s:""); },[t,s]); await d.waitForTimeout(350); await d.screenshot({path:`${OUT}/d-${t}-${s||"x"}.png`,fullPage:true}); }
ok(![...p.errs,...d.errs].some(e=>!/Failed to load resource/.test(e)), "no page errors");
await b.close(); srv.close();
// second pass: identify sheet + split + limits
const b2=await chromium.launch({executablePath:process.env.EXE}); const srv2=await start(8812);
const q=await b2.newPage({viewport:{width:390,height:860}}); const qe=[]; q.on("pageerror",e=>qe.push(e.message));
await q.route(/cdnjs.*xlsx/,r=>r.fulfill({body:xlsx,contentType:"text/javascript"})); await q.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await q.goto("http://localhost:8812/#spend/cats"); await q.waitForTimeout(800);
await q.click('.grp button[data-grp="Food & Dining"]'); await q.waitForTimeout(200);
await q.locator(".items .it").first().click(); await q.waitForTimeout(300);
await q.screenshot({path:OUT+"/m-identify.png"});
await q.click('#idKinds [data-k="split"]'); await q.fill("#idShare","50%"); await q.click('input[name="idScope"][value="always"]'); await q.click("#idSave"); await q.waitForTimeout(500);
await q.evaluate(()=>{ location.hash="moves/people"; }); await q.waitForTimeout(300); ok(/SPLIT BILL/.test(await q.locator("#view").innerText()), "split bill shows under People");
await q.evaluate(()=>{ location.hash="goals/limits"; }); await q.waitForTimeout(300); await q.click("text=Suggest from my spending"); await q.waitForTimeout(200); await q.click("[data-save]"); await q.waitForTimeout(400);
await q.screenshot({path:OUT+"/m-limits2.png",fullPage:true});
await q.evaluate(()=>{ location.hash="goals/goals"; }); await q.waitForTimeout(300); await q.click('[data-newgoal="save"]'); await q.fill("#gName","Japan trip"); await q.fill("#gTarget","3000"); await q.click("#gSave"); await q.waitForTimeout(400);
await q.screenshot({path:OUT+"/m-goals2.png",fullPage:true});
await q.reload(); await q.waitForTimeout(800); ok(/Japan trip/.test(await q.locator("#view").innerText()), "goal saved and still there after reload");
// mark a payment as FloofMart from "What was this?" (no ledger yet): it leaves family spending
await q.evaluate(()=>{ location.hash="spend/cats"; }); await q.waitForTimeout(300); await q.fill("#q","pricecharting"); await q.waitForTimeout(200);
await q.locator("#qres .it").first().click(); await q.waitForTimeout(300); await q.click('#idKinds [data-k="business"]'); await q.click('input[name="idScope"][value="always"]'); await q.click("#idSave"); await q.waitForTimeout(500);
await q.evaluate(()=>{ location.hash="moves/biz"; }); await q.waitForTimeout(300); await q.selectOption("#monthSel","all"); await q.waitForTimeout(400);
ok(/In your bank, not in the Ledger[\s\S]*PRICECHARTING/.test(await q.locator("#view").innerText()), "a payment marked FloofMart by hand shows as not in the Ledger (the July and August ones, with no Ledger row)");
await q.screenshot({path:OUT+"/m-biz-tagged.png",fullPage:true});
ok(!qe.length, "no page errors (second pass)"); await b2.close(); srv2.close();
process.exitCode=fails?1:0;
