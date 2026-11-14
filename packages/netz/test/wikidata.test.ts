import { describe, expect, it } from "vite-plus/test";
import { sheetLines } from "../src/wikidata.ts";

describe("sheetLines", () => {
  const lines = new Map([
    ["1", [{ qid: "Q1", name: "Semmeringbahn" }]],
    [
      "2",
      [
        { qid: "Q1", name: "Semmeringbahn" },
        { qid: "Q2", name: "Südbahn", number: "105 01" },
      ],
    ],
    [
      "3",
      [
        { qid: "Q1", name: "Semmeringbahn" },
        { qid: "Q2", name: "Südbahn", number: "105 01" },
      ],
    ],
    [
      "4",
      [
        { qid: "Q2", name: "Südbahn", number: "105 01" },
        { qid: "Q3", name: "Junction" },
      ],
    ],
    ["5", [{ qid: "Q3", name: "Junction" }]],
  ]);
  const ids = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  it("keeps lines with ≥ 3 stations of the sheet, most stations first", () => {
    expect(sheetLines(ids, lines).map((l) => [l.name, l.number, l.stations])).toEqual([
      ["Semmeringbahn", undefined, 3],
      ["Südbahn", "105 01", 3],
    ]);
  });

  it("keeps 2-station lines on short sheets (≥ 30 % of the stations)", () => {
    expect(sheetLines(["4", "5", "6"], lines).map((l) => l.name)).toEqual(["Junction"]);
  });
});
