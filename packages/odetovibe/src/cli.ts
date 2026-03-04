#!/usr/bin/env node
import { resolve } from "node:path";
import { Project } from "ts-morph";
import { parseYaml, validateYaml } from "./extract/index.js";
import { emitAst } from "./transform/index.js";
import { writeFiles } from "./load/index.js";

function printUsage(): void {
  console.log("Usage: odetovibe <code_config.yaml> [--out <dir>] [--overwrite | --no-overwrite]");
  console.log("");
  console.log("  Generate TypeScript code from a codascon YAML schema.");
  console.log("");
  console.log("Arguments:");
  console.log("  <code_config.yaml>    Path to the code's YAML-config file");
  console.log("  --out <dir>      Output directory (default: ./generated)");
  console.log("  --overwrite      Unconditionally replace existing files");
  console.log("  --no-overwrite   Strict merge: abort to .ode.ts on conflict (default: merge)");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const schemaPath = resolve(args[0]);
  const outIndex = args.indexOf("--out");
  const outDir = resolve(outIndex !== -1 ? args[outIndex + 1] : "./generated");
  const mode = args.includes("--overwrite")
    ? ("overwrite" as const)
    : args.includes("--no-overwrite")
      ? ("strict" as const)
      : ("merge" as const);

  // Extract
  const configIndex = parseYaml(schemaPath);
  const result = validateYaml(configIndex);

  if (!result.valid) {
    console.error("Schema validation failed:");
    for (const r of result.validationResults) {
      for (const e of r.errors) {
        console.error(`  [${e.rule}] ${e.entryKey}: ${e.message}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `Parsed ${configIndex.commands.size} command(s), namespace: ${configIndex.namespace ?? "(none)"}`,
  );

  // Transform
  const project = new Project({ useInMemoryFileSystem: true });
  emitAst(configIndex, { configIndex, project });

  // Load
  const written = await writeFiles(project, { targetDir: outDir, mode });
  let hasCompileErrors = false;
  for (const r of written) {
    if (r.compileErrors && r.compileErrors.length > 0) {
      hasCompileErrors = true;
      console.error(`compile errors in ${r.path}:`);
      for (const e of r.compileErrors) console.error(`  ${e}`);
    } else if (r.conflicted) {
      console.warn(`conflict → ${r.path}`);
    } else {
      console.log(`${r.created ? "created" : "updated"} ${r.path}`);
    }
  }
  if (hasCompileErrors) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
