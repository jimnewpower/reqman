import { mkdir, writeFile } from "node:fs/promises";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  configSchema,
  documentSchema,
  requirementSchema,
  recordSchema,
  baselineSchema,
} from "../src/core/schema";
import { canonicalMarkdown } from "../src/core/markdown";
import { digest } from "../src/core/data";
await mkdir("schemas", { recursive: true });
for (const [name, schema] of Object.entries({
  configuration: configSchema,
  document: documentSchema,
  requirement: requirementSchema,
  record: recordSchema,
  baseline: baselineSchema,
})) {
  await writeFile(
    `schemas/${name}.schema.json`,
    JSON.stringify(
      zodToJsonSchema(schema, {
        name,
        target: "jsonSchema7",
        $refStrategy: "root",
      }),
      null,
      2,
    ) + "\n",
  );
}
const vectors = [
  {
    name: "soft-wrap-a",
    markdown: "## Identity\n\n### Statement\n\nPreserve stable\nidentities.",
  },
  {
    name: "soft-wrap-b",
    markdown:
      "# Identity\r\n\r\n## Statement\r\n\r\nPreserve stable identities.",
  },
  {
    name: "hard-break",
    markdown: "## Identity\n\n### Statement\n\nPreserve stable  \nidentities.",
  },
  {
    name: "reference-link",
    markdown:
      '## Link\n\n### Statement\n\nSee [source][a].\n\n[a]: /specification "Source"',
  },
  {
    name: "unicode-code",
    markdown:
      "## 地図\n\n### Statement\n\nPreserve `x  y` and café.\n\n```text\nx  y\n```",
  },
].map((v) => {
  const tree = canonicalMarkdown(v.markdown, true);
  return { ...v, canonical: tree, sha256: digest(tree) };
});
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "tests/fixtures/canonicalization.json",
  JSON.stringify({ algorithm: "rms-c14n-1", vectors }, null, 2) + "\n",
);
