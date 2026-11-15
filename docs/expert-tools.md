# Expert tools for railway timetable and infrastructure planning (DACH)

What planners at infrastructure managers, operators, transport authorities and consultancies use — for orientation (conventions, data formats, where zugx could connect). Researched 2026-11-15; ✔ = confirmed by the sources below, otherwise general industry knowledge.

## Timetable planning (Fahrplankonstruktion, capacity)

| Tool                            | Vendor                                   | Use                                                                                                                                             | DACH                                                                                      |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **FBS**                         | iRFP (Dresden)                           | timetable construction since 1993; Bildfahrplan, running times, path conflicts                                                                  | railML.org lists **ÖBB Infrastruktur** as a user ✔; many German operators and authorities |
| **TPS** (Train Planning System) | Siemens Mobility (formerly HaCon)        | timetable and capacity management: TPS.plan (long-term timetable), TPS.live (dispatching), TPS.trackworks (track works), TPS.integrate (data) ✔ | reference Network Rail ✔; best-known German user DB InfraGO                               |
| **Viriato**                     | SMA und Partner (Zürich)                 | strategic timetables (integrated interval timetable, network graphs) up to short-term operational plans ✔                                       | SBB; target-network studies in AT/DE                                                      |
| **Netzgrafik-Editor** (NGE)     | SBB → Open Rail Association, open source | network graph / integrated interval timetable                                                                                                   | SBB; zugx exports to it (`/netz`)                                                         |
| **PTV Visum**                   | PTV (Karlsruhe)                          | transport models, demand, line and timetable planning                                                                                           | transport authorities, consultancies                                                      |

## Capacity and operations simulation (Eisenbahnbetriebswissenschaft)

| Tool                   | Vendor                                             | Use                                                                                                      |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **RailSys**            | RMCon (Hannover)                                   | microscopic simulation, capacity and infrastructure management; certified railML infrastructure export ✔ |
| **OpenTrack**          | OpenTrack Railway Technology (ETH Zürich spin-off) | microscopic simulation, running-time calculation; controllable via a Python API ✔                        |
| **LUKS**               | VIA Consulting & Development (RWTH Aachen)         | capacity analysis, timetable construction (UIC 406)                                                      |
| **ANKE, STRELE, NEMO** | DB                                                 | analytical methods (DB Netz classes RailSys/OpenTrack as simulative, these as analytical) ✔              |

## Infrastructure planning and signalling (Trassierung, LST)

| Tool / standard                             | Use                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **ProVI** (Obermeyer)                       | road and railway alignment, BIM-capable ✔; ProVI LST for signalling planning ✔                                 |
| **Card/1** (IB&T)                           | alignment, surveying, BIM (road and rail)                                                                      |
| **ProSig**, **safeTplan**                   | signalling planning, data exchange via PlanPro ✔                                                               |
| **PlanPro**                                 | DB data standard for electronic interlocking planning (since 2009), open XML schema under the RailPL licence ✔ |
| **Bentley OpenRail**, **Autodesk Civil 3D** | international CAD/BIM rail design                                                                              |

## Exchange formats and data

- **railML** — open exchange format for infrastructure, timetable and rolling stock; railML.org lists the software supporting it (FBS, TPS, Viriato, RailSys, IVU.rail …) ✔.
- **RailTopoModel / EULYNX** — topology model and signalling standards (EU).
- **ÖBB**: VzG and Streckenlisten (the official counterparts of our OSM-derived VzG data), timetable order deadlines and the ZFM interface (electronic management of train movements) on infrastruktur.oebb.at ✔.
- Timetable formats of the transport associations (DINO, GTFS, NeTEx): see [timetable-formats.md](timetable-formats.md).

## Operations and resource planning

- **IVU.rail** — vehicle and crew scheduling (railML ✔).
- **Mentz DIVA** — timetables of the transport associations (export format DINO).

## Relevance for zugx

- **railML export/import** would connect our VzG data (lines, km, speeds, signals, structures) and the Bildfahrplan with FBS, TPS, Viriato and RailSys.
- The Bildfahrplan follows FBS conventions (look, running times); the Netzgrafik already exports to the NGE.
- Validation: the official VzG/Streckenlisten would be the reference for our OSM-derived data.

## Sources

- [railML: TPS](https://railml.org/en/applications/detail/tps-train-planning-system.html) · [Siemens: Train Planning System](https://www.mobility.siemens.com/global/en/portfolio/rail/automation/train-planning.html)
- [railML: FBS](https://railml.org/en/applications/detail/fbs.html) · [railML: Viriato](https://www.railml.org/en/software/viriato) · [SMA: Viriato](https://sma-partner.com/en/software/viriato) · [railML: RailSys](https://www.railml.org/en/software/railsys) · [railML: software list](https://railml.org/en/software.html) · [railML: IVU.rail](https://www.railml.org/en/software/ivu-rail)
- [ÖBB-Infrastruktur: ZFM interface](https://infrastruktur.oebb.at/en/partners/rail-network/documents-and-data/electronic-management-of-train-movements/zfm-interface)
- [Uni Stuttgart: OpenTrack vs. RailSys](https://www.iev.uni-stuttgart.de/dokumente/lehre/plakate_ba/Plakat_BA_Stanojevic.pdf) · [EBP: Capacity Management and Simulation](https://www.ebp.ch/en/node/2616) · [RWTH VIA: capacity assessment](https://www.via.rwth-aachen.de/downloads/24-29_Maus_Kogel_Niessen_Fietze_FA_ANZ.pdf) · [RWTH VIA: digital capacity management (ETR 2025)](https://www.via.rwth-aachen.de/downloads/ETR_2025_001-002_Benz_etal_RWTH.pdf)
- [DB InfraGO: PlanPro handbook](https://www.dbinfrago.com/resource/blob/11161554/ed01d939ba3488e9eb18f82c0b287142/planpro_handbuch-data.pdf) · [DB: digital signalling planning workshop](https://www.deutschebahn.com/resource/blob/13317228/38dac152d788255b0d974b79a9cad6cd/20250313_Workshop_Digitale-LST-Planung-data.pdf) · [PlanPro (ETR 2012)](https://menges.informatik.uni-kiel.de/PlanPro_Gerke_ETR_03-12.pdf) · [RWTH: alignment software (thesis)](https://www.via.rwth-aachen.de/downloads/arbeiten/BA/BA01_Trassierungssoftware.pdf)
