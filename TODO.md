# TODO

## Critical

- Quest persistence refactor: separate quest definition data (imported/updatable content) from quest runtime state (progress, status, visibility, active objective, pin bindings), and migrate to stable IDs.
  - Add persistent `questId` and `taskId` fields; merge updates by ID instead of task index/name.
  - Store state in structured module flags (do not parse task state from HTML tags).
  - Keep pins/state keyed by `questId` + `taskId`, with reconcile as recovery only.
  - Add import mode: "update definitions only" to protect live campaign progress during compendium/content updates.
  - Include migration from current HTML/flag state to new schema with backward compatibility.
