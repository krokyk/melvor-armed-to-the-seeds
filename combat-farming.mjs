// SEMI Auto Farming 1.1.2 priorities; missing expansion items are ignored.
export const GEAR_PRIORITY = {
  melvor: {
    "melvorD:Weapon": ["melvorItA:Bobs_Lost_Rake", "melvorAoD:Ancient_Scythe", "melvorD:Bobs_Rake"],
    "melvorD:Ring": ["melvorItA:Signet_Ring_of_Corrupted_Souls", "melvorD:Aorpheats_Signet_Ring", "melvorD:Ancient_Ring_Of_Skills"],
    "melvorD:Gloves": ["melvorItA:Bobs_Lost_Gloves", "melvorF:Bobs_Gloves"],
    "melvorD:Helmet": ["melvorF:Clown_Hat"],
    "melvorD:Cape": ["melvorTotH:Superior_Max_Skillcape", "melvorTotH:Superior_Farming_Skillcape", "melvorF:Cape_of_Completion", "melvorF:Max_Skillcape", "melvorD:Farming_Skillcape"],
    "melvorD:Consumable": ["melvorF:Seed_Pouch_II", "melvorF:Seed_Pouch"],
    "melvorD:Enhancement1": ["melvorF:Undead_Enhancement_Superior", "melvorF:Undead_Enhancement_3_Augmented", "melvorF:Undead_Enhancement_3"],
    "melvorD:Enhancement2": ["melvorF:Dragon_Enhancement_Superior", "melvorF:Dragon_Enhancement_2_Augmented", "melvorF:Dragon_Enhancement_2"],
  },
  abyssal: {
    "melvorD:Weapon": ["melvorItA:Bobs_Lost_Rake", "melvorItA:Abyssal_Scythe"],
    "melvorD:Ring": ["melvorItA:Signet_Ring_of_Corrupted_Souls", "melvorD:Aorpheats_Signet_Ring", "melvorItA:Lost_Ring_of_the_Abyss"],
    "melvorD:Gloves": ["melvorItA:Bobs_Lost_Gloves", "melvorF:Bobs_Gloves", "melvorItA:Golem_Gloves"],
    "melvorD:Helmet": ["melvorF:Clown_Hat"],
    "melvorD:Cape": ["melvorTotH:Superior_Max_Skillcape", "melvorTotH:Superior_Farming_Skillcape", "melvorF:Cape_of_Completion", "melvorF:Max_Skillcape", "melvorD:Farming_Skillcape"],
    "melvorD:Consumable": ["melvorF:Seed_Pouch_II", "melvorF:Seed_Pouch"],
    "melvorD:Amulet": ["melvorItA:Voidtaker_Amulet"],
    "melvorD:Gem": ["melvorItA:Abyssal_Skilling_Gem"],
    "melvorD:Enhancement1": ["melvorF:Undead_Enhancement_Superior"],
    "melvorD:Enhancement2": ["melvorF:Dragon_Enhancement_Superior", "melvorF:Dragon_Enhancement_2_Augmented", "melvorF:Dragon_Enhancement_2"],
    "melvorD:Enhancement3": ["melvorItA:Overlords_Enhancement_Superior"],
  },
};

function equipmentMatches(before, after) {
  return Object.keys(before).filter(key => !key.startsWith("_")).every(key => before[key].item === after[key]?.item)
    && ["attack", "curse", "aurora"].every(key => before._spells[key] === after._spells[key])
    && before._prayers.length === after._prayers.length
    && before._prayers.every(prayer => after._prayers.includes(prayer));
}

function timerState(timer) {
  return [timer.isActive, timer.ticksLeft, timer.maxTicks];
}

export class CombatFarming {
  constructor(ctx, game, semi, settings, types, report) {
    Object.assign(this, { game, semi, settings, types, report });
    this.status = { state: "Waiting for SEMI Auto Farming", cycles: 0, harvests: 0, last: null };
    this.running = false;
    this.failed = false;
    ctx.onCharacterLoaded(() => this.attachTicker());
    const controller = this;
    ctx.patch(types.CombatManager, "loadNextEnemy").after(function () {
      if (this === game.combat) controller.flush();
    });
    ctx.patch(types.Farming, "passiveTick").after(function () {
      if (this === game.farming) controller.attachTicker();
    });
    ctx.patch(types.Farming, "harvestPlotOnClick").replace(function (original, plot, ...args) {
      if (!controller.running || this !== game.farming) return original(plot, ...args);
      if (!controller.inSpawnGap()) throw new Error("The spawning gap ended before harvesting.");
      const realm = plot.plantedRecipe.namespace === "melvorItA" ? "abyssal" : "melvor";
      controller.swap(realm);
      controller.recordGear(realm);
      const result = original(plot, ...args);
      controller.batch.harvests++;
      return result;
    });
  }

  enabled() {
    return !this.failed && this.settings.get("enabled");
  }

  setStatus(state) {
    this.status.state = state;
    this.report(this.status);
  }

  attachTicker() {
    if (this.failed) return;
    const ticker = this.game._passiveTickers.find(ticker => ticker.id === "SEMI:AutoFarming");
    if (!ticker) {
      if (!this.ticker && this.status.state !== "Ready: waiting for SEMI to schedule farming") this.setStatus("Ready: waiting for SEMI to schedule farming");
      return;
    }
    if (this.ticker === ticker) return;
    if (typeof ticker.passiveTick !== "function" || !ticker.passiveTick.toString().includes("farmingPassiveTick")) {
      this.failed = true;
      this.setStatus("Unavailable: SEMI's farming scheduler differs from the supported version.");
      return;
    }
    this.ticker = ticker;
    this.originalTick = ticker.passiveTick.bind(ticker);
    ticker.passiveTick = () => {
      if (!this.enabled() || !this.game.combat.isActive) return this.originalTick();
      if (!this.inSpawnGap()) {
        if (this.status.state !== "Waiting for the current monster to die") this.setStatus("Waiting for the current monster to die");
        return;
      }
      this.run(1);
    };
    this.setStatus("Ready: waiting for crops and a spawning gap");
  }

