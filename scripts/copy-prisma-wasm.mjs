import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = process.cwd();
const source = resolve(projectRoot, "node_modules/.prisma/client/query_compiler_bg.wasm");
const destination = resolve(
  projectRoot,
  ".open-next/server-functions/default/node_modules/.prisma/client/query_compiler_bg.wasm",
);

await stat(source);
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
await stat(destination);

console.log("Prisma query compiler WASM copied into the Cloudflare Worker bundle.");
