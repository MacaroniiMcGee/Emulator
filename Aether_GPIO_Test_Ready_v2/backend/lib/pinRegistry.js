const fs = require("fs");
const path = require("path");

class PinRegistry {
  constructor() {
    const p = path.resolve(__dirname, "../config/wiegand.json");
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    this.chip = cfg.chip || "gpiochip0";
    this.doors = cfg.doors || [];
    this.reserved = new Set();
    for (const d of this.doors) {
      this.reserved.add(Number(d.d0));
      this.reserved.add(Number(d.d1));
    }
  }
  isReserved(pin) { return this.reserved.has(Number(pin)); }
  getDoorByPin(pin) {
    const n = Number(pin);
    return this.doors.find((d) => d.d0 === n || d.d1 === n) || null;
  }
  getDoor(door) {
    return this.doors.find((d) => Number(d.door) === Number(door)) || null;
  }
  listReserved() { return Array.from(this.reserved.values()).sort((a,b)=>a-b); }
  config() { return { chip: this.chip, doors: this.doors }; }
}

module.exports = new PinRegistry();
