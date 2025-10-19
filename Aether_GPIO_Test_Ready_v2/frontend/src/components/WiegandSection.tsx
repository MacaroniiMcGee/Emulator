import React, { useEffect, useState } from "react";
import { fetchWiegandConfig } from "../utils/wiegandConfig";

export default function WiegandSection() {
  const [cfg, setCfg] = useState<any>(null);
  const [format, setFormat] = useState<number>(26);
  const [facility, setFacility] = useState<number>(123);
  const [card, setCard] = useState<number>(12345);
  const [sendingDoor, setSendingDoor] = useState<number | null>(null);

  useEffect(() => {
    fetchWiegandConfig().then(setCfg).catch((e) => alert(e.message));
  }, []);

  async function send(door: number) {
    try {
      setSendingDoor(door);
      const body = { door, format, facility, card, parity: "std", pulseUs: 50, spaceUs: 1000 };
      const r = await fetch("/api/wiegand/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || j.stderr || "TX failed");
      alert(`Door ${door}: sent ${format}-bit`);
    } catch (e:any) {
      alert(`Door ${door} error: ${e.message}`);
    } finally {
      setSendingDoor(null);
    }
  }

  if (!cfg) return <div>Loading Wiegand…</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <label>Format:&nbsp;</label>
        <select value={format} onChange={(e) => setFormat(Number(e.target.value))}>
          <option value={26}>26</option>
          <option value={34}>34</option>
          <option value={35}>35</option>
          <option value={37}>37</option>
          <option value={48}>48</option>
        </select>
        &nbsp; <label>Facility:&nbsp;</label>
        <input type="number" value={facility} onChange={(e) => setFacility(Number(e.target.value))} style={{ width: 100 }} />
        &nbsp; <label>Card:&nbsp;</label>
        <input type="number" value={card} onChange={(e) => setCard(Number(e.target.value))} style={{ width: 120 }} />
      </div>

      {cfg.doors.map((d: any) => (
        <div key={d.door} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div><strong>{d.name}</strong> (Door {d.door})</div>
          <div>Chip: {cfg.chip}</div>
          <div>D0: <code>BCM {d.d0}</code> &nbsp; D1: <code>BCM {d.d1}</code> (locked)</div>
          <button disabled={sendingDoor === d.door} onClick={() => send(d.door)}>
            {sendingDoor === d.door ? "Sending…" : "Send"}
          </button>
        </div>
      ))}
    </div>
  );
}
