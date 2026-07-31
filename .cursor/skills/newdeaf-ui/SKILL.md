---
name: newdeaf-ui
description: >-
  NewDeaf UI patterns for Expo screens and components: StyleSheet + src/theme
  tokens, Screen wrapper, Moti/Reanimated, expo-image, Pressable, i18n t(), and
  tablet breakpoints. Use when building or editing screens, shared components,
  layout, styling, animations, or user-facing copy.
---

# NewDeaf UI

## Rules

1. Check `src/components/` before creating a new shared component.
2. Wrap scrollable/tab content with `Screen` from `@/src/components/Screen` when the existing screens already do.
3. Style with `StyleSheet.create` and tokens from `@/src/theme` (`colors`, `spacing`, `radius`, `fonts`, `typography`). Never hardcode hex or spacing literals for UI chrome.
4. User-facing strings go through `t()` from `@/src/i18n`. Add keys to both `ru` and `en` locale files when introducing copy.
5. Images: use `expo-image`, not RN `Image`, for posters and remote art.
6. Touch targets: prefer `Pressable` over `TouchableOpacity` for new code.
7. Animations: Moti and/or Reanimated — animate `transform` and `opacity` on the UI thread; avoid animating layout width/height unless required.
8. Tablet / wide layouts: use `useBreakpoint` from `src/hooks/` instead of ad-hoc width checks.
9. Dark product chrome: accent `#FFBB00` and background `#090C10` already live in theme — do not invent a second palette.
10. Navigation chrome (tabs, stacks, titles) belongs in Expo Router layouts under `app/`, not in a parallel React Navigation tree.

## Key paths

- Theme: `src/theme/`
- i18n: `src/i18n/`
- Shared UI: `src/components/` (MovieCard, MovieGrid, sheets, ConfirmDialog, EmptyState, Screen)
- Tabs layout: `app/(tabs)/_layout.tsx`
- Root layout: `app/_layout.tsx`

## Anti-patterns

- NativeWind / Tailwind className styling
- Inline one-off color constants scattered across files
- Hardcoded Russian or English strings in JSX
- Duplicating MovieCard/Grid instead of reusing
