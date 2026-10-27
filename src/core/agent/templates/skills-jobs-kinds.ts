/* The `curate-module` and `gardener-audit` parts of the gaston-jobs skill. They live apart
 * so skills.ts stays one screen of setup text per skill; the field names mirror what
 * curate-job.ts and audit-job.ts write and read (story 091). The advice limit is MAX_ADVICE in
 * core/llm; a test keeps the sentence below in step with it. */

export const JOB_KIND_CURATE_MODULE = `### \`curate-module\`

A whole module that waits to be curated. The job is Markdown; its \`subject\` and its \`module\`
field are the module slug.

1. Work the module the way \`/gaston-curate <slug>\` does: read \`modules/<slug>/AGENTS.md\`, run the
   checklist of that skill and write only inside \`modules/<slug>/wiki/\`. Anything that needs a
   decision from the person goes through \`/gaston-propose\`.
2. Write the result with \`status: done\` when the module is curated.

The run report lists the pages you changed; the stop hook writes it, so you do not.
`;

export const JOB_KIND_GARDENER_AUDIT = `### \`gardener-audit\`

A maintenance run that waits to be interpreted. The job is Markdown; its \`subject\` is the run
and its fields are:

- \`ranAt\`: the time of the maintenance run.
- \`findings\`: a list of \`id\`, \`kind\`, \`title\` and \`paths\`, one entry per finding.
- \`candidateIds\`: the finding ids you may confirm or reject.
- \`pages\`: the wiki pages the findings touch.

1. Read every page in \`pages\`, in full. Change no file other than the result.
2. Judge the run and write the result with \`status: done\` and these frontmatter lists. Each is
   optional, and a missing one counts as empty.
   - \`contradictions\`: entries of \`pathA\`, \`pathB\` and \`note\` (one sentence on what conflicts).
     Both paths are existing wiki pages in the vault, and they differ.
   - \`confirmed\`: ids from \`candidateIds\` you confirm.
   - \`rejected\`: ids from \`candidateIds\` you reject as false alarms.
   - \`advice\`: at most three short sentences for the person.
3. Take paths only from the vault and ids only from the job. One path that is not in the vault,
   or one id that is not in the job, makes Gaston fail the whole result and book nothing.
`;

export const JOB_KIND_CONDENSE_MODULE = `### \`condense-module\`

A module whose overview waits to be condensed from its wiki pages. The job is Markdown; its
\`subject\` is the module slug, and its fields are:

- \`module\`: the module slug.
- \`inputs\`: the wiki pages of the module at hand-over, relative to the vault root.
- \`baseHash\`: the hash of \`modules/<slug>/wiki/overview.md\` when the job was written, or
  null when there was none. Do not change it.

1. Read every page in \`inputs\`, in full, and \`modules/<slug>/wiki/overview.md\` when it exists.
   Its directives section is an instruction to follow when you condense. It is never written,
   and neither is \`overview.md\` itself: Gaston turns your result into a proposal the person
   confirms. Change no file other than the result.
2. Write the result with \`status: done\` and, after the frontmatter, one fenced \`json\` block:
   \`{ "decided": …, "open": …, "contradictions": … }\`. Each section is
   \`{ "text": string, "sources": string[] }\`.
   - \`decided\`: what the pages settle.
   - \`open\`: what is still unanswered.
   - \`contradictions\`: where pages disagree. Name each contradiction and both pages; never
     resolve it.
3. Compress, do not append: the sections state the module as it stands now and replace the old
   overview text, in the language of the pages.
4. Every section with text cites only paths from \`inputs\` in its \`sources\`. One section that
   cites another path makes Gaston fail the whole result and propose nothing.
5. When it cannot be done, write the result with \`status: failed\` and a \`reason\`.
`;

export const RESULT_CONDENSE_MODULE = `A \`condense-module\` job gets a Markdown result whose body is the json block:

\`\`\`\`markdown
---
job: condense-module-1a2b3c4d5e6f7a8b
status: done
---

\`\`\`json
{
  "decided": {
    "text": "The relaunch is set for 14 November.",
    "sources": ["modules/website-relaunch/wiki/launch-plan.md"]
  },
  "open": { "text": "", "sources": [] },
  "contradictions": {
    "text": "The plan says 14 November, the brief says 21 November.",
    "sources": [
      "modules/website-relaunch/wiki/launch-plan.md",
      "modules/website-relaunch/wiki/sources/launch-brief.md"
    ]
  }
}
\`\`\`
\`\`\`\`
`;

export const RESULT_CURATE_AND_AUDIT = `A \`curate-module\` job gets a Markdown result with the same frontmatter as above, without
\`sourcePage\`:

\`\`\`markdown
---
job: curate-module-1a2b3c4d5e6f7a8b
status: done
---
\`\`\`

A \`gardener-audit\` job gets a Markdown result that also carries the lists:

\`\`\`markdown
---
job: gardener-audit-1a2b3c4d5e6f7a8b
status: done
contradictions:
  - pathA: modules/website-relaunch/wiki/launch-plan.md
    pathB: modules/website-relaunch/wiki/sources/launch-brief.md
    note: The plan says 14 November, the brief says 21 November.
confirmed:
  - orphan-3f9a1c
rejected:
  - stale-77b2e0
advice:
  - Settle the launch date before the next review.
---
\`\`\`
`;
