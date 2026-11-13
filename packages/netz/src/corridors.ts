/**
 * Bildfahrplan (time–distance) corridors.
 *
 * A corridor is defined by ordered anchor stations. Its station list is the
 * anchors plus every station served between two consecutive anchors by a trip
 * that stops at both. Positions (km) come from GTFS shape_dist_traveled: anchor
 * distances are median track distances, intermediate stations are placed by
 * their relative position between the two anchors (haversine fallback).
 */
import { haversineKm, type Feed, type Trip } from "./gtfs.ts";
import type { Corridor, CorridorStation, CorridorTrain } from "./types.ts";

export interface CorridorDef {
  id: string;
  name: string;
  /** ÖBB Fahrplanbild number(s), e.g. "101" or "100/101" (https://www.oebb.at/de/fahrplan/fahrplanbilder) */
  oebb?: string;
  /** anchor station DHIDs in corridor order (all are `major`) */
  anchors: string[];
  /** additional major stations (labelled prominently) */
  major?: string[];
  /**
   * anchors whose segment to the next anchor is a high-speed line without
   * stations (stations served between them belong to a parallel line)
   */
  nonstop?: string[];
  /** max. relative detour vs. the shortest anchor-to-anchor route (default 0.12) */
  detour?: number;
}

/** Corridors spanning several Fahrplanbilder (or none), defined by zugx. */
const ZUGX_CORRIDORS: CorridorDef[] = [
  {
    id: "westbahn",
    oebb: "100/101",
    name: "Westbahn Wien – Salzburg",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
      "Pat:43:5759", // Tullnerfeld
      "Pat:43:4848", // St. Pölten Hbf
      "Pat:43:7234", // Amstetten
      "Pat:43:7242", // St. Valentin
      "Pat:44:41164", // Linz Hbf
      "Pat:44:42107", // Wels Hbf
      "Pat:44:47200", // Attnang-Puchheim
      "Pat:45:50002", // Salzburg Hbf
    ],
    // Neue Westbahn: Tullnerfeld → St. Pölten has no stations (the Tullnerfelder Bahn via Herzogenburg is parallel)
    nonstop: ["Pat:49:1015", "Pat:43:5759"],
  },
  {
    id: "suedbahn",
    oebb: "510/500/501",
    name: "Südbahn Wien – Semmering – Graz",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
      "Pat:43:3101", // Baden
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:8761", // Gloggnitz
      "Pat:43:8769", // Semmering
      "Pat:46:7426", // Mürzzuschlag
      "Pat:46:2065", // Bruck/Mur
      "Pat:46:3040", // Graz Hbf
    ],
  },
  {
    id: "koralm",
    oebb: "501",
    name: "Koralmbahn Graz – Klagenfurt – Villach",
    anchors: [
      "Pat:46:3040", // Graz Hbf
      "Pat:46:30077", // Weststeiermark
      "Pat:42:3721", // St. Paul im Lavanttal
      "Pat:42:3831", // Kühnsdorf-Klopeiner See
      "Pat:42:3642", // Klagenfurt Hbf
      "Pat:42:3654", // Villach Hbf
    ],
    // Koralmbahn: St. Paul → Kühnsdorf is new line; Bleiburg lies on the old Jauntalbahn
    nonstop: ["Pat:42:3721"],
  },
  {
    id: "rheintal",
    name: "Rheintal Bludenz – Feldkirch – Bregenz",
    anchors: [
      "Pat:48:130", // Bludenz
      "Pat:48:817", // Feldkirch
      "Pat:48:585", // Dornbirn
      "Pat:48:452", // Bregenz
    ],
  },
  {
    id: "gisela",
    oebb: "200/201",
    name: "Giselabahn Salzburg – Zell am See – Wörgl",
    anchors: [
      "Pat:45:50002", // Salzburg Hbf
      "Pat:45:52099", // Bischofshofen
      "Pat:45:52197", // Schwarzach-St. Veit
      "Pat:45:54104", // Zell am See
      "Pat:45:54001", // Saalfelden
      "Pat:47:1160", // Kitzbühel
      "Pat:47:1170", // Wörgl Hbf
    ],
  },
  {
    id: "stammstrecke",
    oebb: "900",
    name: "S-Bahn-Stammstrecke Wien Floridsdorf – Meidling",
    anchors: [
      "Pat:49:334", // Wien Floridsdorf
      "Pat:49:1040", // Wien Praterstern
      "Pat:49:743", // Wien Mitte
      "Pat:49:1091", // Wien Rennweg
      "Pat:49:1346", // Wien Quartier Belvedere
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
    ],
  },
];

