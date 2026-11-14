# Licence of the VzG data

The files in this directory (`*.toml`) are derived from OpenStreetMap data and are made available
under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

© OpenStreetMap contributors — https://www.openstreetmap.org/copyright

They are _not_ covered by the AGPL-3.0 of the zugx source code. Derived databases must again be
shared under the ODbL; works produced from them (e.g. rendered VzG-Grafiken) need the attribution
above.

Built by `packages/vzg/scripts/extract.ts` (OSM PBF → `.cache/osm-rail.json`) and
`packages/vzg/scripts/build.ts` (→ one file per ÖBB line number, e.g. `101-01.toml`).
