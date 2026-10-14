# Kroky's Combat Farming

Version **0.1.1**, an experimental companion for SEMI Auto Farming 1.1.2 and SEMI Core 2.0.6 on Melvor Idle 1.3.1.
SEMI Auto Farming and SEMI Core remain unchanged.

When crops are ready during combat, the companion waits until the current monster dies and fight cleanup finishes.
It equips farming gear during the next monster's spawning gap, lets SEMI harvest and replant, then restores the original equipment, spells, and prayers.
The game does not advance a combat tick during this synchronous sequence.
The companion checks that equipment is restored and combat timers, the selected area, and the selected monster are unchanged.
HP rounding caused by its temporary gear swaps is corrected when the original maximum HP has been restored.
If processing or verification fails, further companion processing is paused until reload and the status reports the failure.
If the original equipment cannot be restored, combat is stopped before another monster can spawn.

## Installation

Load the mods in this order:

1. SEMI Core.
2. SEMI Auto Farming.
3. Kroky's Combat Farming.

Import `krokys-combat-farming-0.1.1.zip` through **Creator Toolkit → Local Mods** to test locally.
Enable the local mod and reload the game.
Local Toolkit mods have no mod.io dependency metadata, so the companion checks for the loaded SEMI mods and attaches when their original farming ticker is scheduled.
The mod.io listing must declare SEMI Auto Farming as a dependency when published.

Open **Mod Settings → Kroky's Combat Farming**.
**Harvest between monsters** is enabled by default.
Enable the individual **Swap** switches for the slots you want to use during combat harvesting.
These combat-only switches start off, so importing the companion alone does not start changing your equipment.
SEMI's own slot switches remain responsible for equipment swapping outside combat.
SEMI keeps its slot settings private; the companion cannot automatically share them.
Crop priorities, ignored plots, composting, and potions remain controlled by SEMI.

The companion uses SEMI 1.1.2's farming equipment priority lists and ignores items from expansions you do not have.
It uses Melvor's correct Helmet slot for the Clown Hat.
Equipment must be in your bank or already equipped and meet its normal requirements.
Dungeon and Stronghold switching unlocks remain required, and protected Slayer access equipment stays protected.
Blocked items are listed in the last-batch status; the remaining eligible slots can still be used.
Disable **Harvest between monsters** to restore SEMI's original scheduling and combat behavior.
Disabling the companion in Creator Toolkit and reloading removes its runtime hooks.

## How to verify it

The status readout in the companion's settings shows combat harvest totals and the last batch's gear, restoration result, and combat timer checks.
It lists farming items actually equipped at harvest, marking items that were already equipped even if their Swap switch is off.
It only counts calls made through SEMI's original harvest logic during a spawning gap.
Offline catchup runs the same farming and combat hooks, so the companion also applies while the game simulates time away.
The offline recap window does not pause normal gameplay; crops can also be harvested while that window remains open.

1. Export a backup of your save before a first live test.
2. Keep SEMI enabled for a crop category and choose its normal seed priority.
3. Enable a companion slot such as **Swap Ring** and keep a suitable farming ring in your bank.
4. Fight an enemy you can safely idle and wait for a planted crop to mature naturally.
5. Open the companion's settings and look for **Verified: harvested during a spawning gap and restored combat gear**.
6. Check that the farming item is listed, the combat harvest total increased, **Equipment, spells and prayers restored** says **Yes**, and **Combat timers unchanged** says **Yes**.
7. Check that the crop was replanted and your original combat gear is still equipped.

No crop-growth cheats, granted items, or test save mutations are built into the mod.
The test harness is separate from the release archive.
Its mocked game edges cannot prove compatibility with every installed mod, so the live status checks remain important.

## Development checks

Run `./build.ps1` in PowerShell with Node.js installed.
The script downloads the exact published upstream archives into ignored `.cache/` when needed, runs `node --test`, and builds the release archive only if the tests pass.
The integration tests execute the actual published SEMI modules against disposable game fixtures.
Run `node --test` directly after the fixtures have been fetched.

Sources inspected:

- [SEMI Auto Farming source](https://gitlab.com/semi5/semi-auto-farm/-/blob/main/src/v1.3.0/main.mjs).
- [SEMI Core source](https://gitlab.com/semi5/semi-core/-/blob/main/src/v1.3.0/main.mjs).
- [Melvor combat lifecycle](https://melvoridle.com/assets/js/built/baseManager.js).
- [Melvor equipment rules](https://melvoridle.com/assets/js/built/player.js).

The companion wraps SEMI's private `SEMI:AutoFarming` ticker and supports the published scheduler that uses at most 20 debounce ticks.
Future SEMI releases require reviewing that integration and rerunning the upstream tests.
No upstream source files are included in the release or committed to this repository.