/** ÖBB Fahrplanbilder (https://www.oebb.at/de/fahrplan/fahrplanbilder), as far as they are trains in the ÖBB GTFS. */
export const OEBB_CORRIDORS: CorridorDef[] = [
  {
    id: "100",
    oebb: "100",
    name: "Flughafen Wien – Wien – St. Pölten – Linz",
    anchors: [
      "Pat:43:4708", // Flughafen Wien
      "Pat:49:1349", // Wien
      "Pat:43:4848", // St. Pölten
      "Pat:44:41164", // Linz
    ],
  },
  {
    id: "101",
    oebb: "101",
    name: "Linz – Wels – Attnang-Puchheim – Salzburg",
    anchors: [
      "Pat:44:41164", // Linz
      "Pat:44:42107", // Wels
      "Pat:44:47200", // Attnang-Puchheim
      "Pat:45:50002", // Salzburg
    ],
  },
  {
    id: "110",
    oebb: "110",
    name: "Wien Westbf – Neulengbach – St. Pölten",
    anchors: [
      "Pat:49:1468", // Wien Westbf
      "Pat:43:4337", // Neulengbach
      "Pat:43:4848", // St. Pölten
    ],
  },
  {
    id: "112",
    oebb: "112",
    name: "St. Pölten – Traismauer – Tullnerfeld – Tulln – Wien Franz-Josefs-Bahnhof",
    anchors: [
      "Pat:43:4848", // St. Pölten
      "Pat:43:5005", // Traismauer
      "Pat:43:5759", // Tullnerfeld
      "Pat:43:5034", // Tulln
      "Pat:49:345", // Wien Franz-Josefs-Bahnhof
    ],
  },
  {
    id: "113",
    oebb: "113",
    name: "St. Pölten Hbf – Traisen – Hainfeld / Lilienfeld – Schrambach",
    anchors: [
      "Pat:43:4848", // St. Pölten Hbf
      "Pat:43:7381", // Traisen
      "Pat:43:7403", // Hainfeld
      "Pat:43:7386", // Schrambach
    ],
  },
  {
    id: "120",
    oebb: "120",
    name: "Pöchlarn – Scheibbs",
    anchors: [
      "Pat:43:7227", // Pöchlarn
      "Pat:43:7450", // Scheibbs
    ],
  },
  {
    id: "130",
    oebb: "130",
    name: "Amstetten – Waidhofen a.d.Ybbs – Kleinreifling – Selzthal",
    anchors: [
      "Pat:43:7234", // Amstetten
      "Pat:43:7900", // Waidhofen/Ybbs
      "Pat:44:46950", // Kleinreifling
      "Pat:46:6938", // Selzthal
    ],
  },
  {
    id: "131",
    oebb: "131",
    name: "St. Valentin – Steyr – Kleinreifling – Selzthal",
    anchors: [
      "Pat:43:7242", // St. Valentin
      "Pat:44:43005", // Steyr
      "Pat:44:46950", // Kleinreifling
      "Pat:46:6938", // Selzthal
    ],
  },
  {
    id: "133",
    oebb: "133",
    name: "St. Valentin – Perg – St. Nikola-Struden",
    anchors: [
      "Pat:43:7242", // St. Valentin
      "Pat:44:44500", // Perg
      "Pat:44:44900", // St. Nikola-Struden
    ],
  },
  {
    id: "140",
    oebb: "140",
    name: "Linz Hbf – Kirchdorf a.d. Krems – Selzthal",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:43500", // Kirchdorf/Krems
      "Pat:46:6938", // Selzthal
    ],
  },
  {
    id: "141",
    oebb: "141",
    name: "Linz Hbf – Pregarten – Freistadt – Summerau",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:45090", // Pregarten
      "Pat:44:45000", // Freistadt
      "Pat:44:45260", // Summerau
    ],
  },
  {
    id: "142",
    oebb: "142",
    name: "Linz Urfahr – Rottenegg – Aigen-Schlägl",
    anchors: [
      "Pat:44:41272", // Linz Urfahr
      "Pat:44:44040", // Rottenegg
      "Pat:44:49844", // Aigen-Schlägl
    ],
  },
  {
    id: "150",
    oebb: "150",
    name: "Linz Hbf – Wels – Neumarkt-Kallham – Passau",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:42107", // Wels
      "Pat:44:40156", // Neumarkt-Kallham
      "Pde:09262:156", // Passau
    ],
  },
  {
    id: "151",
    oebb: "151",
    name: "Linz Hbf – Wels – Ried im Innkreis – Braunau – Simbach",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:42107", // Wels
      "Pat:44:48000", // Ried im Innkreis
      "Pat:44:49000", // Braunau
      "Pde:09277:80490", // Simbach
    ],
  },
  {
    id: "153",
    oebb: "153",
    name: "Wels Hbf – Sattledt – Grünau im Almtal",
    anchors: [
      "Pat:44:42107", // Wels Hbf
      "Pat:44:42431", // Sattledt
      "Pat:44:46340", // Grünau im Almtal
    ],
  },
  {
    id: "170",
    oebb: "170",
    name: "Attnang-Puchheim – Gmunden – Bad Ischl – Hallstatt – Bad Aussee – Stainach-Irdning – Selzthal",
    anchors: [
      "Pat:44:47200", // Attnang-Puchheim
      "Pat:44:46010", // Gmunden
      "Pat:44:46500", // Bad Ischl
      "Pat:44:46631", // Hallstatt
      "Pat:46:7063", // Bad Aussee
      "Pat:46:6892", // Stainach-Irdning
      "Pat:46:6938", // Selzthal
    ],
  },
  {
    id: "171",
    oebb: "171",
    name: "Attnang-Puchheim – Ried im Innkreis – Schärding",
    anchors: [
      "Pat:44:47200", // Attnang-Puchheim
      "Pat:44:48000", // Ried im Innkreis
      "Pat:44:48500", // Schärding
    ],
  },
  {
    id: "172",
    oebb: "172",
    name: "Vöcklabruck – Kammer-Schörfling",
    anchors: [
      "Pat:44:47000", // Vöcklabruck
      "Pat:44:47301", // Kammer-Schörfling
    ],
  },
  {
    id: "190",
    oebb: "190",
    name: "Freilassing – Salzburg – Neumarkt am Wallersee – Straßwalchen/Mattighofen – Braunau am Inn",
    anchors: [
      "Pde:09172:42293", // Freilassing
      "Pat:45:50002", // Salzburg
      "Pat:45:50290", // Straßwalchen
      "Pat:44:49650", // Mattighofen
      "Pat:44:49000", // Braunau
    ],
  },
  {
    id: "200",
    oebb: "200",
    name: "Freilassing – Salzburg – Schwarzach-St. Veit – Saalfelden",
    anchors: [
      "Pde:09172:42293", // Freilassing
      "Pat:45:50002", // Salzburg
      "Pat:45:52197", // Schwarzach-St. Veit
      "Pat:45:54001", // Saalfelden
    ],
  },
  {
    id: "201",
    oebb: "201",
    name: "Saalfelden – Wörgl – Innsbruck Hbf",
    anchors: [
      "Pat:45:54001", // Saalfelden
      "Pat:47:1170", // Wörgl
      "Pat:47:1187", // Innsbruck Hbf
    ],
  },
  {
    id: "220",
    oebb: "220",
    name: "Salzburg – Bischofshofen – Mallnitz-Obervellach – Spittal-Millstättersee – Villach – Klagenfurt – Graz",
    anchors: [
      "Pat:45:50002", // Salzburg
      "Pat:45:52099", // Bischofshofen
      "Pat:42:2121", // Mallnitz-Obervellach
      "Pat:42:2128", // Spittal-Millstätter See
      "Pat:42:3654", // Villach
      "Pat:42:3642", // Klagenfurt
      "Pat:46:3040", // Graz
    ],
  },
  {
    id: "221",
    oebb: "221",
    name: "Villach – Rosenbach – Jesenice",
    anchors: [
      "Pat:42:3654", // Villach
      "Pat:42:2143", // Rosenbach
      "Psi:63:5948", // Jesenice
    ],
  },
  {
    id: "223",
    oebb: "223",
    name: "Spittal-Millstättersee – Lienz – Sillian – San Candido/ Innichen",
    anchors: [
      "Pat:42:2128", // Spittal-Millstätter See
      "Pat:47:3873", // Lienz
      "Pat:47:3879", // Sillian
      "Pit:22021:1980", // San Candido
    ],
  },
  {
    id: "250",
    oebb: "250",
    name: "Bischofshofen – Schladming – Liezen – Selzthal – Leoben – Bruck/Mur",
    anchors: [
      "Pat:45:52099", // Bischofshofen
      "Pat:46:7208", // Schladming
      "Pat:46:7437", // Liezen
      "Pat:46:6938", // Selzthal
      "Pat:46:6344", // Leoben
      "Pat:46:2065", // Bruck
    ],
  },
  {
    id: "300",
    oebb: "300",
    name: "Salzburg Hbf – Kufstein – Innsbruck Hbf – Brennero/ Brenner",
    anchors: [
      "Pat:45:50002", // Salzburg Hbf
      "Pat:47:2184", // Kufstein
      "Pat:47:1187", // Innsbruck Hbf
      "Pit:22021:1389", // Brennero
    ],
  },
  {
    id: "400",
    oebb: "400",
    name: "Innsbruck – Ötztal – Landeck-Zams – Bludenz",
    anchors: [
      "Pat:47:1187", // Innsbruck
      "Pat:47:1204", // Ötztal
      "Pat:47:1212", // Landeck-Zams
      "Pat:48:130", // Bludenz
    ],
  },
  {
    id: "420",
    oebb: "420",
    name: "Bludenz – Schruns",
    anchors: [
      "Pat:48:130", // Bludenz
      "Pat:48:134", // Schruns
    ],
  },
  {
    id: "500",
    oebb: "500",
    name: "Wiener Neustadt Hbf – Semmering – Mürzzuschlag",
    anchors: [
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:8769", // Semmering
      "Pat:46:7426", // Mürzzuschlag
    ],
  },
  {
    id: "501",
    oebb: "501",
    name: "Flughafen Wien – Mürzzuschlag – Bruck/Mur – Graz – Klagenfurt – Villach",
    anchors: [
      "Pat:43:4708", // Flughafen Wien
      "Pat:46:7426", // Mürzzuschlag
      "Pat:46:2065", // Bruck
      "Pat:46:3040", // Graz
      "Pat:42:3642", // Klagenfurt
      "Pat:42:3654", // Villach
    ],
  },
  {
    id: "502",
    oebb: "502",
    name: "Graz – Leibnitz – Spielfeld-Straß – Bad Radkersburg",
    anchors: [
      "Pat:46:3040", // Graz
      "Pat:46:1827", // Leibnitz
      "Pat:46:1839", // Spielfeld-Straß
      "Pat:46:1891", // Bad Radkersburg
    ],
  },
  {
    id: "510",
    oebb: "510",
    name: "Wien – Baden – Wiener Neustadt – Payerbach-Reichenau",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:3101", // Baden
      "Pat:43:5210", // Wiener Neustadt
      "Pat:43:8763", // Payerbach-Reichenau
    ],
  },
  {
    id: "511",
    oebb: "511",
    name: "Wien – Pottendorf-Landegg – Ebenfurth – Wiener Neustadt",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:4562", // Pottendorf-Landegg
      "Pat:43:3318", // Ebenfurth
      "Pat:43:5210", // Wiener Neustadt
    ],
  },
  {
    id: "512",
    oebb: "512",
    name: "Wien – Ebenfurth – Sopron – Deutschkreutz",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:3318", // Ebenfurth
      "Phu:08518:27001898", // Sopron
      "Pat:41:3294", // Deutschkreutz
    ],
  },
  {
    id: "513",
    oebb: "513",
    name: "Leobersdorf – Berndorf – Weissenbach-Neuhaus",
    anchors: [
      "Pat:43:4084", // Leobersdorf
      "Pat:43:3160", // Berndorf
      "Pat:43:5195", // Weissenbach-Neuhaus
    ],
  },
  {
    id: "520",
    oebb: "520",
    name: "Wiener Neustadt Hbf – Aspang – Friedberg – Hartberg – Fehring",
    anchors: [
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:7041", // Aspang
      "Pat:46:7543", // Friedberg
      "Pat:46:2022", // Hartberg
      "Pat:46:1960", // Fehring
    ],
  },
  {
    id: "521",
    oebb: "521",
    name: "Wiener Neustadt Hbf – Waldegg – Gutenstein",
    anchors: [
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:7099", // Waldegg
      "Pat:43:7105", // Gutenstein
    ],
  },
  {
    id: "522",
    oebb: "522",
    name: "Wiener Neustadt Hbf – Grünbach – Puchberg am Schneeberg",
    anchors: [
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:7116", // Grünbach
      "Pat:43:7120", // Puchberg am Schneeberg
    ],
  },
  {
    id: "530",
    oebb: "530",
    name: "Graz – Feldbach – Fehring – Szentgotthárd",
    anchors: [
      "Pat:46:3040", // Graz
      "Pat:46:1923", // Feldbach
      "Pat:46:1960", // Fehring
      "Phu:31583:27000652", // Szentgotthárd
    ],
  },
  {
    id: "600",
    oebb: "600",
    name: "Graz – Bruck/Mur – Unzmarkt – Klagenfurt",
    anchors: [
      "Pat:46:3040", // Graz
      "Pat:46:2065", // Bruck
      "Pat:46:5511", // Unzmarkt
      "Pat:42:3642", // Klagenfurt
    ],
  },
  {
    id: "601",
    oebb: "601",
    name: "Friesach – St. Veit a. d. Glan – Klagenfurt Hbf",
    anchors: [
      "Pat:42:3625", // Friesach
      "Pat:42:3633", // St. Veit a. d. Glan
      "Pat:42:3642", // Klagenfurt Hbf
    ],
  },
  {
    id: "620",
    oebb: "620",
    name: "Pusarnitz – Spittal-Millstättersee – Villach – Klagenfurt – Bleiburg – Wolfsberg",
    anchors: [
      "Pat:42:2127", // Pusarnitz
      "Pat:42:2128", // Spittal-Millstätter See
      "Pat:42:3654", // Villach
      "Pat:42:3642", // Klagenfurt
      "Pat:42:3825", // Bleiburg
      "Pat:42:3715", // Wolfsberg
    ],
  },
  {
    id: "650",
    oebb: "650",
    name: "St. Veit a. d. Glan – Feldkirchen in Kärnten – Villach",
    anchors: [
      "Pat:42:3633", // St. Veit a. d. Glan
      "Pat:42:3807", // Feldkirchen in Kärnten
      "Pat:42:3654", // Villach
    ],
  },
  {
    id: "660",
    oebb: "660",
    name: "Klagenfurt – Weizelsdorf",
    anchors: [
      "Pat:42:3642", // Klagenfurt
      "Pat:42:3844", // Weizelsdorf
    ],
  },
  {
    id: "670",
    oebb: "670",
    name: "Villach – Arnoldstein – Hermagor/ Tarvisio",
    anchors: [
      "Pat:42:3654", // Villach
      "Pat:42:3662", // Arnoldstein
      "Pat:42:3907", // Hermagor
    ],
  },
  {
    id: "700",
    oebb: "700",
    name: "Wien Hbf – Bruck a.d. Leitha – Pamhagen/ Eisenstadt/ Hegyeshalom",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:43:3209", // Bruck/Leitha
      "Phu:17905:27000493", // Hegyeshalom
    ],
  },
  {
    id: "701",
    oebb: "701",
    name: "Wien Hbf – Bruck a.d. Leitha – Kittsee – Bratislava hl.st.",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:43:3209", // Bruck/Leitha
      "Pat:41:5972", // Kittsee
      "Psk:56:2", // Bratislava-Petržalka
    ],
  },
  {
    id: "720",
    oebb: "720",
    name: "Wien Hbf – Kledering – Traiskirchen Aspangbahn – Wiener Neustadt",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:43:3895", // Kledering
      "Pat:43:4995", // Traiskirchen Aspangbahn
      "Pat:43:5210", // Wiener Neustadt
    ],
  },
  {
    id: "730",
    oebb: "730",
    name: "Wien Hbf – Neusiedl am See – Eisenstadt – Wulkaprodersdorf",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:41:4351", // Neusiedl am See
      "Pat:41:3351", // Eisenstadt
      "Pat:41:5286", // Wulkaprodersdorf
    ],
  },
  {
    id: "731",
    oebb: "731",
    name: "Wien Hbf – Neusiedl am See – Pamhagen – Fertöszentmiklós",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:41:4351", // Neusiedl am See
      "Pat:41:4464", // Pamhagen
      "Phu:15343:27001902", // Fertőszentmiklós
    ],
  },
  {
    id: "800",
    oebb: "800",
    name: "Wien Franz-Josefs-Bahnhof – Tulln – Sigmundsherberg – Gmünd NÖ – Ceské Velenice",
    anchors: [
      "Pat:49:345", // Wien Franz-Josefs-Bahnhof
      "Pat:43:5034", // Tulln
      "Pat:43:4789", // Sigmundsherberg
      "Pat:43:7169", // Gmünd NÖ
      "Pcz:0:5473632", // Ceské Velenice
    ],
  },
  {
    id: "810",
    oebb: "810",
    name: "Wien Franz-Josefs-Bahnhof – Tulln – Krems a.d. Donau",
    anchors: [
      "Pat:49:345", // Wien Franz-Josefs-Bahnhof
      "Pat:43:5034", // Tulln
      "Pat:43:3993", // Krems a.d. Donau
    ],
  },
  {
    id: "820",
    oebb: "820",
    name: "St. Pölten – Herzogenburg – Krems a.d. Donau – Hadersdorf am Kamp – Horn – Sigmundsherberg",
    anchors: [
      "Pat:43:4848", // St. Pölten
      "Pat:43:8003", // Herzogenburg
      "Pat:43:3993", // Krems
      "Pat:43:3660", // Hadersdorf/Kamp
      "Pat:43:3784", // Horn
      "Pat:43:4789", // Sigmundsherberg
    ],
  },
  {
    id: "900",
    oebb: "900",
    name: "Wien S-Bahn (Gesamtverkehr Mödling – Meidling – Floridsdorf – Strebersdorf)",
    anchors: [
      "Pat:43:4239", // Mödling
      "Pat:49:1015", // Wien Meidling
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1040", // Wien Praterstern
      "Pat:49:334", // Wien Floridsdorf
      "Pat:49:1333", // Wien Strebersdorf
    ],
  },
  {
    id: "901",
    oebb: "901",
    name: "Wien – Gänserndorf – Hohenau – Břeclav/ Marchegg",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:3622", // Gänserndorf
      "Pat:43:3778", // Hohenau
      "Pcz:0:5433425", // Břeclav
    ],
  },
  {
    id: "902",
    oebb: "902",
    name: "Wien – Wolkersdorf – Mistelbach – Laa a.d. Thaya",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:5274", // Wolkersdorf
      "Pat:43:4202", // Mistelbach
      "Pat:43:4015", // Laa/Thaya
    ],
  },
  {
    id: "903",
    oebb: "903",
    name: "Wien – Stockerau – Tullnerfeld/ Hollabrunn – Retz – Znojmo",
    anchors: [
      "Pat:49:1349", // Wien
      "Pat:43:4884", // Stockerau
      "Pat:43:3780", // Hollabrunn
      "Pat:43:4656", // Retz
    ],
  },
  {
    id: "907",
    oebb: "907",
    name: "Wien Floridsdorf/ Wien Meidling – Flughafen Wien – Wolfsthal",
    anchors: [
      "Pat:49:334", // Wien Floridsdorf
      "Pat:43:4708", // Flughafen Wien
      "Pat:43:5271", // Wolfsthal
    ],
  },
  {
    id: "910",
    oebb: "910",
    name: "Wien Hütteldorf – Wien Hbf – Wien Hirschstetten – Marchegg – Bratislava",
    anchors: [
      "Pat:49:560", // Wien Hütteldorf
      "Pat:49:1349", // Wien Hbf
      "Pat:49:532", // Wien Hirschstetten
      "Pat:43:4132", // Marchegg
      "Psk:56:1", // Bratislava
    ],
  },
  {
    id: "917",
    oebb: "917",
    name: "Wien Mitte CAT – Flughafen Wien CAT",
    anchors: [
      "Pat:49:743", // Wien Mitte
      "Pat:43:4708", // Flughafen Wien
    ],
  },
  {
    id: "945",
    oebb: "945",
    name: "Wien Handelskai – Wien Heiligenstadt – Wien Hütteldorf",
    anchors: [
      "Pat:49:1705", // Wien Handelskai
      "Pat:49:491", // Wien Heiligenstadt
      "Pat:49:560", // Wien Hütteldorf
    ],
  },
];

