# Mod.io release notes

Name: **Kroky's Combat Farming**.
Version: **0.1.1**.
Game version: **1.3.1**.
Release file: `krokys-combat-farming-0.1.1.zip`.

Declare **SEMI Auto Farming** (mod ID `2362049`) as a required dependency in the mod.io listing.
SEMI Auto Farming already depends on **SEMI Core** (mod ID `2253323`).
Melvor checks mod.io dependency metadata, rather than a `dependencies` field in `manifest.json`.
The user must keep SEMI Core → SEMI Auto Farming → Kroky's Combat Farming in load order.

## Listing description

Let SEMI Auto Farming use farming equipment between monsters while you keep fighting.
The companion waits for the current monster to die, swaps gear during the next monster's spawning gap, lets SEMI harvest and replant, and restores your combat equipment before the next fight.
SEMI's existing crop priorities, composting, and potion behavior remain in charge.
Separate combat-only slot switches choose which farming equipment can be used.
A status readout shows the last harvest, farming gear used, equipment restoration, and combat timer verification.
Normal dungeon, Stronghold, and Slayer equipment restrictions still apply.

Requires SEMI Auto Farming 1.1.2 and SEMI Core 2.0.6.
This is an experimental release; export a save backup before your first live test.
The original SEMI mods are not modified.
