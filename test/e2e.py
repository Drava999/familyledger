import json, os, sys, time
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8787/"
HERE = os.path.dirname(os.path.abspath(__file__)) + "/"
import os
CSV = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("STATEMENT_CSV", "")  # path to a bank CSV export (never commit one)
XLSX = open(HERE + "node_modules/xlsx/dist/xlsx.full.min.js").read()
results = {}

def route(r):
    u = r.request.url
    if "xlsx" in u and "cdnjs" in u: return r.fulfill(body=XLSX, content_type="application/javascript")
    if u.startswith("http://localhost"): return r.continue_()
    return r.abort()

def ctx(b, email, w=400, scheme="light"):
    c = b.new_context(viewport={"width": w, "height": 900}, device_scale_factor=2, color_scheme=scheme, extra_http_headers={"x-dev-email": email}, accept_downloads=True)
    c.route("**/*", route)
    p = c.new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)
    return c, p, errs

with sync_playwright() as pw:
    b = pw.chromium.launch()
    cB, pB, eB = ctx(b, "bryan@example.com")
    pB.goto(BASE); pB.wait_for_timeout(600)
    results["example_banner_visible"] = pB.is_visible("#exampleBanner")
    pB.set_input_files("#fileIn", CSV); pB.wait_for_selector(".review button[data-a=add]")
    results["review_text"] = pB.inner_text(".review").split("\n")[0:2]
    inp = pB.locator(".review input[data-k=person]"); inp.fill("Bryan"); inp.dispatch_event("change")
    pB.click(".review button[data-a=add]")
    pB.wait_for_timeout(2500)
    results["after_add"] = {k: pB.inner_text(k) for k in ["#tIn", "#tOut", "#tSave", "#saveState"]}
    results["triage"] = pB.inner_text("#triage")[:300]
    results["chips"] = pB.inner_text("#personChips")
    pB.screenshot(path=HERE + "b-top.png", full_page=False)
    # analysis + export
    pB.click("#aiBtn"); pB.wait_for_timeout(500); results["analysis"] = pB.inner_text("#aiOut")[:60]
    with pB.expect_download() as d: pB.click("#exportBtn")
    path = d.value.path(); results["export_lines"] = sum(1 for _ in open(path)); results["export_head"] = open(path).readline().strip()
    # share the file
    pB.click("button[data-share]"); pB.wait_for_timeout(500)
    results["share_btn"] = pB.inner_text("button[data-share]")
    # reload: data persists from server
    pB.reload(); pB.wait_for_timeout(1200)
    results["after_reload_tOut"] = pB.inner_text("#tOut"); results["files_after_reload"] = pB.inner_text("#files")[:160]

    # Mum
    cM, pM, eM = ctx(b, "mum@example.com", 820, "dark")
    pM.goto(BASE); pM.wait_for_timeout(1200)
    results["mum_files"] = pM.inner_text("#files")[:200]
    results["mum_chips"] = pM.inner_text("#personChips")
    # Mum cannot edit or delete Bryan's statement
    fid = pB.evaluate("fetch('/api/data').then(r=>r.json()).then(d=>d.files[0].id)")
    results["mum_put_other"] = pM.evaluate("(id)=>fetch('/api/files/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({tx:[]})}).then(r=>r.status)", fid)
    results["mum_del_other"] = pM.evaluate("(id)=>fetch('/api/files/'+id,{method:'DELETE'}).then(r=>r.status)", fid)
    # Mum sets a household rule; Bryan sees it
    pM.evaluate("fetch('/api/rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({set:{'TEST SHOP':'Groceries'}})}).then(r=>r.status)")
    results["bryan_sees_rule"] = pB.evaluate("fetch('/api/data').then(r=>r.json()).then(d=>d.rules['TEST SHOP'])")
    # Bryan makes it private again: Mum no longer sees it
    pB.click("button[data-share]"); pB.wait_for_timeout(500)
    results["mum_sees_after_private"] = pM.evaluate("fetch('/api/data').then(r=>r.json()).then(d=>d.files.length)")
    # cross-origin write blocked
    results["csrf"] = pB.evaluate("fetch('/api/rules',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}).then(r=>r.status)")
    pM.screenshot(path=HERE + "m-top.png", full_page=False)
    results["errors"] = {"bryan": eB[:5], "mum": eM[:5]}
    b.close()
print(json.dumps(results, indent=1))
