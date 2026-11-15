<script setup lang="ts">
// End-user help: all views and features, keyboard shortcuts, where the data comes from.
// German and English (Italian UI shows the English text).
import { useI18n } from "../i18n/index.ts";
const { locale } = useI18n();
</script>

<template>
  <article class="legal help max-w-3xl">
    <template v-if="locale === 'de'">
      <h1>Hilfe</h1>
      <p>
        zugx zeigt Fahrplan- und Echtzeitdaten der Züge in Österreich – schnell, kompakt und am
        Handy wie am Desktop. Diese Seite erklärt alle Ansichten, die Bedienung und woher die Daten
        stammen.
      </p>
      <nav aria-label="Inhalt" class="toc">
        <a href="#suche">Suche &amp; Verbindungen</a> · <a href="#abfahrten">Abfahrtstafel</a> ·
        <a href="#zuglauf">Zuglauf</a> · <a href="#zuege">Züge</a> · <a href="#radar">Radar</a> ·
        <a href="#bildfahrplan">Bildfahrplan</a> · <a href="#vzg">VzG-Grafik</a> ·
        <a href="#netzgrafik">Netzgrafik</a> · <a href="#stoerungen">Störungen</a> ·
        <a href="#tasten">Tastenkürzel</a> · <a href="#daten">Daten &amp; Quellen</a> ·
        <a href="#grenzen">Grenzen</a>
      </nav>

      <h2 id="suche">Suche &amp; Verbindungen</h2>
      <p>
        Auf der Startseite Abfahrts- und Zielbahnhof eingeben (Vorschläge erscheinen beim Tippen,
        aus dem eingebauten Bahnhofsverzeichnis), optional Zeit und „über“. Ohne Ziel öffnet sich
        die Abfahrtstafel des Bahnhofs.
      </p>
      <ul>
        <li>
          <strong>Zeitleiste</strong>: jede Verbindung als Balken, Teilstrecken in der Farbe des
          Zuges, Umstiegszeiten dazwischen (knappe Umstiege hervorgehoben); Verspätungen und
          Ausfälle sind markiert. Alternativ als <strong>Tabelle</strong>.
        </li>
        <li>
          <strong>Früher / Später</strong> lädt weitere Verbindungen; ankreuzen und
          <strong>Vergleichen</strong> stellt mehrere Verbindungen nebeneinander.
        </li>
        <li>
          Ein Klick öffnet die Details: alle Halte, Bahnsteige, Echtzeit, Hinweise; „Was, wenn ich
          den Anschluss verpasse?“ sucht die nächste Möglichkeit ab dem Umstiegsbahnhof.
          Verbindungen lassen sich teilen und in den Kalender eintragen.
        </li>
      </ul>

      <h2 id="abfahrten">Abfahrtstafel</h2>
      <p>
        Abfahrten bzw. Ankünfte eines Bahnhofs mit Echtzeit: Verspätung, Bahnsteig (Bahnsteigwechsel
        hervorgehoben), Ausfälle und Hinweise. Filter nach Verkehrsmittel (z. B. nur Fernverkehr),
        „Früher / Später“ blättert, die Liste aktualisiert sich automatisch. Große Bahnhöfe wie Wien
        Hbf führen auch Straßenbahn und Bus – diese lassen sich über die Filter einblenden. Der
        Stern merkt den Bahnhof als Favorit; der Wikidata-Link führt zum Bahnhof auf Wikidata.
      </p>
      <p>
        <strong>Abfahrtsplan</strong> (Link auf der Abfahrtstafel): alle Abfahrten eines Tages aus
        dem Jahresfahrplan, nach Stunden in Spalten wie der Aushang im Bahnhof – mit Zug, Ziel,
        Unterwegshalten (verlinkt) und Bahnsteig; Datum wählbar (←/→). Ohne Echtzeit.
      </p>

      <h2 id="zuglauf">Zuglauf</h2>
      <p>
        Ein Zug mit allen Halten, geplanten und tatsächlichen Zeiten, Bahnsteigen,
        Verspätungsverlauf und Karte. Erreichbar über einen Klick auf einen Zug oder direkt per
        Adresse, z. B.
        <code>/train/RJX-162</code>, mit <code>?d=2026-11-13</code> für ein anderes Datum. Bei
        Verspätung steht die erwartete Ist-Zeit unter der Soll-Zeit. Zeichen wie im ÖBB-Kursbuch: ◗
        hält nur zum Einsteigen, ◖ hält nur zum Aussteigen, | kein Halt zum Ein- oder Aussteigen.
      </p>

      <h2 id="zuege">Züge (Zugindex)</h2>
      <p>
        Alle Züge des Fahrplanjahres in Österreich – Nummer, Name, Laufweg, Verkehrstage – zum
        Durchsuchen und Filtern nach Betreiber, Gattung, Bahnhof oder Datum. Die Verkehrstage
        stammen aus dem Jahresfahrplan.
      </p>

      <h2 id="radar">Radar</h2>
      <p>
        Live-Karte aller Züge im Kartenausschnitt, eingefärbt nach Verspätung oder Gattung; kleine
        Pfeile zeigen die Fahrtrichtung. Ein Klick auf einen Zug öffnet seinen Zuglauf seitlich. Die
        Positionen werden von der ÖBB-Fahrplanauskunft aus dem Fahrplan und den Echtzeitdaten
        berechnet – sie sind keine GPS-Positionen. Die „Bahnkarte“ blendet die Strecken der
        OpenRailwayMap ein.
      </p>
      <p>
        <strong>Zugteile</strong>: Vereinigte Züge (Nachtzüge, Railjets mit Flügelzug) stehen als
        ein Zug auf der Karte, z. B. „NJ 466 / EN 40462“ – der vermutlich betriebliche Zug zuerst
        (rein kommerzielle Nummern ab 40000 zuletzt, sonst die kleinere Nummer). Im Zuglauf wählt
        man den Zugteil per Klick auf sein Abzeichen. Der Kasten „Zugteile“ (auch auf der Zugseite)
        zeigt je Abschnitt, mit welchen Zügen vereinigt gefahren wird und – bei rein kommerziellen
        Nummern – den betrieblichen Zug (EN 40462: bis Salzburg EC 462, „ab hier NJ 466“). Grundlage
        sind die Angaben der ÖBB-Auskunft; welche Nummer im vereinigten Abschnitt betrieblich gilt,
        ist dort nicht immer erkennbar.
      </p>

      <h2 id="bildfahrplan">Bildfahrplan</h2>
      <p>
        Weg-Zeit-Diagramme für Strecken (die Fahrplanbilder der ÖBB und einige längere Korridore):
        waagrecht die Bahnhöfe nach Streckenkilometer, senkrecht die Zeit nach unten. Jeder Zug ist
        eine Linie in der Farbe seiner Gattung; steile Linien sind langsam, senkrechte Stücke sind
        Aufenthalte. Ein Klick auf einen Zug (im Diagramm oder in den Tabellen) öffnet seinen
        Zuglauf seitlich, Strg/⌘-Klick die ganze Zugseite. Die Farben folgen der Angebotsebene wie
        in der Fahrplanplanung üblich: RJX magenta, RJ rot, EC/IC braunrot, ICE dunkelgrau, IR und
        CJX violett, REX grün, R graublau, S blau, Nightjet nachtblau, private Fernverkehrsanbieter
        (WESTbahn, RegioJet) orange.
      </p>
      <ul>
        <li>
          Beliebiger Tag des Fahrplanjahres, Abschnitt und Richtung wählbar, Zeitfenster 1–24
          Stunden; Mausrad verschiebt die Zeit, Strg/⌘ + Mausrad zoomt. Datum und Uhrzeit bleiben
          beim Wechsel zu einem anderen Bildfahrplan erhalten.
        </li>
        <li>
          Fährt ein Zug ohne Halt durch, wird die Durchfahrtszeit geschätzt – gewichtet nach der
          zulässigen Geschwindigkeit (in langsamen Abschnitten wie dem Wienerwald später, auf
          schnellen früher).
        </li>
        <li>
          Darüberfahren zeigt Zugnummer und Laufweg, ein Klick den Zuglauf; ein Klick auf einen
          Bahnhof öffnet seine Abfahrtstafel; die Strecken-Links führen zur VzG-Grafik.
        </li>
        <li>
          <strong>Echtzeit</strong> (nur für heute): die tatsächlichen Fahrten aus der
          ÖBB-Fahrplanauskunft als kräftige Linien über dem Plan – durchgezogen bis jetzt,
          gestrichelt als Prognose, Punkte an gemeldeten Zeiten, die aktuelle Verspätung an der
          Jetzt-Linie. Der ersetzte Plan wird dünn und blass. Auch Züge, die in den Fahrplandaten
          fehlen (z. B. WESTbahn), erscheinen dann.
        </li>
        <li>
          <strong>Maßstab</strong> 1×/2×/4× streckt die Zeitachse (Tasten
          <kbd>+</kbd>/<kbd>−</kbd>). Am oberen Rand zeigen eine bzw. zwei dünne Linien, wo die
          Strecke ein- oder zweigleisig ist.
        </li>
        <li>
          <strong>Fahrplantabellen</strong> unter dem Diagramm, für beide Richtungen: wie im
          ÖBB-Kursbuch (Bahnhöfe als Zeilen, ein Zug je Spalte, „|“ = Durchfahrt; der Bahnhofsname
          öffnet den Abfahrtsplan des Tages, daneben die Nummern der dort abzweigenden
          Fahrplanbilder als Links; mit Echtzeit Verspätung und erwartete Zeit je Halt);
          <strong>Transponieren</strong> zeigt eine Zeile je Zug.
        </li>
        <li>
          <strong>Zweiter Bildschirm</strong>: Diagramm und Tabellen lassen sich in eigenen Fenstern
          öffnen; Tag, Uhrzeit, Abschnitt und der Zug unter dem Mauszeiger bleiben synchron.
        </li>
      </ul>
      <h3 id="planung">Planung</h3>
      <p>
        Unter dem Diagramm werten fünf Ansichten den gezeigten Fahrplan aus – für kürzere Umstiege,
        verlässlichere Züge auf eingleisigen Strecken und schnellere Fahrten:
      </p>
      <ul>
        <li>
          <strong>Knoten</strong>: für einen Bahnhof (Auswahl oder Klick auf den Namen im Diagramm)
          die Linien mit ihren üblichen Ankunfts- und Abfahrtsminuten und ihrem Takt, ob sie sich um
          eine Knotenminute treffen (Vollknoten :00, Halbknoten :30), die Symmetrieminute; dazu für
          jede Ankunft der erste Anschluss je Richtung (grün ≤ 10′, gelb ≤ 20′, rot länger) und
          knapp verpasste Anschlüsse. Der Mindestumstieg ist einstellbar. Mit „alle Linien“ kommen
          alle anderen Züge am Bahnhof aus der ÖBB-Fahrplanauskunft dazu (andere Strecken, WESTbahn
          …).
        </li>
        <li>
          <strong>Kreuzungen</strong>: wo sich Züge beider Richtungen neben eingleisigen Abschnitten
          begegnen – mit dem Puffer je Richtung (wie viel Verspätung des Gegenzugs abgefangen wird)
          und, bei Echtzeit, der zu erwartenden Folgeverspätung. Im Diagramm: eingleisige Abschnitte
          grau, Kreuzungen als Punkte, Begegnungen zwischen zwei Bahnhöfen als ✕ (oft eine Ausweiche
          ohne Personenhalt).
        </li>
        <li>
          <strong>Fahrzeitreserve</strong>: geplante Fahrzeit zwischen zwei Halten im Vergleich zur
          kürzest möglichen mit der zulässigen Geschwindigkeit (inkl. Anfahren und Bremsen) – je
          Abschnitt, Gattung und Richtung. Viel Reserve heißt Spielraum für schnellere Züge.
          Einstellbar: Anfahrbeschleunigung (Triebzug, lokbespannt), Bremsverzögerung, Regelzuschlag
          und die Schwelle für „viel Reserve“.
        </li>
        <li>
          <strong>Kapazität</strong>: die Sperrzeitentreppe – je Zug und Blockabschnitt (von
          Hauptsignal zu Hauptsignal, bei ETCS Level 2 von ETCS-Halttafel zu ETCS-Halttafel, aus
          OpenStreetMap) die Zeit, in der der Abschnitt für andere Züge gesperrt ist, im Diagramm
          als Kästchen; rot = Konflikt. Die Tabelle zeigt je Blockabschnitt die Belegung im
          Zeitfenster, die längste Sperrzeit und den Engpass. Einstellbar: Vorsignalabstand,
          Fahrstraßen- und Reaktionszeit, Auflösezeit, Zuglängen, Toleranz.
        </li>
        <li>
          <strong>Pünktlichkeit (Echtzeit)</strong>: wo Züge Zeit verlieren, je Abschnitt und Halt,
          aus den gemeldeten Echtzeiten. Gesammelt im eigenen Browser, solange Echtzeit läuft (7
          Tage).
        </li>
      </ul>
      <p class="muted">
        Grenzen: Kreuzungen, Fahrzeitreserve und Pünktlichkeit nur für Züge dieses Bildfahrplans;
        Ein-/ Zweigleisigkeit aus OpenStreetMap, Durchfahrtszeiten und Mindestfahrzeiten geschätzt.
      </p>

      <h2 id="vzg">VzG-Grafik</h2>
      <p>
        Zulässige Geschwindigkeiten entlang einer Strecke, angelehnt an das „Verzeichnis der örtlich
        zulässigen Geschwindigkeiten und Besonderheiten“ (VzG) der ÖBB: senkrecht der
        Streckenkilometer in Fahrtrichtung, daneben Bahnhöfe und Signale, die Kilometer der
        Geschwindigkeitswechsel, das Geschwindigkeitsband (Fahrtrichtung durchgezogen, Gegenrichtung
        strichpunktiert) und die Kurvenradien. Gleis (Regelgleis 1/2), Richtung und Maßstab sind
        wählbar; Darüberfahren zeigt Details zu Signalen, Abschnitten und Kurven.
      </p>
      <ul>
        <li>
          Alle ÖBB-Strecken nach Streckennummer und weitere Bahnen (z. B. Stubaitalbahn,
          Zillertalbahn, Lokalbahn Wien–Baden).
        </li>
        <li>
          <strong>Anschlussstrecken</strong>: an Knotenbahnhöfen führen Links („↗ 222 01“) zur
          VzG-Grafik der abzweigenden Strecke.
        </li>
        <li>
          <strong>⤓ SVG</strong> lädt die Grafik als eigenständige Datei mit Titel, Legende und
          Quellenangabe herunter – z. B. für Wikimedia Commons (Lizenz ODbL wie die
          OpenStreetMap-Daten).
        </li>
        <li>
          <strong>Übersicht</strong> (<code>/vzg</code>): alle Strecken mit Name, Von–Bis, ein-/
          zweigleisig, Länge, Bahnhöfen und Signalen; Filter nach Nummer („10101“ findet „101 01“),
          Name oder Bahnhof, sortierbar.
        </li>
        <li>Bahnhöfe mit ihrer <strong>Seehöhe</strong>, soweit in OpenStreetMap erfasst.</li>
        <li>
          <strong>Streckenband</strong>: die Strecke als schematisches Band wie in den
          Wikipedia-Streckendiagrammen – Bahnhöfe nach Art, Brücken und Tunnel mit Namen und Länge,
          Abzweige.
        </li>
        <li>
          <strong>Streckenprofil</strong> unter der Grafik: Länge, Bahnhöfe und Haltestellen,
          Höchst- und Durchschnittsgeschwindigkeit, Tunnel und Brücken, engster Kurvenradius,
          Elektrifizierung, Zugsicherung (ETCS/PZB), zweigleisiger Anteil, Spurweite, Seehöhen, Züge
          pro Tag und Anschlussstrecken.
        </li>
        <li>
          <strong>Streckenkarte</strong>: eine druck- und Wikipedia-taugliche Karte der Strecke mit
          Tunneln, Bahnhöfen (verlinkt zur Abfahrtstafel) und abzweigenden Strecken (verlinkt zu
          deren Karte); wahlweise nach zulässiger Geschwindigkeit eingefärbt und mit
          Streckenkilometern; als SVG herunterladbar.
        </li>
        <li>
          <strong>Netzkarte</strong> (<code>/vzg/netz</code>): alle Strecken Österreichs, eingefärbt
          nach Geschwindigkeit, Elektrifizierung, ETCS, PZB, Gleisanzahl, Spurweite, Betreiber oder
          <strong>Züge pro Tag</strong> (Verkehrsstärke aus dem Fahrplan); mit Staats- und
          Landesgrenzen, für ganz Österreich oder ein einzelnes Bundesland. Darüberfahren zeigt die
          Werte, ein Klick öffnet die Streckenkarte; als SVG herunterladbar.
        </li>
        <li>
          Die Daten stammen aus OpenStreetMap, nicht aus dem amtlichen VzG: Bremswege, Neigungen und
          Besonderheiten fehlen, die Kurvenradien sind aus der Gleisgeometrie geschätzt.
        </li>
      </ul>

      <h2 id="netzgrafik">Netzgrafik</h2>
      <p>
        Der Taktfahrplan als Netz: Knoten mit ihren Ankunfts- und Abfahrtsminuten, Linien mit Takt
        und Fahrzeit, rekonstruiert aus dem Fahrplan eines Werktags, Samstags oder Sonntags. Lässt
        sich im Netzgrafik-Editor (Open Rail Association) öffnen oder als Datei exportieren.
      </p>

      <h2 id="stoerungen">Störungen</h2>
      <p>Aktuelle Störungs- und Baustellenmeldungen der ÖBB mit ihrem Gültigkeitszeitraum.</p>

      <h2 id="tasten">Tastenkürzel</h2>
      <p>
        Am Desktop: <kbd>?</kbd> zeigt alle Kürzel. Häufig: <kbd>/</kbd> Suche,
        <kbd>Strg/⌘ K</kbd> Befehlspalette, <kbd>j</kbd>/<kbd>k</kbd> nächste/vorige Zeile,
        <kbd>h</kbd>/<kbd>l</kbd> früher/später, <kbd>g</kbd> Start, <kbd>t</kbd> Züge,
        <kbd>r</kbd> Radar. Im Bildfahrplan <kbd>←</kbd>/<kbd>→</kbd> Tag, <kbd>↑</kbd>/<kbd>↓</kbd>
        zwei Stunden (mit Umschalt ein ganzes Fenster), <kbd>+</kbd>/<kbd>−</kbd> Maßstab,
        <kbd>n</kbd> jetzt.
      </p>

      <h2 id="daten">Daten &amp; Quellen</h2>
      <ul>
        <li>
          <strong>Echtzeit, Verbindungen, Abfahrten, Zugläufe, Radar, Störungen</strong>: direkt aus
          der ÖBB-Fahrplanauskunft (Scotty/HAFAS) – inoffizielle Schnittstelle, Anfragen gehen über
          zugx an die ÖBB.
        </li>
        <li>
          <strong>Jahresfahrplan</strong> (Bahnhofsverzeichnis, Zugindex, Bildfahrplan, Netzgrafik):
          <a href="https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~">ÖBB Open Data (GTFS)</a
          >, CC BY 4.0, regelmäßig aktualisiert. Enthält die Züge der ÖBB (und einiger Partner),
          nicht WESTbahn, GKB, Raaberbahn u. a.
        </li>
        <li>
          <strong
            >Strecken, Geschwindigkeiten, Signale, Kilometer, Ein-/Zweigleisigkeit, Grenzen</strong
          >
          (VzG-Grafik, Strecken- und Netzkarte, Durchfahrtszeiten und Gleisanzahl im Bildfahrplan):
          <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap-Mitwirkende</a>, ODbL.
        </li>
        <li>
          <strong>Karten</strong>: OpenFreeMap, OpenStreetMap, OpenRailwayMap (Quellen in der
          Kartenecke).
        </li>
        <li>
          <strong>Wikidata</strong>: Links zu Bahnhöfen über DinoData, zu Strecken über die
          OpenStreetMap-Daten.
        </li>
      </ul>
      <p>
        Details zu Datenschutz und Verarbeitung: <RouterLink to="/privacy">Datenschutz</RouterLink>.
      </p>

      <h2 id="grenzen">Grenzen</h2>
      <p>
        zugx ist kein Angebot der ÖBB; alle Angaben ohne Gewähr, verbindlich sind die Informationen
        des Verkehrsunternehmens. Radar-Positionen und Durchfahrtszeiten sind berechnet bzw.
        geschätzt; die VzG-Grafik ist nicht das amtliche VzG.
      </p>
    </template>

    <template v-else>
      <h1>Help</h1>
      <p>
        zugx shows timetable and realtime data of trains in Austria – fast, compact, on phone and
        desktop. This page explains all views, how to use them, and where the data comes from.
      </p>
      <nav aria-label="Contents" class="toc">
        <a href="#suche">Search &amp; journeys</a> · <a href="#abfahrten">Station board</a> ·
        <a href="#zuglauf">Train run</a> · <a href="#zuege">Trains</a> ·
        <a href="#radar">Radar</a> · <a href="#bildfahrplan">Graphic timetable</a> ·
        <a href="#vzg">VzG chart</a> · <a href="#netzgrafik">Netzgrafik</a> ·
        <a href="#stoerungen">Disruptions</a> · <a href="#tasten">Keyboard</a> ·
        <a href="#daten">Data &amp; sources</a> · <a href="#grenzen">Limits</a>
      </nav>

      <h2 id="suche">Search &amp; journeys</h2>
      <p>
        On the start page enter origin and destination (suggestions while typing, from the built-in
        station list), optionally a time and "via". Without a destination the station board opens.
      </p>
      <ul>
        <li>
          <strong>Timeline</strong>: each journey as a bar, legs in the train's colour, transfer
          times in between (tight ones highlighted), delays and cancellations marked; or as a
          <strong>table</strong>.
        </li>
        <li>
          <strong>Earlier / Later</strong> loads more journeys; tick several and
          <strong>Compare</strong> them side by side.
        </li>
        <li>
          Click for details: all stops, platforms, realtime, notes; "What if I miss it?" searches
          the next option from the transfer station. Share journeys or add them to your calendar.
        </li>
      </ul>

      <h2 id="abfahrten">Station board</h2>
      <p>
        Departures or arrivals with realtime: delay, platform (changes highlighted), cancellations
        and notes. Filter by mode (e.g. long-distance only), "Earlier / Later" pages, the list
        refreshes automatically. Big stations such as Wien Hbf also list trams and buses – enable
        them with the filters. The star saves the station as a favourite; the Wikidata link opens
        the station on Wikidata.
      </p>
      <p>
        <strong>Departure poster</strong> (link on the station board): all departures of a day from
        the annual timetable, by hour in columns like the poster in the station – with train,
        destination, following stops (linked) and platform; choose the date (←/→). No realtime.
      </p>

      <h2 id="zuglauf">Train run</h2>
      <p>
        A train with all stops, planned and actual times, platforms, delay profile and map. Click a
        train anywhere, or open e.g. <code>/train/RJX-162</code> (add <code>?d=2026-11-13</code>
        for another date). When late, the expected actual time is shown under the planned one. Signs
        as in the ÖBB Kursbuch: ◗ boarding only, ◖ alighting only, | no stop for passengers.
      </p>

      <h2 id="zuege">Trains (train index)</h2>
      <p>
        Every train of the timetable year in Austria – number, name, route, running days – to search
        and filter by operator, category, station or date.
      </p>

      <h2 id="radar">Radar</h2>
      <p>
        Live map of all trains in view, coloured by delay or category; small arrows show the
        direction. Click a train to open its run in a side panel. Positions are computed by the ÖBB
        journey planner from timetable and realtime data – they are not GPS positions. "Railway map"
        adds the OpenRailwayMap tracks.
      </p>
      <p>
        <strong>Train parts</strong>: joined trains (night trains, Railjets with a portion for
        another destination) show as one train on the map, e.g. "NJ 466 / EN 40462" – the likely
        operational train first (commercial-only numbers from 40000 last, else the lower number). In
        the run, pick a part by clicking its badge. The "Train parts" box (also on the train page)
        lists per stretch the trains it runs joined with and – for commercial-only numbers – the
        operational train (EN 40462: EC 462 to Salzburg, "from here NJ 466"). Based on the ÖBB
        journey planner's data; which number is the operational one in a joined stretch is not
        always visible there.
      </p>

      <h2 id="bildfahrplan">Graphic timetable (Bildfahrplan)</h2>
      <p>
        Time–distance diagrams for lines (ÖBB's timetable diagrams and some longer corridors):
        stations across by line km, time downwards. Each train is a line in its category's colour;
        steep lines are slow, vertical parts are stops. Click a train (in the chart or the tables)
        to open its run in a side panel, Ctrl/⌘-click for the full train page. Colours follow the
        offer level as usual in timetable planning: RJX magenta, RJ red, EC/IC brown-red, ICE dark
        grey, IR and CJX violet, REX green, R slate blue, S blue, Nightjet night blue, private
        long-distance operators (WESTbahn, RegioJet) orange.
      </p>
      <ul>
        <li>
          Any day of the timetable year, section and direction, a 1–24 hour window; mouse wheel
          moves in time, Ctrl/⌘ + wheel zooms. Date and time are kept when switching sheets.
        </li>
        <li>
          Times at stations a train passes without stopping are estimated, weighted by the permitted
          speed (later in slow sections, earlier on fast ones).
        </li>
        <li>
          Hover for number and route, click for the train run; a station opens its departure board;
          line links open the VzG chart.
        </li>
        <li>
          <strong>Live</strong> (today only): actual paths from the ÖBB journey planner drawn bold
          over the plan – solid up to now, dashed as forecast, dots at reported times, the current
          delay at the now line; the replaced plan becomes thin and faint. Trains missing from the
          timetable data (e.g. WESTbahn) appear too.
        </li>
        <li>
          <strong>Scale</strong> 1×/2×/4× stretches the time axis (keys <kbd>+</kbd>/<kbd>−</kbd>).
          One or two thin lines along the top edge show single or double track.
        </li>
        <li>
          <strong>Timetable tables</strong> below the chart, both directions: like the ÖBB Kursbuch
          (stations as rows, a train per column, "|" = passes; a station name opens its departure
          plan for the day, next to it the numbers of the sheets branching off there, as links; with
          realtime on, delay and expected time per stop); <strong>Transpose</strong> shows a row per
          train.
        </li>
        <li>
          <strong>Second monitor</strong>: chart and tables can open in their own windows; day,
          time, section and the hovered train stay in sync.
        </li>
      </ul>
      <h3 id="planning">Planning</h3>
      <p>
        Below the chart, five views evaluate the shown timetable – for shorter transfers, more
        reliable trains on single track and faster journeys:
      </p>
      <ul>
        <li>
          <strong>Node</strong>: for a station (select it or click its name in the chart) the lines
          with their usual arrival and departure minutes and interval, whether they meet around a
          node minute (full node :00, half node :30), the symmetry minute; and for every arrival the
          first connection per direction (green ≤ 10′, amber ≤ 20′, red longer) and near misses. The
          minimum transfer time is adjustable. With “all lines”, every other train at the station
          comes in from the ÖBB journey planner (other lines, WESTbahn …).
        </li>
        <li>
          <strong>Crossings</strong>: where trains of both directions meet next to single track –
          with the buffer each way (how much delay of the opposite train is absorbed) and, with live
          data, the expected knock-on delay. In the chart: single track shaded, crossings as dots,
          meetings between two stations as ✕ (often a passing loop without passenger stop).
        </li>
        <li>
          <strong>Running-time reserve</strong>: scheduled running time between two stops vs. the
          shortest possible at the permitted speed (incl. starting and stopping) – per stretch,
          category and direction. Much reserve means room for faster trains. Adjustable: starting
          acceleration (multiple unit, locomotive-hauled), braking, standard supplement and the
          threshold for much reserve.
        </li>
        <li>
          <strong>Capacity</strong>: the blocking-time stairway – per train and block section (main
          signal to main signal, on ETCS Level 2 from ETCS marker to ETCS marker, from
          OpenStreetMap) the time the section is blocked for other trains, drawn as boxes in the
          chart; red = conflict. The table shows per block section the occupancy of the time window,
          the longest blocking time and the bottleneck. Adjustable: distant signal distance, route
          setting and reaction time, release time, train lengths, tolerance.
        </li>
        <li>
          <strong>Punctuality (live)</strong>: where trains lose time, per stretch and stop, from
          the reported realtime times. Collected in your browser while live runs (7 days).
        </li>
      </ul>
      <p class="muted">
        Limits: crossings, running-time reserve and punctuality only for trains of this sheet;
        single/double track from OpenStreetMap, passing times and minimum running times estimated.
      </p>

      <h2 id="vzg">VzG chart</h2>
      <p>
        Permitted speeds along a line, modelled on ÖBB's VzG (directory of permitted speeds): line
        km downwards in the direction of travel, stations and signals, the km of speed changes, the
        speed band (direction of travel solid, opposite dash-dot) and curve radii. Choose the track
        (Regelgleis 1/2), direction and scale; hover for details.
      </p>
      <ul>
        <li>
          All ÖBB lines by line number, plus other railways (e.g. Stubaitalbahn, Zillertalbahn,
          Lokalbahn Wien–Baden).
        </li>
        <li>
          <strong>Connecting lines</strong>: at junction stations, links ("↗ 222 01") open the other
          line's chart.
        </li>
        <li>
          <strong>⤓ SVG</strong> downloads the chart as a standalone file with caption, legend and
          sources – e.g. for Wikimedia Commons (licence ODbL, like the OpenStreetMap data).
        </li>
        <li>
          <strong>Overview</strong> (<code>/vzg</code>): all lines with name, from–to, single/double
          track, length, stations and signals; filter by number ("10101" finds "101 01"), name or
          station, sortable.
        </li>
        <li>Stations with their <strong>elevation</strong>, where mapped in OpenStreetMap.</li>
        <li>
          <strong>Route strip</strong> (Streckenband): the line as a schematic strip like the
          Wikipedia route diagrams – stations by type, bridges and tunnels with name and length,
          junctions.
        </li>
        <li>
          <strong>Line profile</strong> below the chart: length, stations and halts, top and average
          speed, tunnels and bridges, tightest curve, electrification, train protection (ETCS/PZB),
          double-track share, gauge, elevations, trains per day and connecting lines.
        </li>
        <li>
          <strong>Line map</strong>: a print- and Wikipedia-ready map of the line with tunnels,
          stations (linked to their departure board) and connecting lines (linked to their map);
          optionally coloured by permitted speed and with line km; downloadable as SVG.
        </li>
        <li>
          <strong>Network map</strong> (<code>/vzg/netz</code>): all lines in Austria, coloured by
          speed, electrification, ETCS, PZB, track count, gauge, operator or
          <strong>trains per day</strong> (traffic density from the timetable); with national and
          federal-state borders, for all of Austria or one federal state. Hover for the values,
          click for the line map; downloadable as SVG.
        </li>
        <li>
          Data from OpenStreetMap, not the official VzG: no braking distances, gradients or remarks;
          curve radii are estimated from the track geometry.
        </li>
      </ul>

      <h2 id="netzgrafik">Netzgrafik</h2>
      <p>
        The interval timetable as a network: nodes with their arrival and departure minutes, lines
        with frequency and running time, reconstructed from the timetable of a weekday, Saturday or
        Sunday. Open it in the Netzgrafik-Editor (Open Rail Association) or export it.
      </p>

      <h2 id="stoerungen">Disruptions</h2>
      <p>Current disruption and engineering notices from ÖBB with their validity period.</p>

      <h2 id="tasten">Keyboard shortcuts</h2>
      <p>
        On desktop <kbd>?</kbd> lists all shortcuts. Common ones: <kbd>/</kbd> search,
        <kbd>Ctrl/⌘ K</kbd> command palette, <kbd>j</kbd>/<kbd>k</kbd> next/previous row,
        <kbd>h</kbd>/<kbd>l</kbd> earlier/later, <kbd>g</kbd> home, <kbd>t</kbd> trains,
        <kbd>r</kbd> radar. Graphic timetable: <kbd>←</kbd>/<kbd>→</kbd> day, <kbd>↑</kbd>/<kbd
          >↓</kbd
        >
        two hours (Shift: a whole window), <kbd>+</kbd>/<kbd>−</kbd> scale, <kbd>n</kbd> now.
      </p>

      <h2 id="daten">Data &amp; sources</h2>
      <ul>
        <li>
          <strong>Realtime, journeys, boards, train runs, radar, disruptions</strong>: the ÖBB
          journey planner (Scotty/HAFAS) – unofficial interface, requests go via zugx to ÖBB.
        </li>
        <li>
          <strong>Timetable year</strong> (station list, train index, graphic timetable,
          Netzgrafik):
          <a href="https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~">ÖBB open data (GTFS)</a
          >, CC BY 4.0, updated regularly. ÖBB (and some partners) only – not WESTbahn, GKB,
          Raaberbahn etc.
        </li>
        <li>
          <strong>Lines, speed limits, signals, km, single/double track, borders</strong> (VzG
          chart, line and network map, passing times and track count in the graphic timetable):
          <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, ODbL.
        </li>
        <li>
          <strong>Maps</strong>: OpenFreeMap, OpenStreetMap, OpenRailwayMap (credits in the map
          corner).
        </li>
        <li>
          <strong>Wikidata</strong>: links to stations via DinoData, to lines via the OpenStreetMap
          data.
        </li>
      </ul>
      <p>Privacy and data processing: <RouterLink to="/privacy">Privacy</RouterLink>.</p>

      <h2 id="grenzen">Limits</h2>
      <p>
        zugx is not a service of ÖBB; no guarantee, the operator's information is binding. Radar
        positions and passing times are computed or estimated; the VzG chart is not the official
        VzG.
      </p>
    </template>
  </article>
</template>

<style scoped>
.help .toc {
  margin: 0.5rem 0 1rem;
  font-size: 0.8125rem;
  line-height: 1.7;
}
.help h2 {
  scroll-margin-top: 1rem;
}
.help kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  padding: 0 0.3rem;
  border: 1px solid var(--line);
  border-radius: 3px;
}
</style>
