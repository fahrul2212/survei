import { registerHooks, stripTypeScriptTypes } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Exercise pure TypeScript modules with Node's native test runner.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      for (const suffix of ["", ".ts", ".tsx"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (/\.tsx?$/.test(url.pathname) && existsSync(fileURLToPath(url)))
          return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && /\.tsx?$/.test(url))
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
          mode: "transform",
        }),
      };
    return next(url, context);
  },
});
