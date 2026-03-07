# Image Optimizer — Studio Pro UI/UX Redesign

**Date:** 2026-03-07
**Status:** Approved for implementation

---

## Context

The Image Optimizer is a sophisticated batch image tool with 5 operations (crop, resize, format, compress, rename), per-image overrides, preset system, and 4-tab preview workspace. The processing logic is solid, but the UI feels minimal and doesn't communicate the tool's power. The user wants a professional, Adobe/Figma-style dark tool feel with a prominent Rename-Only mode toggle that bypasses all processing.

A "rename-only" preset already exists in `presets.ts`, but it's buried and not prominently accessible. The new design surfaces it as a first-class mode toggle in the top toolbar.

**Goal:** UI/UX overhaul to "Studio Pro" standard — polished layout, visual hierarchy, color-coded operations, rich queue items — while keeping all processing logic completely untouched.

---

## Design: Studio Pro

### Color Palette
| Role | Token | Value |
|------|-------|-------|
| App background | `bg-zinc-950` | `#09090B` |
| Panel background | `bg-[#111113]` | — |
| Panel border | `border-white/[0.06]` | — |
| Section border | `border-white/[0.08]` | — |
| Primary text | `text-zinc-100` | — |
| Secondary text | `text-zinc-400` | — |
| Muted text | `text-zinc-600` | — |

### Operation Accent Colors
| Operation | Color | Hex |
|-----------|-------|-----|
| Crop | Violet | `#8B5CF6` |
| Resize | Blue | `#3B82F6` |
| Format | Emerald | `#10B981` |
| Compression | Amber | `#F59E0B` |
| Rename | Cyan | `#06B6D4` |
| Export | Indigo | `#6366F1` |

---

## Layout Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [⚡ title]  ──────────────  [SOLO RENOMBRAR ○●] [Preset ▾] │
├──────────────┬────────────────────────────────────┬──────────────────┤
│ SETTINGS     │  PREVIEW WORKSPACE                  │  QUEUE           │
│  240px       │  flex-grow (min 400px)              │  280px           │
│              │                                     │                  │
│ [CROP ○]     │  ○ Original  ○ Recorte  ● Resultado │  ─ stats row ─   │
│ [RESIZE ●]   │      ─ pill tab nav ─               │  [img] name  ✓   │
│ [FORMAT ●]   │                                     │  [img] name ⏳   │
│ [COMPRESS ●] │   (large image / drop zone)         │  [img] name ●    │
│ [RENAME ○]   │                                     │                  │
│ [EXPORT ●]   │  ─ Per-image overrides ─            │  ─────────────   │
│              │                                     │  [Process All]   │
│ ─ Presets ─  │                                     │  [Download ZIP]  │
│ [pill cards] │                                     │                  │
└──────────────┴────────────────────────────────────┴──────────────────┘
```

### Toolbar
- Left: `⚡ OPTIMIZADOR DE IMÁGENES` (logo + title)
- Right: **Rename-Only mode toggle** (labeled "Solo Renombrar", pill switch) + **Preset quick-select dropdown**
- Height: ~44px, `border-b border-white/[0.06]`

### Settings Panel (Left, 240px)
- Each operation = `<OperationSection>` with:
  - 3px left border in operation color
  - Icon + operation name + inline toggle switch (right-aligned)
  - Content expands/collapses when toggled (no animation library needed, CSS `max-height` transition)
  - Dimmed when `renameOnlyMode` is active (except rename section)
- Presets section at bottom: horizontal scrollable row of colored pill cards

### Preview Workspace (Center, flex)
- Drop zone shown when no image is selected (current behavior kept)
- Preview tabs as pill-style nav: `[Original] [Recorte] [Resultado] [Comparar]`
- Image display area fills available space
- Per-image overrides section below image, compact card style

### Queue Panel (Right, 280px)
- Stats row: compact inline badges (N imgs, N pending, N ready, X% saved)
- Each item: `[32px thumbnail] [name + ext] ──────── [size: 2.1MB→0.8MB] [status]`
- Status badges: `pending` (zinc), `processing` (blue pulse), `completed` (green), `stale` (amber), `error` (red), `excluded` (zinc line-through)
- Hover reveals action icons (exclude, override, select)
- Select/clear buttons in panel header
- Process + Download buttons in panel footer with clear visual hierarchy

---

## Rename-Only Mode

### Behavior
When toggled ON:
1. Saves current `settings.operations` to `savedOperations` ref
2. Forces all operations OFF except `renameEnabled: true`
3. Settings panel shows `MODO: SOLO RENOMBRAR` overlay badge on each disabled section
4. Processing uses existing `usesSourceDirectly` path in `pipeline.ts` (no change needed)

When toggled OFF:
1. Restores `savedOperations` to `settings.operations`
2. Clears the overlay badge

### State additions to `index.tsx`
```typescript
const [renameOnlyMode, setRenameOnlyMode] = useState(false);
const savedOperationsRef = useRef<OperationsSettings | null>(null);
```

---

## Files to Modify

| File | Change |
|------|--------|
| `types.ts` | No changes needed — `renameOnlyMode` is local UI state |
| `index.tsx` | Add toolbar, rename-only mode logic, adjust grid layout |
| `SettingsPanel.tsx` | Full visual redesign — colored sections, collapse/expand, pill presets |
| `QueuePanel.tsx` | Richer item rows, stats bar, better status badges |
| `PreviewWorkspace.tsx` | Pill-style tab nav, larger image display, compact overrides card |
| `ui.tsx` | Add: `Toolbar`, `OperationSection`, `PillPreset`, `ModeToggle` components |

## Files to NOT Modify
- `pipeline.ts` — processing logic untouched
- `utils.ts` — utilities untouched
- `presets.ts` — presets untouched
- `CropEditor.tsx` — crop editor untouched (or minor styling only)
- All backend files — untouched

---

## Implementation Steps

1. **`ui.tsx`** — Add new reusable components: `Toolbar`, `OperationSection` (colored border + collapse), `PillPreset` card, `ModeToggle` (pill switch), `StatusBadge`, `StatsBadge`
2. **`index.tsx`** — Restructure layout to 3-column + toolbar; add rename-only mode state + toggle handler; pass `renameOnlyMode` to `SettingsPanel`
3. **`SettingsPanel.tsx`** — Replace current sections with `<OperationSection>` wrappers; add rename-only overlay; add pill preset cards at bottom
4. **`QueuePanel.tsx`** — Redesign item rows to show size diff and operation-colored status; improve stats row; polish action buttons
5. **`PreviewWorkspace.tsx`** — Replace current tab UI with pill nav; tighten overrides section; improve drop zone styling

---

## Verification

1. Run `npm run dev` in `frontend/`, navigate to `/image-optimizer`
2. Upload several images → confirm queue renders with size info
3. Toggle SOLO RENOMBRAR → confirm all settings sections dim except rename
4. Toggle OFF → confirm settings restore
5. Process images in normal mode → confirm output quality unchanged
6. Download ZIP → confirm filenames and sizes correct
7. Select "rename-only" preset → same behavior
8. Check responsive behavior (min ~1024px wide)
