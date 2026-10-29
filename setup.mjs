export async function setup(ctx) {
  const { CombatFarming, GEAR_PRIORITY } = await ctx.loadModule("combat-farming.mjs");
  ctx.onCharacterSelectionLoaded(() => {
    const settings = ctx.settings.section("Combat Farming");
    const slotLabels = [];
    const slotDescription = document.createElement("span");
    slotDescription.textContent = "Combat-only equipment swaps";
    const refreshSlots = (waiting = settings.get("waitForCombatEnd")) => {
      const active = waiting === true;
      slotDescription.parentElement.style.opacity = active ? "" : "0.5";
      for (const text of slotLabels) {
        const label = text.closest("label");
        const input = label.control ?? label.parentElement.querySelector("input");
        input.disabled = !active;
        label.parentElement.style.opacity = active ? "" : "0.5";
      }
    };
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.whiteSpace = "pre-line";
    let legacyEnabled;
    settings.add([
      // Keep the obsolete key on the readout to restore old preferences without a hidden control.
      { type: "custom", name: "enabled", render: () => status,
        get: () => legacyEnabled, set: (_root, value) => { legacyEnabled = value; } },
      // Undefined distinguishes new installs from saves made before the wait option existed.
      { type: "switch", name: "waitForCombatEnd", label: "Wait until current fight ends",
        hint: "ON: Wait until the current monster is defeated, swap to your chosen farming gear, harvest and replant, then restore combat gear before the next fight. Long fights delay harvesting and can reduce farming output. OFF: Let SEMI harvest as soon as crops are ready with your current equipment and no gear swaps during combat. This avoids the wait but may miss farming-equipment bonuses. Slot switches below are disabled while waiting is off; their selections are kept.",
        onChange: value => { refreshSlots(value); } },
      { type: "label", name: "slot-description", label: slotDescription,
        hint: "Used when Wait until current fight ends is on. SEMI's own switches still control farming outside combat." },
    ]);
    for (const slotID of new Set([...Object.keys(GEAR_PRIORITY.melvor), ...Object.keys(GEAR_PRIORITY.abyssal)])) {
      const slot = game.equipmentSlots.getObjectByID(slotID);
      if (!slot) continue;
      const items = [...new Set([...(GEAR_PRIORITY.melvor[slotID] ?? []), ...(GEAR_PRIORITY.abyssal[slotID] ?? [])])]
        .map(id => game.items.getObjectByID(id)).filter(Boolean);
      const label = document.createElement("span");
      label.textContent = `Swap ${slot.emptyName}`;
      settings.add({ type: "switch", name: `swap-${slotID}`, label, default: false,
        hint: items.map(item => item.name).join(", ") });
      slotLabels.push(label);
    }
    refreshSlots();
    ctx.onCharacterLoaded(() => {
      if (legacyEnabled === false) settings.set("waitForCombatEnd", false);
      else if (settings.get("waitForCombatEnd") === undefined) settings.set("waitForCombatEnd", legacyEnabled === true);
      settings.set("enabled", undefined);
      refreshSlots();
    });
    let notifiedFailure, latestStatus, statusVisible = false;
    const renderStatus = () => {
      if (!statusVisible || loadingOfflineProgress || !latestStatus) return;
      const result = latestStatus;
      const last = result.last;
      status.textContent = [result.state,
        `Harvested during respawns this session: ${result.respawnHarvests}`,
        `All automatic harvests this session: ${result.harvests}`,
        `Time farming was deferred this session: ${(result.deferredTicks * TICK_INTERVAL / 1000).toFixed(1)} seconds`,
        ...(last ? [`Last combat batch: ${last.harvests} plots (${last.waitForCombatEnd ? "respawn gap" : "immediate, no gear swaps"})`, `Farming gear used: ${last.used.map(name => last.alreadyEquipped.includes(name) ? `${name} (already equipped)` : name).join(", ") || "None"}`,
          `Equipment, spells and prayers restored: ${last.gearRestored ? "Yes" : "NO"}`,
          `Combat timers unchanged: ${last.timersUnchanged ? "Yes" : "NO"}`,
          ...last.skipped] : [])].join("\n");
    };
    const report = result => {
      latestStatus = result;
      renderStatus();
      if (result.state.startsWith("Paused:") && result.state !== notifiedFailure) {
        notifiedFailure = result.state;
        notifyPlayer(game.farming, result.state, "danger");
      }
    };
    new IntersectionObserver(([{ isIntersecting }]) => {
      statusVisible = isIntersecting;
      renderStatus();
    }).observe(status);
    game.on("offlineLoopExited", renderStatus);
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
