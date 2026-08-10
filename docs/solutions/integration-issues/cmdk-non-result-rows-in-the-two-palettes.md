---
title: Adding a non-result row to either cmdk palette
date: 2026-08-09
problem_type: integration-issues
module: apps/web/components/command-palette, apps/web/components/search
severity: medium
tags:
  [cmdk, command-palette, search-dialog, force-mount, aria, role-option, accessibility, filtering]
---

The app has **two** cmdk surfaces and they are configured oppositely:

- `apps/web/components/command-palette/palette.tsx` (⌘K) — `shouldFilter` left at its default `true`, so cmdk ranks every registered item against the query itself.
- `apps/web/components/search/search.tsx` (`/`) — `shouldFilter={false}`, ranking done by the repo's own `scoreDoc` in `apps/web/components/search/search-index.ts`.

That split means a row which is _not_ a search result — a toggle, a filter switch, a mode row — breaks differently on each surface, in opposite directions. Both were caught during planning (UNIT-20), verified against cmdk 1.1.1's source, before any code was written.

## A plain `CommandItem` disappears under a query in ⌘K

cmdk's Item render gate is `forceMount || filter() === false ? true : search ? filtered.items.get(id) > 0 : true`, and the enclosing Group is hidden unless `filtered.groups.has(id)`. So in the palette, the moment the user types anything, a control row scores against that query like any card and unmounts.

This bites hardest for a control whose whole job is to change what the (currently empty) result set contains: the user types a term nothing visible matches, sees "No results.", and the row that would have revealed the matches is gone. Render such rows with `forceMount` — on the item, and on the group if it sits in one.

## The same row permanently suppresses `CommandEmpty` in `/`

Under `shouldFilter={false}` cmdk sets `filtered.count = registeredItems.size`. `CommandEmpty` renders only on `filtered.count === 0`. A normally-registered control row therefore holds the count at ≥ 1 forever and the empty state never appears again — which would break the existing assertion at `apps/web/components/search/search.test.tsx:115` ("No matching cards.").

`forceMount` items are excluded from registration, so the same one prop is the fix on both surfaces, for two unrelated reasons.

## You cannot set `role` on a `CommandItem`

cmdk spreads caller props _before_ hardcoding its own: `...props, id, "cmdk-item": "", role: "option", "aria-selected": …`. A supplied `role` is silently discarded — no error, no warning, it just does not apply.

This matters because `DESIGN.md` §7's multi-toggle pattern (`role="menuitemcheckbox"` + right-aligned check in a `pr-7` gutter) belongs to `DropdownMenuCheckboxItem` in `packages/ui/src/components/dropdown-menu.tsx`, a different primitive. Inside cmdk's `role="listbox"`, a menu role would be invalid ARIA anyway, and `CommandInput`'s `aria-activedescendant` would point at an invalid child. `apps/e2e/tests/search.spec.ts` already queries these rows as `getByRole("option", …)`.

Keep cmdk's native `option` role and express toggle state with `aria-checked` (which `option` supports); reuse only the _visual_ half of the §7 pattern.

## Two smaller traps in the same files

`ZoomItems` in `palette.tsx` is not a precedent for a row that acts without closing — it is mounted as `<ZoomItems onRun={() => setOpen(false)} />` and closes on every select. No `CommandItem` in that file stays open today. cmdk's `onSelect` does not close anything by itself; closing is always explicit in this codebase, so a non-closing row is simply one that omits the call.

`palette.tsx`'s ⌘K handler calls `setOpen((o) => !o)` directly, bypassing the `setOpenState` wrapper that clears `query`. Any per-open reset hung off the close path alone will not fire when the user closes with ⌘K. Reset on the open transition instead, or fix the bypass. Note the two surfaces already differ here: the palette clears `query` on close, `SearchDialog` clears it only inside `pick`, so `/` reopens with the previous query still in the input.
