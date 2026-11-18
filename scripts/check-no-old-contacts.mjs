// Fails if built website/storefront output still contains the old vendor
// email addresses. Run after `next build`: node scripts/check-no-old-contacts.mjs
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "apps/website/.next/server",
  "apps/website/out",
  "apps/storefront/.next/server",
].filter(existsSync);
const BAD = /[A-Za-z0-9._%+-]+@(?:caratflow\.com|[A-Za-z0-9-]*globussoft\.[a-z]+)/gi;
let hits = 0;
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(html|js|json|txt|rsc|map)$/.test(n) && s.size < 20e6) {
      const m = readFileSync(p, "utf8").match(BAD);
      if (m) {
        hits++;
        console.error(`${p}: ${[...new Set(m)].join(", ")}`);
      }
    }
  }
}
roots.forEach(walk);
if (!roots.length) {
  console.error("no build output found");
  process.exit(2);
}
if (hits) process.exit(1);
console.log(`ok: no old vendor addresses in ${roots.join(", ")}`);
