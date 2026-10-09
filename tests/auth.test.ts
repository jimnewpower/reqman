import { beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import {
  hashPassword,
  LOGIN_PROVENANCE,
  verifyPassword,
} from "../src/core/auth";
import { configSchema } from "../src/core/schema";
import { serve } from "../src/server";
import { fixture } from "./helpers";

const password = "a long test password";
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

async function workspace(readOnly = false) {
  const f = await fixture();
  const config = (await f.repo.snapshot()).config;
  config.authentication = {
    enabled: true,
    session_hours: 8,
    users: [
      {
        username: "alice",
        display_name: "Alice Reviewer",
        password_hash: passwordHash,
        roles: ["reviewer"],
        disabled: false,
      },
      {
        username: "bob",
        password_hash: passwordHash,
        roles: [],
        disabled: false,
      },
      {
        username: "disabled",
        password_hash: passwordHash,
        roles: [],
        disabled: true,
      },
    ],
  };
  const saveConfig = () =>
    writeFile(path.join(f.root, "requirements.yml"), stringify(config));
  await saveConfig();
  f.repo.readOnly = readOnly;
  const session = await serve(f.service, 0, "dist/ui");
  const call = (route: string, body: unknown = {}, token = "", headers = {}) =>
    fetch(`${session.origin}/api/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const login = async (username: string) => {
    const response = await call("login", { username, password });
    expect(response.status).toBe(200);
    return (await response.json()).token as string;
  };
  const close = () =>
    new Promise<void>((resolve) => session.server.close(() => resolve()));
  return { ...f, ...session, config, saveConfig, call, login, close };
}

describe("configured local logins", () => {
  it("generates salted password hashes through stdin and rejects invalid login configuration", async () => {
    const output = execFileSync(
      process.execPath,
      ["dist/cli.js", "password-hash"],
      {
        input: `${password}\n`,
        encoding: "utf8",
        windowsHide: true,
      },
    ).trim();
    expect(output).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(output).not.toContain(password);
    expect(output).not.toBe(passwordHash);
    expect(await verifyPassword(password, output)).toBe(true);
    expect(await verifyPassword("wrong password", output)).toBe(false);
    const f = await fixture();
    const config = (await f.repo.snapshot()).config;
    const user = { username: "alice", password_hash: passwordHash };
    expect(
      configSchema.safeParse({ ...config, authentication: { enabled: true } })
        .success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...config,
        authentication: { enabled: true, users: [user, user] },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...config,
        authentication: {
          enabled: true,
          users: [{ ...user, password_hash: password }],
        },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...config,
        authentication: { enabled: true, users: [{ ...user, disabled: true }] },
      }).success,
    ).toBe(false);
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it("requires a valid account and binds approvals to the login, timestamp and assigned role", async () => {
    const f = await workspace();
    try {
      const requirement = await f.add();
      expect(await (await f.call("session")).json()).toEqual({
        loginEnabled: true,
        user: null,
      });
      expect(
        (await f.call("command", { operation: "register" }, f.token)).status,
      ).toBe(401);
      expect(
        (
          await f.call("login", { username: "alice", password }, "", {
            Origin: "https://foreign.invalid",
          })
        ).status,
      ).toBe(409);
      for (const username of ["alice", "unknown", "disabled"])
        expect(
          (await f.call("login", { username, password: "incorrect password" }))
            .status,
        ).toBe(401);
      const alice = await f.login("alice");
      const info = await (await f.call("session", {}, alice)).json();
      expect(info.user).toEqual({
        username: "alice",
        display_name: "Alice Reviewer",
        roles: ["reviewer"],
      });
      expect(JSON.stringify(info)).not.toContain(passwordHash);
      expect(
        (
          await f.call(
            "command",
            { operation: "register", identity: { username: "bob" } },
            alice,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await f.call(
            "command",
            {
              operation: "review.create",
              target: requirement.uid,
              input: {
                actor: "bob",
                role: "administrator",
                decision: "approved",
                rationale: "Reviewed.",
              },
            },
            alice,
          )
        ).status,
      ).toBe(409);
      const response = await f.call(
        "command",
        {
          operation: "review.create",
          target: requirement.uid,
          input: {
            actor: "bob",
            provenance: "forged",
            created_at: "2000-01-01T00:00:00Z",
            role: "reviewer",
            decision: "approved",
            rationale: "Reviewed.",
          },
        },
        alice,
      );
      expect(response.status).toBe(200);
      const plan = (await response.json()).data.plan;
      expect((await f.call("apply", { plan: plan.uid }, alice)).status).toBe(
        200,
      );
      const record = (await f.repo.snapshot()).records[0];
      expect(record.actor).toBe("alice");
      expect(record.provenance).toBe(LOGIN_PROVENANCE);
      expect(record.created_at).not.toBe("2000-01-01T00:00:00Z");
      expect(record.role).toBe("reviewer");
      expect((await f.call("apply", { plan: plan.uid }, alice)).status).toBe(
        409,
      );
    } finally {
      await f.close();
    }
  });

  it("records authors and every requirement edit while preserving the original author", async () => {
    const f = await workspace();
    try {
      const alice = await f.login("alice"),
        bob = await f.login("bob");
      const apply = async (request: unknown, token: string) => {
        const response = await f.call("command", request, token);
        expect(response.status).toBe(200);
        const plan = (await response.json()).data.plan;
        expect((await f.call("apply", { plan: plan.uid }, token)).status).toBe(
          200,
        );
      };
      await apply(
        {
          operation: "requirement.add",
          input: {
            id: "R-1",
            title: "Track edits",
            statement: "Track requirement edits.",
            metadata: { author: "forged" },
          },
        },
        alice,
      );
      let snapshot = await f.repo.snapshot();
      const requirement = snapshot.requirements[0];
      expect(requirement.metadata.author).toBe("alice");
      expect(snapshot.records).toHaveLength(1);
      expect(snapshot.records[0]).toMatchObject({
        kind: "change",
        actor: "alice",
        changes: [{ before: null, after: { uid: requirement.uid } }],
      });
      await apply(
        {
          operation: "requirement.edit",
          target: requirement.uid,
          input: {
            metadata: { author: "forged", owner: "Team B" },
            markdown:
              "## Track edits\n\n### Statement\n\nTrack all saved edits.",
            change: { actor: "alice", rationale: "Expand edit tracking." },
          },
        },
        bob,
      );
      await apply(
        {
          operation: "requirement.renumber",
          target: requirement.uid,
          input: { id: "R-2" },
        },
        alice,
      );
      snapshot = await f.repo.snapshot();
      expect(snapshot.requirements[0].metadata.author).toBe("alice");
      expect(snapshot.records).toHaveLength(3);
      expect(snapshot.records.find((r) => r.actor === "bob")).toMatchObject({
        rationale: "Expand edit tracking.",
        provenance: LOGIN_PROVENANCE,
      });
      expect(
        snapshot.records.some(
          (r) => r.details?.operation === "requirement.renumber",
        ),
      ).toBe(true);
      expect(
        snapshot.diagnostics.filter((d) => d.severity === "error"),
      ).toEqual([]);
      f.commit();
      await apply(
        {
          operation: "baseline.create",
          input: { name: "release-1", target: "HEAD", actor: "forged" },
        },
        bob,
      );
      expect((await f.repo.snapshot()).baselines[0].actor).toBe("bob");
    } finally {
      await f.close();
    }
  });

  it("isolates previews by session and invalidates them on logout, expiry and configuration changes", async () => {
    const f = await workspace();
    try {
      const requirement = await f.add();
      const alice = await f.login("alice"),
        bob = await f.login("bob"),
        anotherAlice = await f.login("alice");
      const response = await f.call(
        "command",
        {
          operation: "review.create",
          target: requirement.uid,
          input: { decision: "approved", rationale: "Reviewed." },
        },
        alice,
      );
      const plan = (await response.json()).data.plan;
      for (const token of [bob, anotherAlice])
        expect((await f.call("apply", { plan: plan.uid }, token)).status).toBe(
          409,
        );
      expect((await f.call("logout", {}, alice)).status).toBe(200);
      expect(
        (await f.call("command", { operation: "register" }, alice)).status,
      ).toBe(401);
      expect(
        (await f.call("apply", { plan: plan.uid }, anotherAlice)).status,
      ).toBe(409);
      const time = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + 9 * 3600000);
      try {
        expect(
          (await f.call("command", { operation: "register" }, anotherAlice))
            .status,
        ).toBe(401);
      } finally {
        time.mockRestore();
      }
      f.config.authentication!.users[0].disabled = true;
      await f.saveConfig();
      const changed = await f.call("command", { operation: "register" }, bob);
      expect(changed.status).toBe(401);
      expect((await changed.json()).diagnostics[0].message).toContain(
        "Restart reqman serve",
      );
      expect((await f.repo.snapshot()).records).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("attributes imported evidence and attachments without authenticating producer claims", async () => {
    const f = await workspace();
    try {
      const requirement = await f.add();
      await f.record("verification.create", requirement.uid, {
        title: "Identity check",
        method: "test",
      });
      const obligation = (await f.repo.snapshot()).records[0];
      const alice = await f.login("alice"),
        bob = await f.login("bob");
      const response = await f.call(
        "command",
        {
          operation: "evidence.import",
          input: {
            actor: "forged",
            run_id: "run-1",
            producer: "junit",
            artifact: { repository: "product", revision: "commit-A" },
            mapping: {
              "junit::suite::identity::stable": {
                requirement: requirement.uid,
                obligation: obligation.uid,
              },
            },
            content:
              '<testsuite name="suite"><testcase classname="identity" name="stable"/></testsuite>',
          },
        },
        alice,
      );
      expect(response.status).toBe(200);
      const importedPlan = (await response.json()).data.plan;
      expect(
        (await f.call("apply", { plan: importedPlan.uid }, alice)).status,
      ).toBe(200);
      const evidence = (await f.repo.snapshot()).records.find(
        (r) => r.kind === "evidence",
      )!;
      expect(evidence.actor).toBe("alice");
      expect(evidence.provenance).toContain(
        "imported producer claim; unauthenticated",
      );
      const attachment = await f.call(
        "command",
        {
          operation: "evidence.attach",
          target: evidence.uid,
          input: {
            name: "capture.txt",
            content: Buffer.from("Synthetic capture").toString("base64"),
            actor: "forged",
            rationale: "Attach capture.",
          },
        },
        bob,
      );
      expect(attachment.status).toBe(200);
      const attachmentPlan = (await attachment.json()).data.plan;
      expect(
        (await f.call("apply", { plan: attachmentPlan.uid }, bob)).status,
      ).toBe(200);
      const record = (await f.repo.snapshot()).records.find((r) =>
        r.supersedes.includes(evidence.uid),
      )!;
      expect(record.actor).toBe("bob");
      expect(record.provenance).toContain(LOGIN_PROVENANCE);
      expect(record.provenance).toContain(evidence.provenance);
      expect(record.subjects).toEqual(evidence.subjects);
    } finally {
      await f.close();
    }
  });

  it("still requires written change rationale and rejects a stale authenticated preview", async () => {
    const f = await workspace();
    try {
      const requirement = await f.add();
      f.config.policy.require_change_record = true;
      await f.saveConfig();
      const alice = await f.login("alice");
      const original = await f.source();
      const request = {
        operation: "requirement.edit",
        target: requirement.uid,
        input: { markdown: requirement.markdown + "\n\nConstraint revised." },
      };
      const missing = await f.call("command", request, alice);
      expect((await missing.json()).diagnostics[0].code).toBe(
        "CHANGE_RECORD_REQUIRED",
      );
      expect(await f.source()).toBe(original);
      const preview = await f.call(
        "command",
        {
          ...request,
          input: {
            ...request.input,
            change: {
              actor: "forged",
              rationale: "Clarify constraint.",
              work_references: ["path:issue-1"],
            },
          },
        },
        alice,
      );
      expect(preview.status).toBe(200);
      const plan = (await preview.json()).data.plan;
      await f.writeSource(original + "\nExternal document edit.\n");
      expect((await f.call("apply", { plan: plan.uid }, alice)).status).toBe(
        409,
      );
      expect((await f.repo.snapshot()).records).toEqual([]);
      expect(await f.source()).toContain("External document edit.");
    } finally {
      await f.close();
    }
  });

  it("throttles failed logins and preserves read-only repositories", async () => {
    const f = await workspace(true);
    try {
      const alice = await f.login("alice");
      expect(
        (
          await f.call(
            "command",
            {
              operation: "requirement.add",
              input: { id: "R-1", title: "Read only", statement: "No saves." },
            },
            alice,
          )
        ).status,
      ).toBe(409);
      for (let i = 0; i < 5; i++)
        expect(
          (
            await f.call("login", {
              username: "alice",
              password: "wrong password",
            })
          ).status,
        ).toBe(401);
      expect(
        (await f.call("login", { username: "alice", password })).status,
      ).toBe(429);
      const time = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
      try {
        expect(
          (await f.call("login", { username: "alice", password })).status,
        ).toBe(200);
      } finally {
        time.mockRestore();
      }
      expect((await f.repo.snapshot()).requirements).toEqual([]);
    } finally {
      await f.close();
    }
  });
});
