/**
 * Next's `output: "standalone"` does not copy the static asset folders.
 * A standalone server with no CSS or JS in it renders unstyled, so copy them
 * across after every build.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDst = path.join(standalone, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDst = path.join(standalone, "public");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

const okStatic = copyDir(staticSrc, staticDst);
const okPublic = copyDir(publicSrc, publicDst);
console.log(
  `standalone assets: static=${okStatic ? "copied" : "missing"}, public=${okPublic ? "copied" : "none"}`,
);
