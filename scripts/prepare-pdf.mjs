import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve("public/pdf-resources");
await mkdir(output, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"])
  await cp(resolve("node_modules/pdfjs-dist", dir), resolve(output, dir), {
    recursive: true,
  });
const licenses = [
  ["PDF.js", "pdfjs-dist/LICENSE"],
  ["PDF-LIB", "pdf-lib/LICENSE.md"],
  ["PDF-LIB standard fonts", "@pdf-lib/standard-fonts/LICENSE.md"],
  ["UPNG", "@pdf-lib/upng/LICENSE"],
  ["Pako", "pako/LICENSE"],
];
const texts = await Promise.all(
  licenses.map(
    async ([name, path]) =>
      name + "\n" + (await readFile(resolve("node_modules", path), "utf8")),
  ),
);
await writeFile(
  resolve(output, "THIRD-PARTY.txt"),
  texts.join("\n\n--------------------\n\n"),
);
