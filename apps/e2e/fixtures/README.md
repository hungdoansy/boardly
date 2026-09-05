# Import fixtures (UNIT-21)

Hand-written board files, kept hand-written on purpose: they are the _interchange contract_, so a
regenerated fixture would silently track whatever the exporter currently emits and stop testing that
older files still load.

- `board-v2.json` — a current (v2) export. Carries two projects, one of which is named to collide
  with a board project under a different id (the name-fusion case), a label, three cards including
  one with a project the file does not define, a saved view, and non-default display preferences so
  a Replace can be checked for _not_ importing them.
- `board-v1.json` — a file written before UNIT-21: `"version": 1`, no `projects` key, no `views` key,
  and cards with no `projectId`. It must still import, with its cards carrying no project (R2, AE6).
