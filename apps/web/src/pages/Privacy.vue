<script setup lang="ts">
// Datenschutzerklärung (DSGVO). German is authoritative; English as a courtesy.
// Keep in sync with the actual data flows: deploy/Caddyfile (log, proxy), MapView (tile hosts),
// lib/store.ts + useLocalStorage keys, StationInput (geolocation).
import { useI18n } from "../i18n/index.ts";
import { setLocale } from "../i18n/index.ts";
const { locale } = useI18n();
const EMAIL = "simon.legner@gmail.com";
</script>

<template>
  <article class="legal max-w-3xl">
    <template v-if="locale === 'de'">
      <h1>Datenschutzerklärung</h1>
      <p class="muted">Stand: November 2026</p>
      <p>
        zugx verwendet keine Cookies, kein Tracking, keine Analyse-Werkzeuge und keine Werbung. Es
        gibt keine Benutzerkonten. Im Folgenden steht, welche Daten trotzdem technisch anfallen.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        Simon Legner, Innsbruck, Österreich –
        <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>
      </p>

      <h2>2. Hosting und Cloudflare</h2>
      <p>
        Die Website läuft auf einem eigenen Server in Österreich (Webserver Caddy). Der Server ist
        über einen <em>Cloudflare Tunnel</em> mit dem Internet verbunden: Alle Anfragen laufen über
        Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA. Cloudflare verarbeitet
        dabei Ihre IP-Adresse und die Anfragedaten (aufgerufene Adresse, Browser-Kennung,
        Zeitpunkt), um die Seite auszuliefern und vor Angriffen zu schützen; die verschlüsselte
        Verbindung endet bei Cloudflare. Cloudflare ist unter dem EU-US Data Privacy Framework
        zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO). Rechtsgrundlage ist unser
        berechtigtes Interesse an einem sicheren, erreichbaren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
        Mehr:
        <a href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.
      </p>

      <h2>3. Server-Protokolle</h2>
      <p>
        Der Webserver protokolliert jede Anfrage: Zeitpunkt, gekürzte IP-Adresse (IPv4 auf /24, IPv6
        auf /48 – die vollständige Adresse wird nicht gespeichert), Methode, aufgerufene Adresse
        samt Parametern (z. B. Bahnhofsnummern), Statuscode, Größe und Dauer. Browser-Header und
        Cookies werden nicht protokolliert. Die Protokolle liegen im System-Journal (systemd) des
        Servers, werden nur zur Fehlersuche und Missbrauchsabwehr verwendet und abhängig von der
        Größe automatisch überschrieben, üblicherweise nach wenigen Wochen. Rechtsgrundlage: Art. 6
        Abs. 1 lit. f DSGVO.
      </p>

      <h2>4. Fahrplanabfragen</h2>
      <p>
        Suchen nach Abfahrten, Verbindungen, Zügen und Störungen leitet unser Server an die
        Fahrplanauskunft der ÖBB-Personenverkehr AG (fahrplan.oebb.at) weiter. Übermittelt wird nur
        der Inhalt der Abfrage (z. B. Bahnhöfe, Datum, Uhrzeit, Zugnummer). Ihre IP-Adresse, Cookies
        und Browser-Header werden <strong>nicht</strong> weitergegeben – die ÖBB sieht nur unseren
        Server. Die Bahnhofssuche läuft zunächst lokal im Browser. Rechtsgrundlage: Art. 6 Abs. 1
        lit. b und f DSGVO (Erbringung der angefragten Auskunft).
      </p>

      <h2>5. Karten</h2>
      <p>
        Wenn eine Karte angezeigt wird (Radar, Zug- und Verbindungskarten, Bahnhofskarte), lädt Ihr
        Browser die Kartenkacheln direkt von diesen Diensten. Dabei erhalten sie Ihre IP-Adresse,
        den angezeigten Kartenausschnitt und die Browser-Kennung:
      </p>
      <ul>
        <li>
          OpenFreeMap (tiles.openfreemap.org) – Grundkarte,
          <a href="https://openfreemap.org/">openfreemap.org</a>
        </li>
        <li>
          OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS,
          Vereinigtes Königreich (tile.openstreetmap.org) – Bahnhofskarte,
          <a href="https://osmfoundation.org/wiki/Privacy_Policy">Datenschutzerklärung</a>
          (Angemessenheitsbeschluss für das Vereinigte Königreich)
        </li>
        <li>
          OpenRailwayMap (a.tiles.openrailwaymap.org) – Bahnstrecken-Ebene, in der Karte
          abschaltbar,
          <a href="https://www.openrailwaymap.org/">openrailwaymap.org</a>
        </li>
      </ul>
      <p>
        Rechtsgrundlage ist unser berechtigtes Interesse an einer Kartendarstellung (Art. 6 Abs. 1
        lit. f DSGVO).
      </p>

      <h2>6. Speicherung im Browser</h2>
      <p>
        Ihre Einstellungen (Sprache, Farbschema, Kartenoptionen) sowie zuletzt gesuchte und
        favorisierte Bahnhöfe und Verbindungen speichert zugx im <em>localStorage</em> Ihres
        Browsers. Für die Offline-Nutzung legt ein Service Worker die App-Dateien im Browser-Cache
        ab. Diese Daten bleiben auf Ihrem Gerät und werden nicht an uns übertragen. Die Speicherung
        ist für die von Ihnen genutzten Funktionen unbedingt erforderlich (§ 165 Abs. 3 TKG 2021).
        Sie können die Daten jederzeit über die Browser-Einstellungen („Websitedaten löschen“)
        entfernen.
      </p>

      <h2>7. Standort</h2>
      <p>
        Nur wenn Sie „in der Nähe“ wählen, fragt der Browser nach Ihrem Standort. Er wird
        ausschließlich im Browser verwendet, um den nächstgelegenen Bahnhof zu finden, und nicht
        übertragen oder gespeichert. Rechtsgrundlage: Ihre Einwilligung (Art. 6 Abs. 1 lit. a
        DSGVO), die Sie in den Browser-Einstellungen widerrufen können.
      </p>

      <h2>8. Kalender und Teilen</h2>
      <p>
        Kalendereinträge (.ics) und Links zum Teilen werden lokal im Browser erzeugt. Was Sie damit
        weitergeben, entscheiden Sie selbst.
      </p>

      <h2>9. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Da wir nur gekürzte IP-Adressen
        speichern, können wir Protokolleinträge in der Regel keiner Person zuordnen. Anfragen bitte
        an
        <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>. Sie können sich außerdem bei der
        österreichischen Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien,
        <a href="https://www.dsb.gv.at/">dsb.gv.at</a>.
      </p>
      <p><RouterLink to="/imprint">Impressum</RouterLink></p>
    </template>

    <template v-else>
      <h1>Privacy policy</h1>
      <p class="muted">
        As of November 2026. The
        <a href="#" @click.prevent="setLocale('de')">German version</a> is authoritative.
      </p>
      <p>
        zugx uses no cookies, no tracking, no analytics and no advertising. There are no user
        accounts. This page lists the data that is still processed for technical reasons.
      </p>

      <h2>1. Controller</h2>
      <p>
        Simon Legner, Innsbruck, Austria –
        <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>
      </p>

      <h2>2. Hosting and Cloudflare</h2>
      <p>
        The website runs on its own server in Austria (Caddy web server). The server is connected to
        the internet through a <em>Cloudflare Tunnel</em>: all requests pass through Cloudflare,
        Inc., 101 Townsend St., San Francisco, CA 94107, USA. Cloudflare processes your IP address
        and the request data (address, browser identification, time) to deliver the site and protect
        it from attacks; the encrypted connection ends at Cloudflare. Cloudflare is certified under
        the EU-US Data Privacy Framework (adequacy decision, Art. 45 GDPR). Legal basis: our
        legitimate interest in secure and available operation (Art. 6(1)(f) GDPR). More:
        <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>.
      </p>

      <h2>3. Server logs</h2>
      <p>
        The web server logs each request: time, shortened IP address (IPv4 to /24, IPv6 to /48 – the
        full address is not stored), method, requested address including parameters (e.g. station
        numbers), status code, size and duration. Browser headers and cookies are not logged. The
        logs are kept in the server's system journal (systemd), used only for troubleshooting and
        abuse prevention, and overwritten automatically depending on their size, usually after a few
        weeks. Legal basis: Art. 6(1)(f) GDPR.
      </p>

      <h2>4. Timetable queries</h2>
      <p>
        Searches for departures, connections, trains and disruptions are forwarded by our server to
        the journey planner of ÖBB-Personenverkehr AG (fahrplan.oebb.at). Only the content of the
        query is sent (e.g. stations, date, time, train number). Your IP address, cookies and
        browser headers are <strong>not</strong> passed on – ÖBB only sees our server. Station
        search runs locally in your browser first. Legal basis: Art. 6(1)(b) and (f) GDPR (providing
        the requested information).
      </p>

      <h2>5. Maps</h2>
      <p>
        When a map is shown (radar, train and connection maps, station map), your browser loads the
        map tiles directly from these services, which receive your IP address, the map area and your
        browser identification:
      </p>
      <ul>
        <li>
          OpenFreeMap (tiles.openfreemap.org) – base map,
          <a href="https://openfreemap.org/">openfreemap.org</a>
        </li>
        <li>
          OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS,
          United Kingdom (tile.openstreetmap.org) – station map,
          <a href="https://osmfoundation.org/wiki/Privacy_Policy">privacy policy</a> (UK adequacy
          decision)
        </li>
        <li>
          OpenRailwayMap (a.tiles.openrailwaymap.org) – railway layer, can be switched off on the
          map, <a href="https://www.openrailwaymap.org/">openrailwaymap.org</a>
        </li>
      </ul>
      <p>Legal basis: our legitimate interest in showing maps (Art. 6(1)(f) GDPR).</p>

      <h2>6. Storage in your browser</h2>
      <p>
        zugx stores your settings (language, colour scheme, map options) and recently searched and
        favourite stations and connections in your browser's <em>localStorage</em>. For offline use,
        a service worker keeps the app files in the browser cache. This data stays on your device
        and is not sent to us. The storage is strictly necessary for the features you use (§ 165(3)
        Austrian Telecommunications Act 2021). You can remove it at any time in your browser
        settings ("clear site data").
      </p>

      <h2>7. Location</h2>
      <p>
        Only if you choose "near me" does the browser ask for your location. It is used solely in
        your browser to find the nearest station and is neither transmitted nor stored. Legal basis:
        your consent (Art. 6(1)(a) GDPR), which you can withdraw in your browser settings.
      </p>

      <h2>8. Calendar and sharing</h2>
      <p>
        Calendar entries (.ics) and share links are created locally in your browser. You decide what
        you pass on.
      </p>

      <h2>9. Your rights</h2>
      <p>
        You have the right of access, rectification, erasure, restriction of processing, data
        portability and objection (Art. 15–21 GDPR). As we only store shortened IP addresses, we
        usually cannot link log entries to a person. Please send requests to
        <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>. You can also lodge a complaint with the
        Austrian Data Protection Authority: Barichgasse 40–42, 1030 Vienna,
        <a href="https://www.dsb.gv.at/">dsb.gv.at</a>.
      </p>
      <p><RouterLink to="/imprint">Imprint</RouterLink></p>
    </template>
  </article>
</template>
