// Builds dist/worker.js: assembles the page from web/ and embeds it in the API server.
// Run: node build.mjs   (Cloudflare runs this automatically before each deploy, see wrangler.toml)
import fs from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const read = (p) => fs.readFileSync(here + p, "utf8");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
${read("web/head.html")}
</style></head><body>
${read("web/body.html")}
<script>
(() => {
${read("web/parse.js")}
${read("web/app.js")}
})();
</script>
</body></html>
`;
fs.mkdirSync(here + "dist", { recursive: true });
fs.writeFileSync(here + "dist/index.html", html);

const src = read("src/server.js");
if (!src.includes('"__INDEX_HTML__"')) throw new Error("placeholder missing in src/server.js");
fs.writeFileSync(here + "dist/worker.js", src.replace('"__INDEX_HTML__"', () => JSON.stringify(html)));
console.log("built dist/worker.js", fs.statSync(here + "dist/worker.js").size, "bytes");
