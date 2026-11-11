# Mod.io listing

## Name

Kroky's Armed to the Seeds

## Summary

SEMI Auto Farming companion: harvest in farming gear between fights, or immediately in your current gear.

## Description

Farming-equipment swaps for [SEMI Auto Farming](https://mod.io/g/melvoridle/m/semi-auto-farming), during combat and offline progress.

- **Wait until current fight ends — ON:** Equip selected farming gear, harvest and replant during the monster respawn gap, then restore combat equipment, spells and prayers.
- **OFF (default):** Harvest on SEMI's normal schedule using current gear, without combat equipment swaps.
- Choose which slots may swap and inspect harvest counts, farming gear, deferred time and restoration checks.
- Keep SEMI's crop priorities, ignored plots, composting and potion settings.
- Preserve normal crop growth, combat timers and equipment requirements.

Long fights delay harvesting and replanting while waiting is enabled.
Immediate harvesting may miss bonuses from farming gear that is not worn.

**Setup:** Load SEMI Core, SEMI Auto Farming, then Armed to the Seeds.
Open **Mod Settings → Kroky's Armed to the Seeds**, choose whether to wait, and enable the desired **Swap** slots when waiting is on.
Waiting and swap slots start off for new installations; existing choices are preserved.

**Requires:** SEMI Auto Farming and SEMI Core.
Tested with SEMI Auto Farming **1.1.2** and SEMI Core **2.0.6**.
This companion does not replace either mod.
Tested with Melvor Idle **1.3.1**; experimental equipment-swap integration.

[Source code](https://github.com/krokyk/melvor-armed-to-the-seeds)

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
