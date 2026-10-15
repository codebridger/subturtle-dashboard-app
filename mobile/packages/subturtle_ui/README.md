# subturtle_ui

The Subturtle design kit for Flutter. It ports the Subturtle Design System
(`ds/subturtle/tokens/*.css` and the React components) to Flutter.

## What is inside

| Part | Files |
| --- | --- |
| Colour tokens, light and dark (`StColors`, a `ThemeExtension`) | `lib/src/tokens/st_colors.dart` |
| Type scale (`StType`), spacing (`StSpace`), radius (`StRadius`), shadows (`StShadows`), motion (`StMotion`) | `lib/src/tokens/` |
| Material 3 theme (`StTheme.light()` / `StTheme.dark()`) | `lib/src/theme/st_theme.dart` |
| Solar icons (`StIcon`, `StIcons`) | `lib/src/icons/` |
| DS components: `StButton`, `StIconButton`, `StBadge`, `StTag`, `StAvatar`, `StCard`, `StInput`, `StProgressBar`, `StLevelPip`, `StSegmentedControl`, `StSwitch`, `StStatTile`, `StEmptyState`, `StToast` | `lib/src/widgets/` |
| Phone parts (not in the DS yet): `StTabBar`, `StFab`, `showStBottomSheet` + `StSheet`, `StSkeleton`, `StTaskHeader`, `StPageHeader`, `StL1Text`, `StPickerRow`, `StOfflineBar` | `lib/src/widgets/st_mobile.dart`, `st_display.dart` |

Use `context.st` for colours and `context.stShadows` for shadows.

## Rules the kit follows

- Dark mode flips each colour ramp around its middle step. `rose500` and `jade500`
  stay the same. So a widget reads a ramp step (for example `rose700`), never a hex value.
- Fonts are bundled: Nunito, with Vazirmatn as a fallback for Persian and Arabic.
  Use `StL1Text` for learner-language strings. It sets RTL only for that string.
- Tap areas are at least 48 dp, even when the visible control is smaller.
- Motion turns off when the phone asks for reduced motion.

## Icons

`lib/src/icons/st_icon_data.g.dart` is generated. To add icons, run:

```
node tool/gen_icons.mjs <path to an Iconify file that calls addCollection(...)>
```

The script always reads the web kit's set in `ui/src/icon/icons.generated.ts`.

## Gallery

`example/` shows every component. Run it with `flutter run` inside `example/`
and use the switch at the top to see the dark theme.

## Fonts

Nunito and Vazirmatn are under the SIL Open Font License 1.1. The licence files
are in `assets/fonts/`.
