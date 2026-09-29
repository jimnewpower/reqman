import { build } from "esbuild";
await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outfile: "dist/cli.js",
  sourcemap: true,
});
