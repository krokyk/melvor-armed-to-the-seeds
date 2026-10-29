# Kroky's Armed to the Seeds

Version **1.0.0**, an experimental companion for SEMI Auto Farming 1.1.2 and SEMI Core 2.0.6 on Melvor Idle 1.3.1.
SEMI Auto Farming and SEMI Core remain unchanged.
The namespace, Combat Farming settings section, and switch keys retain their original names so existing linked settings survive the rename.

When **Wait until current fight ends** is on and crops are ready during combat, the companion waits until the current monster dies and fight cleanup finishes.
It equips farming gear during the next monster's spawning gap, lets SEMI harvest and replant, then restores the original equipment, spells, and prayers.
Turn **Wait until current fight ends** off to let SEMI harvest ready crops during the current fight using the equipment already worn, without farming-equipment swaps.
Waiting can provide more farming-equipment bonuses, but long fights delay harvesting and replanting and can reduce farming output.
Immediate harvesting avoids that wait but may miss bonuses from farming equipment that is not currently worn.
The game does not advance a combat tick during this synchronous sequence.
The companion checks that equipment is restored and combat timers, the selected area, and the selected monster are unchanged.
HP changes caused by temporary equipment and prayer restoration are corrected when the original maximum HP has been restored.
If processing or verification fails, further companion processing is paused until reload and the status reports the failure.
If the original equipment cannot be restored, combat is stopped before another monster can spawn.

## Installation

Load the mods in this order:

1. SEMI Core.
2. SEMI Auto Farming.
3. Kroky's Armed to the Seeds.

Import `krokys-armed-to-the-seeds-1.0.0.zip` through **Creator Toolkit → Local Mods** to test locally.
Enable the local mod and reload the game.
Local Toolkit mods have no mod.io dependency metadata, so the companion checks for the loaded SEMI mods and attaches when their original farming ticker is scheduled.
Unlinked Toolkit mods do not save their settings between reloads; link a private or public mod.io listing in Toolkit, then enable the desired Swap switches again before testing offline equipment swaps.
The mod.io listing must declare SEMI Auto Farming as a dependency when published.

Open **Mod Settings → Kroky's Armed to the Seeds**.
**Wait until current fight ends** starts off for new installations.
Updates preserve your effective waiting choice, keeping waiting off if the old **Enable Armed to the Seeds** switch was off.
With waiting on, enable the individual **Swap** switches for the slots you want to use during respawn-gap harvesting.
With waiting off, SEMI uses its normal crop-processing schedule during combat and keeps your current equipment; the companion's slot switches are ignored.
The slot switches are disabled and greyed out while waiting is off, and their selections are kept for when you turn it back on.
The wait is for the current fight to finish, and combat then continues through its normal respawn timer.
These combat-only switches start off, so importing the companion alone does not start changing your equipment.
SEMI's own slot switches remain responsible for equipment swapping outside combat.
SEMI Auto Farming 1.1.2 exposes no direct settings API, so the companion keeps its own combat slot settings.
Crop priorities, ignored plots, composting, and potions remain controlled by SEMI.

The companion uses SEMI 1.1.2's farming equipment priority lists and ignores items from expansions you do not have.
It uses Melvor's correct Helmet slot for the Clown Hat.
Equipment must be in your bank or already equipped and meet its normal requirements.
Dungeon and Stronghold switching unlocks remain required, and protected Slayer access equipment stays protected.
Blocked items are listed in the last-batch status; the remaining eligible slots can still be used.
Turn **Wait until current fight ends** off to use SEMI's normal schedule without combat equipment swaps.
Disabling the companion in Creator Toolkit and reloading removes its runtime hooks.

## How to verify it

The status readout shows two counters for the current session: plots **Harvested during respawns** in waiting mode, and **All automatic harvests** made by SEMI during and outside combat.
Each successfully harvested plot counts once, regardless of crop quantity; manual harvests are excluded.
Turning waiting off stops the respawn counter increasing and preserves both totals until the game reloads.
**Time farming was deferred** reports simulated game seconds during which the addon held SEMI's scheduled processing while waiting for the current fight to end.
The timer counts each deferred scheduler tick once, even when several plots are waiting, and also includes deferred planting, dead-crop cleanup, and initial processing.
It measures processing delays rather than lost crops or yield.
The last combat batch still shows its timing mode, gear, restoration result, and combat timer checks.
It lists farming items actually equipped at harvest, marking items that were already equipped even if their Swap switch is off.
Offline catchup runs the same farming and combat hooks, and its simulated harvests and deferred time are included in the session totals.
The status readout refreshes when opened and while visible, with offline totals displayed after catchup finishes.
The offline recap window does not pause normal gameplay; crops can also be harvested while that window remains open.

1. Export a backup of your save before a first live test.
2. Keep SEMI enabled for a crop category and choose its normal seed priority.
3. Keep **Wait until current fight ends** on, enable a companion slot such as **Swap Ring**, and keep a suitable farming ring in your bank.
4. Fight an enemy you can safely idle and wait for a planted crop to mature naturally.
5. Open the companion's settings and look for **Verified: harvested during a spawning gap and restored combat gear**.
6. Check that the farming item is listed, both harvest counters increased, **Equipment, spells and prayers restored** says **Yes**, and **Combat timers unchanged** says **Yes**.
7. Check that the crop was replanted and your original combat gear is still equipped.

To verify immediate harvesting, turn **Wait until current fight ends** off while a crop is ready and the current monster is still alive.
SEMI should harvest and replant on its normal schedule without waiting for that monster to die.
Look for **Verified: harvested immediately during combat without equipment swaps**, an increased **All automatic harvests** total, unchanged gear and HP, and passing restoration and timer checks.
The respawn counter and deferred time should stop increasing while waiting is off.

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
- [Melvor farming harvest events](https://melvoridle.com/assets/js/built/farming2.js).
- [Melvor equipment rules](https://melvoridle.com/assets/js/built/player.js).

The companion wraps SEMI's private `SEMI:AutoFarming` ticker and supports the published scheduler that uses at most 20 debounce ticks.
Future SEMI releases require reviewing that integration and rerunning the upstream tests.
No upstream source files are included in the release or committed to this repository.

## Artwork

`assets/cover.png` is the mod.io listing cover, and `assets/icon.png` is the transparent configuration icon included in the release archive.
The configuration icon is limited to 200 × 200 pixels, and the build rejects larger exports.
The artwork follows the sibling mods' navy, gold, and simple cartoon style.
The gloves and cape take visual inspiration from Melvor's [Bob's Gloves](https://wiki.melvoridle.com/w/Bob%27s_Gloves) and [Superior Farming Skillcape](https://wiki.melvoridle.com/w/Superior_Farming_Skillcape) icons.
Exact built-in image-generation prompts and reference roles are recorded in `assets/cover-prompt.txt` and `assets/icon-prompt.txt`.
