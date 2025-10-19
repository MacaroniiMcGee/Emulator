function parityEven(bits) { let c=0; for (const b of bits) if (b) c++; return (c%2)===0; }
function bitsFromHexOrBin(raw) {
  const out = []; if (!raw) return out;
  if (/^0x/i.test(raw)) {
    const hex = raw.slice(2);
    for (const ch of hex) {
      const v = parseInt(ch, 16);
      if (Number.isNaN(v)) throw new Error("bad hex");
      out.push((v & 8) ? 1 : 0, (v & 4) ? 1 : 0, (v & 2) ? 1 : 0, (v & 1) ? 1 : 0);
    }
  } else {
    for (const ch of raw.replace(/[\s_]/g, "")) {
      if (ch !== "0" && ch !== "1") throw new Error("bad bit char");
      out.push(ch === "1" ? 1 : 0);
    }
  }
  return out;
}
function composeData({ format=26, facility=0, card=0, facilityBits, cardBits }) {
  if (facilityBits == null || cardBits == null) {
    switch (format) {
      case 26: facilityBits=8;  cardBits=16; break;
      case 34: facilityBits=16; cardBits=16; break;
      case 37: facilityBits=18; cardBits=16; break;
      case 35: facilityBits=19; cardBits=16; break;
      case 48: facilityBits=16; cardBits=30; break;
      default: throw new Error("unsupported format");
    }
  }
  const data = [];
  for (let i=facilityBits-1; i>=0; --i) data.push(((facility>>i)&1) ? 1:0);
  for (let i=cardBits-1; i>=0; --i)     data.push(((card>>i)&1) ? 1:0);
  return { data, facilityBits, cardBits };
}
function applyParity(data, parity="std", frameBits=null) {
  if (parity === "none") {
    let frame = data.slice();
    if (frameBits && frameBits > frame.length) {
      const pad = Array(frameBits - frame.length).fill(0);
      frame = pad.concat(frame);
    }
    if (frameBits && frame.length !== frameBits) throw new Error("frameBits mismatch");
    return frame;
  }
  if (parity === "whole-even" || parity === "whole-odd") {
    const pe = parityEven(data);
    const pbit = (parity === "whole-even") ? (pe?1:0) : (pe?0:1);
    const frame = data.concat([pbit]);
    if (frameBits && frame.length !== frameBits) throw new Error("frameBits mismatch");
    return frame;
  }
  const left = Math.floor(data.length/2);
  const peL = parityEven(data.slice(0,left)) ? 1:0;
  const peR = parityEven(data.slice(left)) ? 0:1;
  const frame = [peL, ...data, peR];
  if (frameBits && frame.length !== frameBits) throw new Error("frameBits mismatch");
  return frame;
}
function formatBits(bits) { return bits.map(b => b ? "1":"0").join(""); }
module.exports = { bitsFromHexOrBin, composeData, applyParity, formatBits, parityEven };
