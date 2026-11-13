# Mod.io listing

## Name

Kroky's Armed to the Seeds

## Summary

Optional farming-gear swaps between fights, with normal crop automation and restoration of combat equipment, spells and prayers.

## Description

Farming-equipment swaps for [SEMI Auto Farming](https://mod.io/g/melvoridle/m/semi-auto-farming), during combat and offline progress.

- With **Wait until current fight ends** on, equip selected farming gear and harvest/replant during the monster respawn gap.
- Restore combat equipment, spells and prayers afterward.
- With waiting off **(default)**, farm on the normal schedule using current gear.
- Choose the slots allowed to swap.
  Crop priorities, ignored plots, composting and potion settings are kept.

Long fights delay farming when waiting is enabled.
With waiting off, current gear determines farming bonuses.
Normal crop growth, combat timers and equipment requirements apply.

**Requires:** [SEMI Core](https://mod.io/g/melvoridle/m/semi-core) and [SEMI Auto Farming](https://mod.io/g/melvoridle/m/semi-auto-farming); load this companion after both.
Tested with [SEMI Core 2.0.6](https://mod.io/g/melvoridle/m/semi-core), [SEMI Auto Farming 1.1.2](https://mod.io/g/melvoridle/m/semi-auto-farming) and Melvor Idle 1.3.1.
It extends their farming automation.

Open **Mod Settings → Kroky's Armed to the Seeds** and enable waiting and the desired **Swap** slots.
Both start off for new installations.
Equipment-swap integration is experimental.

[Source code](https://github.com/krokyk/melvor-armed-to-the-seeds)

### See my other mods:

- [Kroky's Bardic Troupe](https://mod.io/g/melvoridle/m/krokys-bardic-troupe)
- [Kroky's Workforce](https://mod.io/g/melvoridle/m/krokys-workforce)
- [Kroky's Better UI](https://mod.io/g/melvoridle/m/krokys-better-ui)
- [Kroky's Mapmaking](https://mod.io/g/melvoridle/m/krokys-mapmaking)
- [Kroky's No Pain, All Gain](https://mod.io/g/melvoridle/m/krokys-no-pain-all-gain)

## Changelog

- Choose immediate combat farming or farming-equipment swaps during monster respawns.
- Apply the same behavior during offline progress.
- Report automatic harvests, deferred farming time, equipment restoration and combat-timer checks.

## Release fields

- **Version:** 1.0.0
- **Game version:** 1.3.1
- **Release file:** `krokys-armed-to-the-seeds-1.0.0.zip`
- **Cover:** `assets/cover.png`
- **Configuration icon:** `assets/icon.png`, a transparent 200 × 200 PNG included in the release manifest and archive.
- **Required dependency:** SEMI Auto Farming, mod ID `2362049`.
  SEMI Auto Farming already depends on SEMI Core, mod ID `2253323`.

Melvor uses mod.io dependency metadata rather than a `dependencies` field in `manifest.json`.
When testing a local Toolkit mod, link the listing before configuring equipment switches so the settings persist across reloads.
