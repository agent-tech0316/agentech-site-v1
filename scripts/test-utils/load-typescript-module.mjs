import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

export function loadTypeScriptModule(relativePath) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const nativeRequire = createRequire(filename);
    const localRequire = (specifier) => {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/")
          ? path.resolve(process.cwd(), specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (target && /\.tsx?$/.test(target)) return load(target);
      }
      return nativeRequire(specifier);
    };
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    new Function("exports", "require", "module", "__filename", "__dirname", output)(
      module.exports, localRequire, module, filename, path.dirname(filename),
    );
    return module.exports;
  }
  return load(path.resolve(process.cwd(), relativePath));
}