export const CORRIDORS: CorridorDef[] = [...OEBB_CORRIDORS, ...ZUGX_CORRIDORS];

/** ids of zugx corridors replaced by ÖBB Fahrplanbilder (old links keep working) */
export const CORRIDOR_ALIASES: Record<string, string> = {
  brenner: "300",
  arlberg: "400",
  tauern: "220",
  pyhrn: "140",
  ennstal: "250",
  nordbahn: "901",
  ostbahn: "700",
  "westbahn-alt": "110",
  summerau: "141",
  fjb: "800",
  kamptal: "820",
  innviertel: "150",
  aspang: "520",
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Ordered corridor stations with km. */
export function corridorStations(feed: Feed, def: CorridorDef, names?: Map<string, string>) {
  const anchorIdx = new Map(def.anchors.map((a, i) => [a, i]));
  // station → list of relative positions (0..1) within anchor segment k
  const between = new Map<string, { k: number; f: number[] }>();

  // pass 1: every trip hop between two consecutive anchors
  interface Hop {
    trip: Trip;
    i: number;
    j: number;
    k: number;
    forward: boolean;
    /** track metres between the anchors (NaN if unknown) */
    span: number;
  }
  const hops: Hop[] = [];
  for (const trip of feed.trips) {
    const idx = trip.stops.map((s) => anchorIdx.get(s.st));
    for (let i = 0; i < trip.stops.length; i++) {
      const ai = idx[i];
      if (ai === undefined) continue;
      // next anchor stop of this trip
      let j = i + 1;
      while (j < trip.stops.length && idx[j] === undefined) j++;
      const aj = idx[j];
      if (aj === undefined || Math.abs(aj - ai) !== 1) continue;
      const span = trip.stops[j]!.dist - trip.stops[i]!.dist;
      hops.push({ trip, i, j, k: Math.min(ai, aj), forward: aj > ai, span });
    }
  }
  // the corridor follows the shortest route between anchors: hops more than
  // `detour` longer than the shortest one took a parallel line
  const segDist: number[][] = def.anchors.slice(1).map(() => []);
  const minSpan = def.anchors.slice(1).map((_, k) => {
    const spans = hops.filter((h) => h.k === k && h.span > 0).map((h) => h.span);
    return spans.length ? Math.min(...spans) : NaN;
  });
  const detour = def.detour ?? 0.12;
  const nonstop = new Set((def.nonstop ?? []).map((k) => def.anchors.indexOf(k)));

  for (const { trip, i, j, k, forward, span } of hops) {
    if (span > 0 && span > minSpan[k]! * (1 + detour)) continue;
    if (span > 0) segDist[k]!.push(span / 1000);
    if (nonstop.has(k)) continue;
    const da = trip.stops[i]!.dist;
    for (let m = i + 1; m < j; m++) {
      const s = trip.stops[m]!;
      let f: number;
      if (Number.isFinite(span) && span > 0) f = (s.dist - da) / span;
      else {
        const A = feed.stations.get(trip.stops[i]!.st);
        const B = feed.stations.get(trip.stops[j]!.st);
        const S = feed.stations.get(s.st);
        if (!A || !B || !S) continue;
        const dA = haversineKm(A, S);
        f = dA / (dA + haversineKm(S, B) || 1);
      }
      if (!forward) f = 1 - f;
      let e = between.get(s.st);
      if (!e) between.set(s.st, (e = { k, f: [] }));
      if (e.k === k) e.f.push(Math.min(1, Math.max(0, f)));
    }
  }

  const anchorKm = [0];
  def.anchors.slice(1).forEach((a, k) => {
    let d = segDist[k]!.length ? median(segDist[k]!) : NaN;
    if (!Number.isFinite(d)) {
      const A = feed.stations.get(def.anchors[k]!);
      const B = feed.stations.get(a);
      d = A && B ? haversineKm(A, B) * 1.15 : 0;
    }
    anchorKm.push(anchorKm[k]! + d);
  });

  const nameOf = (id: string) => names?.get(id) ?? feed.stations.get(id)?.name ?? id;
  const major = new Set([...def.anchors, ...(def.major ?? [])]);
  const out: CorridorStation[] = def.anchors.map((id, i) => ({
    id,
    name: nameOf(id),
    km: anchorKm[i]!,
    major: true,
  }));
  for (const [id, { k, f }] of between) {
    if (anchorIdx.has(id)) continue;
    const a = anchorKm[k]!;
    const b = anchorKm[k + 1]!;
    out.push({ id, name: nameOf(id), km: a + median(f) * (b - a), major: major.has(id) });
  }
  out.sort((x, y) => x.km - y.km);
  for (const s of out) s.km = Math.round(s.km * 10) / 10;
  return out;
}

/**
 * Corridor runs of one trip: maximal sequences of consecutive trip stops that
 * are corridor stations in monotonic order. A non-corridor stop in between
 * (train left the corridor) or a direction change splits the run.
 */
export type CorridorRun = Omit<CorridorTrain, "days">;

export function corridorRuns(trip: Trip, stationIdx: Map<string, number>): CorridorRun[] {
  const out: CorridorRun[] = [];
  let cur: [number, number | null, number | null][] = [];
  let dir: 1 | -1 | 0 = 0;
  const flush = () => {
    if (cur.length >= 2 && dir !== 0) {
      // start / end of the run: no arrival / departure shown
      cur[0]![1] = null;
      cur[cur.length - 1]![2] = null;
      out.push({ cat: trip.cat, nr: trip.nr, dir, headsign: trip.headsign, pts: cur });
    }
    cur = [];
    dir = 0;
  };
  trip.stops.forEach((s, i) => {
    const k = stationIdx.get(s.st);
    if (k === undefined) {
      flush();
      return;
    }
    const pt: [number, number | null, number | null] = [k, s.arr, s.dep];
    if (i === 0) pt[1] = null;
    if (i === trip.stops.length - 1) pt[2] = null;
    const last = cur[cur.length - 1];
    if (last) {
      const d = k > last[0] ? 1 : k < last[0] ? -1 : 0;
      if (d === 0 || (dir !== 0 && d !== dir)) {
        flush();
      } else {
        dir = d;
      }
    }
    cur.push(pt);
  });
  flush();
  return out;
}

/** Base64 bitset, bit i = day i, MSB first. */
export function encodeDays(days: Iterable<number>, n: number): string {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (const i of days) if (i >= 0 && i < n) bytes[i >> 3]! |= 0x80 >> (i & 7);
  return Buffer.from(bytes).toString("base64");
}

export interface YearTrips {
  /** all rail trips of the feed */
  feed: Feed;
  /** running days per service_id (day indexes from `begin`) */
  days: Map<string, Set<number>>;
  begin: string;
  end: string;
}

/**
 * Builds a corridor: stations from the reference-day feed, trains from the whole
 * timetable year; runs with identical times are merged and carry their running days.
 */
export function buildCorridor(
  feed: Feed,
  def: CorridorDef,
  day: string,
  source: string,
  names?: Map<string, string>,
  year?: YearTrips,
): Corridor {
  const stations = corridorStations(feed, def, names);
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const begin = year?.begin ?? day;
  const end = year?.end ?? day;
  const n = Temporal.PlainDate.from(begin).until(end).days + 1;
  const merged = new Map<string, { t: CorridorRun; days: Set<number> }>();
  for (const trip of (year ?? { feed }).feed.trips) {
    const tripDays = year ? year.days.get(trip.service) : new Set([0]);
    if (!tripDays?.size) continue;
    for (const t of corridorRuns(trip, idx)) {
      const key = JSON.stringify(t);
      let m = merged.get(key);
      if (!m) merged.set(key, (m = { t, days: new Set() }));
      for (const d of tripDays) m.days.add(d);
    }
  }
  const trains: CorridorTrain[] = [...merged.values()].map(({ t, days }) => ({
    ...t,
    days: encodeDays(days, n),
  }));
  const t0 = (t: CorridorTrain) => t.pts[0]![2] ?? t.pts[0]![1] ?? 0;
  trains.sort((a, b) => t0(a) - t0(b) || a.nr.localeCompare(b.nr));
  return { id: def.id, name: def.name, day, begin, end, source, stations, trains };
}

/** Compact JSON: one station / train per line. */
export function corridorJson(c: Corridor): string {
  const head = JSON.stringify({
    id: c.id,
    name: c.name,
    day: c.day,
    begin: c.begin,
    end: c.end,
    source: c.source,
  });
  const st = c.stations.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  const tr = c.trains.map((t) => `    ${JSON.stringify(t)}`).join(",\n");
  return `${head.slice(0, -1)},\n  "stations": [\n${st}\n  ],\n  "trains": [\n${tr}\n  ]\n}\n`;
}
