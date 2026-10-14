# Mod.io listing

## Name

Kroky's Armed to the Seeds

## Summary

An addon for SEMI Auto Farming: harvest with farming gear during monster respawns, or harvest immediately during combat with your current equipment.

## Description

**The monster's down.
Your carrots are up.**

**Kroky's Armed to the Seeds** is an addon for [SEMI Auto Farming](https://mod.io/g/melvoridle/m/semi-auto-farming) that automates farming-equipment swaps during monster respawns, including offline progress.

The **Wait until current fight ends** switch lets you choose between farming-equipment bonuses and prompt harvesting during long fights:

- **ON (default):** Ready crops wait until the current monster is defeated.
  The addon then equips farming gear in your chosen slots, lets SEMI harvest and replant during the respawn gap, and restores your combat equipment before the next fight.
  Long fights can substantially delay harvesting and replanting, potentially reducing farming output.
- **OFF:** SEMI harvests ready crops on its normal schedule during the current fight, using your current equipment with no automatic gear swaps during combat.
  This avoids the wait, but you may miss bonuses from farming equipment that is not currently worn.

The equipment slot switches are disabled and greyed out while waiting or the addon is off.
Your selections are kept for when you turn it back on.

This waits for the current fight, while combat continues through its normal respawn timer.
Crops continue growing normally in both modes, and the setting also applies during offline progress.

- **Dress for the harvest.**
  Choose which equipment slots may swap into farming gear when waiting is enabled.
- **Keep SEMI in charge.**
  Your existing seed priorities, ignored plots, composting, and potion settings still control the farming.
- **See what you wore.**
  The status shows the harvest mode and farming gear used, including items that were already equipped, and checks equipment restoration and combat timers.
- **Keep growing while away.**
  The addon also runs during offline progress and while the offline recap is displayed.
- **Follow the game's equipment rules.**
  Dungeon and Stronghold switching unlocks and Slayer access requirements still apply.

**Getting started**

1. Enable **SEMI Core**, **SEMI Auto Farming**, and **Kroky's Armed to the Seeds**, in that order.
2. Configure your crops as usual in SEMI Auto Farming.
3. Open **Mod Settings → Kroky's Armed to the Seeds** and choose whether to **Wait until current fight ends**.
4. If waiting is on, enable the **Swap** switches for the equipment slots you want to use.

The addon and waiting mode start enabled; the individual equipment swap switches start off.
SEMI's own equipment switches continue to control farming outside combat.

Requires **SEMI Auto Farming 1.1.2** and **SEMI Core 2.0.6**; tested with **Melvor Idle 1.3.1**.
This is an experimental addon, so export a save backup before your first test.

**Credits:** SEMI Auto Farming and SEMI Core provide the farming and equipment helpers.
The original SEMI mods remain unchanged.

[Source code](https://github.com/krokyk/melvor-armed-to-the-seeds)

## Release fields

- **Version:** 0.1.3
- **Game version:** 1.3.1
- **Release file:** `krokys-armed-to-the-seeds-0.1.3.zip`
- **Cover:** `assets/cover.png`
- **Configuration icon:** `assets/icon.png`, a transparent 200 × 200 PNG included in the release manifest and archive.
- **Required dependency:** SEMI Auto Farming, mod ID `2362049`.
  SEMI Auto Farming already depends on SEMI Core, mod ID `2253323`.

Melvor uses mod.io dependency metadata rather than a `dependencies` field in `manifest.json`.
When testing a local Toolkit mod, link the listing before configuring equipment switches so the settings persist across reloads.
