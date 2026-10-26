# Color audit and migration — Kaivincia Corp

## Scope and method
Initial source inventory was sampled from 15 high-traffic React/TypeScript files (App, CRMLayout, Sidebar, Client360, ClientContactCard, CommandBar, NotificationCenter, admin panels, PipelineListView, ThemeModule, AppearanceContext, Dashboard, Clients and ClientManagement). This is a focused first pass, not a claim that every one of the 109 TSX files has been audited. The softphone folder `src/components/calls/*` was intentionally excluded.

## Findings from the initial sample
- Repeated accent drift: `#00F0FF` appeared 235 times; other hardcoded accents included `#A855F7`, `#22D3EE`, `#00BFFF`, `#10B981`, `#F59E0B` and `#EF4444`.
- Inconsistent neutral text: `text-gray-500` (127), `text-gray-400` (121), `text-gray-900` (62), `text-gray-600` (38) and `text-gray-700` (21).
- Inconsistent borders/surfaces: `border-gray-100` (67), `border-gray-200` (64), `bg-gray-50` (33), `bg-gray-100` (28).
- Status palette drift: emerald, green, red, amber, cyan and blue utilities were mixed with custom neon hex values.
- No `dark:` utility classes were found in the sampled files (zero matches). The previous global stylesheet also contained overrides that forced dark Tailwind surfaces to white, producing unpredictable combinations.

## Implemented in this pass
- Added semantic Apple-inspired tokens in `src/styles/tokens.css`: foregrounds, surfaces, separators, fills, status colors, accent states, system palette, explicit light/dark appearance and reduced-transparency fallbacks.
- Extended `tailwind.config.js` with `accent-*`, `fg-*`, `surface-*`, `system-*`, `semantic-*` and `separator-* ` utilities.
- Updated global stylesheet to use semantic surface/foreground tokens and removed the previous force-white override blocks.
- Migrated repeated neutral, accent and status utilities in Dashboard, Clients, ClientManagement and CRMLayout. No changes were made to `src/components/calls/*`, Telnyx services, API handlers, auth/RBAC logic, Firestore contracts or rules.

## Contrast notes
Ratios use WCAG relative luminance, with opaque token colors and neutral surfaces:
- `#545459` on white (secondary foreground): approximately 7.5:1 — AA/AAA for normal text.
- `#6E6E73` on white (tertiary/placeholder): approximately 5.0:1 — AA for normal text.
- `#0066CC` on white (link): approximately 5.6:1 — AA.
- `#248A3D` on white (success foreground): approximately 4.6:1 — AA.
- `#8A4B00` on white (warning foreground): approximately 7:1 — AA/AAA.
- `#D70015` on white (danger foreground): approximately 5:1 — AA.
- `#8E8E93` separator against white: approximately 3.5:1 — meets the 3:1 non-text contrast target.
- Bright official system colors (for example `#34C759` and `#007AFF`) are retained as system/accent reference colors, but should not be used as small-text foreground on white without an accessible semantic foreground. Accent button text uses the black inverse foreground to maintain contrast over the bright blue accent.

## Remaining verification
- Full inventory/migration across all 109 TSX files remains outstanding; this first pass must not be treated as proof that all hardcoded hex colors are gone.
- Need CI `npx tsc --noEmit` and `npx vite build`, then visual checks of Dashboard, Clients/Pipeline, SuperAdmin, forms, modals and toasts in both appearances.
- Automated contrast scans should inspect computed colors, especially translucent surfaces and accent variants, because the final composite depends on the backdrop.
