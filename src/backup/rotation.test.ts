import { describe, expect, it } from "vitest";
import { autoBackupName, dueForAutoBackup, namesToPrune } from "./rotation";

describe("자동 백업 보존", () => {
  it("자동 백업 꼴만 최신 14개를 남기고, 다른 파일은 건드리지 않는다", () => {
    const days = Array.from({ length: 16 }, (_, i) => `2026-04-${String(i + 1).padStart(2, "0")}`);
    const names = [...days.map(autoBackupName), "예산지기-2026-04-01.yesan.zip", "메모.txt"];
    expect(namesToPrune(names)).toEqual([autoBackupName("2026-04-02"), autoBackupName("2026-04-01")]);
    expect(namesToPrune(names.slice(0, 3))).toEqual([]);
  });
  it("하루에 한 번", () => {
    expect(dueForAutoBackup(null, "2026-04-01")).toBe(true);
    expect(dueForAutoBackup("2026-04-01", "2026-04-01")).toBe(false);
    expect(dueForAutoBackup("2026-03-31", "2026-04-01")).toBe(true);
  });
});
