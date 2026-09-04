# Boot smoke test (no SketchUp install required)

This directory holds a real-Ruby boot test for the plugin, used because this
development environment has never had SketchUp installed. `sketchup.rb` is a
minimal stub of the SketchUp API surface the plugin touches at boot/menu-click
time; `run_smoke.rb` requires the real plugin on top of it and clicks every
menu item.

It caught a real bug once (v3.9.0): `Kalaxa::UI` shadowing `::UI` broke the
analysis panel and the sync client's menu — invisible to static review, only
found by actually booting.

## Run

Requires any real Ruby matching the plugin's target SketchUp Ruby version
(this project targets Ruby 2.7-3.x compatible syntax; see
`kalaxa/dev/check_ruby27_compat.py`).

```bash
ruby kalaxa/dev/smoke/run_smoke.rb <path-to-kalaxa-unified> <path-to-kalaxa-sync-client>
# e.g. from the kalaxa-unified repo root:
ruby kalaxa/dev/smoke/run_smoke.rb . ../kalaxa-sync-client
```

## What it is NOT

`sketchup.rb` stubs only what boot/menu-click code paths need - it is not a
SketchUp API emulator. Interactive tool behavior (mouse move/click drawing
loops via `Sketchup::InputPoint`, `Tool#onMouseMove`, etc.) is not simulated;
those tools just need to *activate* without raising, which is what this
catches. Extend the stub here (not in the plugin) if a future menu item needs
another SketchUp API surface at click time.
