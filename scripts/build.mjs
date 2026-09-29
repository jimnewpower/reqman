import { build } from "esbuild";
await build({
  entryPoints: {cli: "src/cli.ts", worker: "src/worker.ts"},
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outdir: "dist",
  sourcemap: true,
});