  inSpawnGap() {
    const combat = this.game.combat;
    return combat.isActive && !combat.fightInProgress && !combat.paused && !this.game.isGolbinRaid
      && combat.enemy.state === this.types.EnemyState.Spawning && combat.spawnTimer.isActive;
  }

  flush() {
    if (!this.enabled() || !this.inSpawnGap() || !this.game._passiveTickers.includes(this.ticker)) return;
    // shortcut: SEMI 1.1.2's private debounce is at most 20 ticks; review this bound when SEMI changes its scheduler.
    this.run(20);
  }

  swap(realm) {
    if (this.batch.realm === realm) return;
    this.batch.realm = realm;
    const player = this.game.combat.player;
    if (player.checkIfCantEquip()) {
      this.batch.skipped.add("Equipment switching is locked in this area");
      return;
    }
    for (const [slotID, priorities] of Object.entries(GEAR_PRIORITY[realm])) {
      const slot = this.game.equipmentSlots.getObjectByID(slotID);
      if (!slot || !this.settings.get(`swap-${slotID}`)) continue;
      for (const itemID of priorities) {
        const item = this.game.items.getObjectByID(itemID);
        if (!item) continue;
        if (player.equipment.getSlotOfItem(item) !== undefined) break;
        if (this.game.bank.getQty(item) === 0 || !this.game.checkRequirements(item.equipRequirements, false)) continue;
        if (player.equipItem(item, player.selectedEquipmentSet, slot, 1000000)) {
          this.batch.swapped.add(item.name);
        } else {
          this.batch.skipped.add(`${item.name}: blocked by the game's equipment rules`);
        }
        break;
      }
    }
  }

  recordGear(realm) {
    for (const itemID of new Set(Object.values(GEAR_PRIORITY[realm]).flat())) {
      const item = this.game.items.getObjectByID(itemID);
      if (!item || this.game.combat.player.equipment.getSlotOfItem(item) === undefined) continue;
      this.batch.used.add(item.name);
      if (this.batch.equippedBefore.has(item)) this.batch.alreadyEquipped.add(item.name);
    }
  }

  run(limit) {
    if (this.running) return;
    const combat = this.game.combat;
    const player = combat.player;
    const before = this.semi.equipmentSnapshot();
    const originalHP = player.hitpoints;
    const originalMaxHP = player.stats.maxHitpoints;
    const originalSet = player.selectedEquipmentSet;
    const originalArea = combat.selectedArea;
    const originalMonster = combat.selectedMonster;
    const timers = [player.timers.act, player.timers.summon, combat.spawnTimer];
    const beforeTimers = timers.map(timerState);
    this.batch = { harvests: 0, used: new Set(), alreadyEquipped: new Set(), swapped: new Set(), skipped: new Set(),
      equippedBefore: new Set(Object.values(before).map(slot => slot.item)), realm: null };
    this.running = true;
    let failure;
    try {
      for (let tick = 0; tick < limit && this.game._passiveTickers.includes(this.ticker); tick++) {
        if (!this.inSpawnGap()) throw new Error("Farming was requested outside a spawning gap.");
        this.originalTick();
        if (this.batch.harvests > 0) break;
      }
    } catch (error) {
      failure = error;
    } finally {
      try {
        if (!equipmentMatches(before, this.semi.equipmentSnapshot())) this.semi.equipmentSnapshotRestore(before);
        if (this.batch.swapped.size > 0 && player.stats.maxHitpoints === originalMaxHP && player.hitpoints !== originalHP) {
          player.setHitpoints(originalHP);
        }
      } catch (error) {
        failure ??= error;
      }
      this.running = false;
    }
    const gearRestored = equipmentMatches(before, this.semi.equipmentSnapshot()) && player.selectedEquipmentSet === originalSet;
    const timersUnchanged = timers.every((timer, index) => timerState(timer).every((value, part) => value === beforeTimers[index][part]));
    const combatUnchanged = this.inSpawnGap() && combat.selectedArea === originalArea && combat.selectedMonster === originalMonster;
    if (!gearRestored || !timersUnchanged || !combatUnchanged) failure ??= new Error("Equipment restoration or combat-state verification failed.");
    if (this.batch.harvests > 0 || failure) {
      this.status.cycles++;
      this.status.harvests += this.batch.harvests;
      this.status.last = { harvests: this.batch.harvests, used: [...this.batch.used], alreadyEquipped: [...this.batch.alreadyEquipped],
        swapped: [...this.batch.swapped], skipped: [...this.batch.skipped], gearRestored, timersUnchanged, combatUnchanged };
    }
    if (failure) {
      this.failed = true;
      if (!gearRestored) combat.stop();
      console.error("[Kroky's Combat Farming]", failure);
      this.setStatus(`Paused: ${failure.message}${!gearRestored ? " Combat was stopped because gear could not be restored." : ""} Check your equipment and reload before trying again.`);
    } else if (this.batch.harvests > 0) {
      this.setStatus("Verified: harvested during a spawning gap and restored combat gear");
    }
  }
}
