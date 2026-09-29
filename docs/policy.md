# Project policy and exact decisions

Policies are declarative configuration. The generated configuration schema is authoritative. They do not execute scripts or authenticate actor claims.

```yaml
policy:
  approval:
    minimum_reviews: 2
    require_distinct_author: true
    roles: [lead, tester]
  require_change_record: true
  validation:
    rules:
      - code: POLICY_OWNER
        severity: warning
        lifecycle: active
      - code: POLICY_VERIFICATION
        severity: error
        disposition: in_scope
    waivers:
      - uid: 1312fe31-8609-4651-b791-01a7c135db71
        rule: POLICY_VERIFICATION
        subject: 550e8400-e29b-41d4-a716-446655440000
        reason: Manual verification definition pending review
        issuer: Project lead claim
        expires_at: '2026-12-31T23:59:59Z'
  baseline:
    approval: true
    implementation: true
    verification: true
    currency: true
```

Advisory rule codes are POLICY_OWNER, POLICY_TAGS, POLICY_FIELD, POLICY_VERIFICATION, POLICY_IMPLEMENTATION and POLICY_APPROVAL. POLICY_FIELD additionally requires `field`. Rules can select specification UUID/code, lifecycle and disposition. Severity is error, warning or off. Waivers bind one allowed rule and one requirement UUID, retain the finding and issuer/reason in reports, and expire against the snapshot's explicit evaluatedAt time. Structural parsing, ambiguous identities, graph errors, unsafe paths and mandatory versions cannot be waived. Optional baseline gates use the target commit's configuration, selected subjects, scope and explicit evaluated artifact, excluding retired/out-of-scope subjects from delivery gates.

To explain an already made change, use `change create UUID` with actor, rationale, an exact committed `base`, optional head, and work_references. The service computes before/after subjects; caller-supplied revision pairs cannot substitute for the real endpoints. For a material authoring operation under require_change_record, include the explanation in the same guarded edit:

```json
{
  "markdown": "## Preserve data\n\n### Statement\n\nThe application shall retain the previous saved project.",
  "change": {
    "actor": "Project lead claim",
    "rationale": "Clarify recovery behavior",
    "work_references": ["https://example.invalid/work/42"]
  }
}
```

`impact --base COMMIT --head WORKTREE` returns downstream UUIDs, exact triggering pairs and causal paths. Use `impact-record create DOWNSTREAM_UUID` with actor, rationale, base, trigger (upstream UUID), and decision no_impact, rework or reverify. The subject must be reachable at the endpoints and still match the current downstream revision. Relations remain subject to future changes. Different unsuperseded decisions for the same scope/pair are conflicted; reconcile with a new decision naming every resolved record in supersedes. A no_impact acknowledgment resolves only that upstream pair; it cannot make a directly edited downstream definition or different artifact current.

Approval, implementation, verification and currency remain separate. A link, imported claim, passed test or merged Git commit never independently becomes an approval or passing aggregate verification assessment. Policy edits change governance fingerprints and are visible in comparisons. Old records remain unchanged.
