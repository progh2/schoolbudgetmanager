import { describe, expect, it } from "vitest";
import { buildIndex } from "./balance";
import { dueAlerts, limitAlerts } from "./checks";
import { changeProjectStatus, saveExecution } from "./commands";
import { buildFixtureWorld } from "./fixtures";

// 픽스처: 교재·재료비 한도 2,000,000, 기한 2026-12-31, 집행 345,000 / 강사수당 한도 5,000,000, 기한 2027-02-15
describe("마감 점검", () => {
  const at = (today: string) => {
    const { w } = buildFixtureWorld();
    return dueAlerts(buildIndex(w.data), today).filter((a) => a.title.startsWith("교재"));
  };
  it("경계값: D-15 없음, D-14 info, D-8 info, D-7 warn, D-2 warn, D-1 danger, D-day danger, 지남 danger", () => {
    expect(at("2026-12-16")).toEqual([]);
    expect(at("2026-12-17")[0].severity).toBe("info");
    expect(at("2026-12-23")[0].severity).toBe("info");
    expect(at("2026-12-24")[0].severity).toBe("warn");
    expect(at("2026-12-29")[0].severity).toBe("warn");
    expect(at("2026-12-30")[0].severity).toBe("danger");
    expect(at("2026-12-31")[0].title).toContain("D-day");
    expect(at("2027-01-02")[0].title).toContain("D+2");
  });
  it("근거에 규칙·기한·기준일·금액이 들어간다", () => {
    expect(at("2026-12-24")[0].basis).toBe("사용기한 D-7 이내 · 기한 2026-12-31 · 기준일 2026-12-24 · 한도 2,000,000원 중 345,000원 집행");
  });
  it("다 쓴 항목과 마감한 사업은 경고하지 않는다", () => {
    const { w, ids } = buildFixtureWorld();
    w.run(saveExecution, { itemId: ids.i2, date: "2026-12-01", amount: 1_655_000, summary: "", vendor: "" });
    expect(dueAlerts(buildIndex(w.data), "2026-12-30").some((a) => a.itemId === ids.i2)).toBe(false);
    const f2 = buildFixtureWorld();
    f2.w.run(changeProjectStatus, { id: f2.ids.p, action: "close" });
    expect(dueAlerts(buildIndex(f2.w.data), "2026-12-30")).toEqual([]);
  });
});

describe("한도 점검", () => {
  it("90%·100%·초과를 가르고 초과액을 말한다 (업로드로 들어온 초과도 잡힌다)", () => {
    const { w, ids } = buildFixtureWorld();
    const level = () => limitAlerts(buildIndex(w.data)).find((a) => a.itemId === ids.i2);
    expect(level()).toBeUndefined();
    w.run(saveExecution, { itemId: ids.i2, date: "2026-05-01", amount: 1_455_000, summary: "", vendor: "" }); // 1,800,000 = 90%
    expect(level()?.severity).toBe("info");
    w.run(saveExecution, { itemId: ids.i2, date: "2026-05-02", amount: 200_000, summary: "", vendor: "" }); // 100%
    expect(level()?.severity).toBe("warn");
    w.run(saveExecution, { itemId: ids.i2, date: "2026-05-03", amount: 1, summary: "", vendor: "", overLimitReason: "x" });
    expect(level()).toMatchObject({ severity: "danger", title: "교재·재료비 한도 초과 1원" });
  });
});
