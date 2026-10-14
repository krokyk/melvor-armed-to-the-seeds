export async function setup(ctx) {
  const { CombatFarming, GEAR_PRIORITY } = await ctx.loadModule("combat-farming.mjs");
  ctx.onCharacterSelectionLoaded(() => {
    const settings = ctx.settings.section("Combat Farming");
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.whiteSpace = "pre-line";
    settings.add([
      { type: "switch", name: "enabled", label: "Enable Armed to the Seeds", default: true,
        hint: "Apply the harvesting mode chosen below during combat." },
      { type: "switch", name: "waitForCombatEnd", label: "Wait until current fight ends", default: true,
        hint: "ON: Wait until the current monster is defeated, swap to your chosen farming gear, harvest and replant, then restore combat gear before the next fight. Long fights delay harvesting and can reduce farming output. OFF: Let SEMI harvest as soon as crops are ready with your current equipment and no gear swaps during combat. This avoids the wait but may miss farming-equipment bonuses." },
      { type: "label", name: "status", label: status },
      { type: "label", name: "slot-description", label: "Combat-only equipment swaps",
        hint: "Used when Wait until current fight ends is on. SEMI's own switches still control farming outside combat." },
    ]);
    for (const slotID of new Set([...Object.keys(GEAR_PRIORITY.melvor), ...Object.keys(GEAR_PRIORITY.abyssal)])) {
      const slot = game.equipmentSlots.getObjectByID(slotID);
      if (!slot) continue;
      const items = [...new Set([...(GEAR_PRIORITY.melvor[slotID] ?? []), ...(GEAR_PRIORITY.abyssal[slotID] ?? [])])]
        .map(id => game.items.getObjectByID(id)).filter(Boolean);
      settings.add({ type: "switch", name: `swap-${slotID}`, label: `Swap ${slot.emptyName}`, default: false,
        hint: items.map(item => item.name).join(", ") });
    }
    const report = result => {
      const last = result.last;
      status.textContent = [result.state, `Combat harvests this session: ${result.harvests}`,
        ...(last ? [`Last batch: ${last.harvests} plots (${last.waitForCombatEnd ? "respawn gap" : "immediate, no gear swaps"})`, `Farming gear used: ${last.used.map(name => last.alreadyEquipped.includes(name) ? `${name} (already equipped)` : name).join(", ") || "None"}`,
          `Equipment, spells and prayers restored: ${last.gearRestored ? "Yes" : "NO"}`,
          `Combat timers unchanged: ${last.timersUnchanged ? "Yes" : "NO"}`,
          ...last.skipped] : [])].join("\n");
      if (result.state.startsWith("Paused:")) notifyPlayer(game.farming, result.state, "danger");
    };
    const semi = mod.api.SEMI;
    if (!semi?.equipmentSnapshot || !semi?.equipmentSnapshotRestore || !mod.manager.getLoadedModList().includes("SEMI Auto Farming")) {
      status.textContent = "Unavailable: SEMI Core and SEMI Auto Farming must be enabled and loaded first.";
      return;
    }
    const controller = new CombatFarming(ctx, game, semi, settings, { CombatManager, Farming, EnemyState }, report);
    ctx.api({ status: () => structuredClone(controller.status) });
    report(controller.status);
  });
}
