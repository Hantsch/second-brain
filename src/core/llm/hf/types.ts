/* Public shapes for the Hugging Face search + file-list functions (033, D3).
   The serialisable outcome/result types live in `@shared/types` (so
   `src/shared/ipc.ts` can type `llm:searchModelFiles`, D4, without pulling in
   the rest of `core/llm`) and are re-exported here for this module's own
   callers — same convention `runtime/plan.ts` uses for `RuntimeDownloadPlan`.

   The raw-response interfaces below are this module's own concern only: they
   describe just enough of Hugging Face's JSON to parse it defensively, never
   assumed to be the full/stable shape. */

export type {
  HfFileListOutcome,
  HfLookupReason,
  HfModelFile,
  HfModelSearchOutcome,
  HfModelSearchResult,
} from '@shared/types';

/** One entry of `GET /api/models?search=…&filter=gguf` — only the fields this
    module reads; anything else in the real response is ignored. */
export interface HfApiModelEntry {
  id?: unknown;
  downloads?: unknown;
  likes?: unknown;
  tags?: unknown;
}

/** One entry of `GET /api/models/{id}/tree/main` — a flat list mixing files
    and directories; `type` and `path` are what tells them apart and names
    them, `size` is present for files. */
export interface HfApiTreeEntry {
  type?: unknown;
  path?: unknown;
  size?: unknown;
}
