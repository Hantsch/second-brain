# Concept

## Why

Too many projects, too much jumping between them. After switching, where you were
and what state things are in is gone. On top of that: ideas, sources, things read,
worries — everything a head can't hold. This stuff needs to get out of the head,
but not get lost: **dump it in, and the app handles structure.**

Second driver: a Second Brain that's only ever filled rots. Notes go stale, pages
become orphaned, sources sit undigested, and eventually you stop trusting your own
archive. That's why **maintenance** is a screen here, not an afterthought.

## Principles

1. **Dumping costs nothing.** A hotkey, a text field, Enter. No choosing a folder,
   no title, no tags — the app does that.
2. **The user doesn't worry about structure.** Folders, filenames, frontmatter,
   linking: the app's job. Anyone who wants to can still edit everything by hand.
3. **The AI proposes, the human confirms.** Visible proposal, visible reasoning,
   one click to change it. Nothing moves anywhere silently.
4. **Backed by evidence, or not said at all.** Answers come from the vault, with
   citation and path.
5. **Self-contained.** No server, no Docker, no cloud requirement. Folder onto a
   stick, done.
6. **Sometimes you don't want a solution.** The coach has a mode that just listens.

## What the app does

### In — capturing and filing

- **Dump**: a big field, `Ctrl+Enter` saves. Globally via `Ctrl+Shift+Space`, even
  when the app isn't in the foreground. Lands immediately as a file in `inbox/` —
  never only after successful classification.
- **Filing**: an LLM reads the dump and suggests where it belongs — into a project
  (work or private), into the daily entry, as a note in an area, as a source in a
  knowledge module, or as a new project. Along with that: title, tags, detected
  todos with deadlines, detected "waiting on X."
- **Without an LLM**, a heuristic takes over (keywords, project names, date
  patterns) and the dump stays visible in the inbox — nothing gets lost.
- **Ingesting sources**: YouTube videos (pipeline from `../yougrab`: metadata,
  transcript as prose, transcript with deep links), files, URLs, text from the
  clipboard. Raw source goes to `raw/`, then digestion into the knowledge module.

### Inside — knowledge that grows together

- **Knowledge modules** are self-contained small wikis following Karpathy's
  LLM-wiki pattern (adopted from `../godot-RAG`): source pages, entity pages,
  concept pages, `index.md`, `log.md`, `overview.md`. Knowledge is **digested once
  at ingest**, not re-derived on every question.
- **Contradictions are kept and named**, not flattened.
- **Questions** run against the whole vault or against one module. Answers with
  citations. If the question was good, the answer can be filed as a wiki page at
  the push of a button — that way asking feeds the Second Brain instead of
  vanishing in the chat.

### Overview — what happened, what's coming up

- **Dashboard** made of movable modules, arranged by the user however they like:
  - **Recent work** — from file changes _and_ Claude Code sessions
    (`~/.claude/projects`, read the way `../claude-control` does it)
  - **Stagnant projects** — untouched for a long time and not closed
  - **Work todos** and **private todos**, kept separate
  - **Waiting on** — who, since when, by when the reply should have arrived
  - **Upcoming deadlines** — project deadlines and todo deadlines in one line
  - **Inbox**, **journal streak**, **maintenance health**, **quick capture**, **ask**
- **Projects** carry `next_step` — the one sentence that carries the re-entry.
  If it's missing, that's a maintenance finding.
- **Reminders** arrive as a Windows notification when a deadline is due or a reply
  is overdue.

### Human — journal and coach

- One daily entry per day, with optional mood and energy.
- The coach has three stances, switchable per conversation (Ctrl+1 through
  Ctrl+3; the default lives under Settings → Behavior):
  - **Listen** — reflect, acknowledge, no advice
  - **Suggest** — listen, then give concrete suggestions
  - **Analyze** — show patterns in light of earlier entries
- Day close extracts facts, todos, and deadlines — as proposals.
- **The conversation lives in the daily entry**, as a blockquote with speaker and
  time (docs/VAULT-FORMAT.md), not in a separate store next to it. Anyone who opens
  the file in Obsidian reads the same thread.
- **Without a model, no reply is invented.** The user's own turn is still written
  to the file — it's written before asking. In the "Analyze" stance, the app then
  names the earlier days it actually found, verbatim and dated: evidence instead
  of performed empathy.

### Maintenance — against rot

Deterministic checks (orphaned pages, broken wikilinks, index drift, stale pages,
undigested sources, dumps sitting too long, projects without a next step) plus
optional LLM interpretation (contradictions, frequently mentioned terms without a
page, near-duplicates). Result: a health score, a list of one-click fixes, and at
most three sentences of advice on what to do next.

Three commitments that make the difference:

- **The health score is never invented.** Without a run and without content,
  there's no score, no 100. The screen says _why_ the score is what it is.
- **A fix shows the line it writes beforehand** — verbatim. Anything that writes
  nothing (comparing two pages, jumping to filing) is called "open," not "merge."
  Every write has an undo; the entry in the module's chronicle stays, because
  `log.md` is append-only.
- **Contradictions are named, not smoothed over.** And they need a model: without
  a route, the app claims none. The screen states, right there, what a model would
  additionally find.

## LLM: categorized, selectable, honest

Every LLM task in the app is a category (`TaskKind`). The user assigns a provider
and a model to each category — in the admin screen, with a suggestion per category:

| Task                      | Recommendation | Why                                                    |
| ------------------------- | -------------- | ------------------------------------------------------- |
| Title and tags            | small/local    | One sentence of output. A large model would be wasteful|
| File a dump                | small/local    | Personal content, a simple decision                     |
| Extract todos and deadlines| small/local    | Structured extraction                                   |
| Answer a question          | medium         | Must correctly merge evidence                            |
| Digest a source            | medium         | Longer, but straightforward                              |
| Write wiki pages           | large          | Linking, spotting contradictions, changing content       |
| Interpret a maintenance run| large          | Judgment over the whole content                          |
| Journal conversation       | local          | The most sensitive thing here                            |

Providers are set up in the admin screen (Anthropic, OpenAI, OpenRouter, Ollama,
LM Studio, any OpenAI-compatible URL), with a connection test and model list.
Keys live encrypted on the machine, never in the vault.

**Without a configured model, the app stays fully usable**: capturing, filing,
searching, projects, todos, deadlines, writing the journal, maintenance checks.
Wherever a model is needed, the app says so right at that spot — with a direct
link into the setting.

## Out of scope

Not in this version: multi-user, a sync service, mobile, embeddings/vector
search, calendar and mail integration, voice input, a web UI. The vault is a
folder — anyone who wants to sync it can do so with Git, OneDrive, or a stick.

And things that were explicitly **not** built, despite being planned:

- **No automatic filing.** A threshold above which a filing proposal executes
  without confirmation was once a setting. It contradicts the principle "the AI
  proposes, the human confirms," so nobody could read it — and a toggle nobody
  reads is a false claim. It's gone.
- **No pre-disabling of day close.** The close suggests what's in the text;
  checking it off is the human's job. Toggles that pre-suppress individual kinds
  of proposals only hide what the user could reject anyway.
- **No contradiction check across the whole content.** The interpretation sees
  the pages touched by findings plus those with a named relationship, at most
  24 — for cost and privacy reasons. A contradiction between two otherwise
  unremarkable pages stays undiscovered; the boundary lives in the doc comment
  of `core/gardener/audit.ts`.
