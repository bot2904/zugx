<script setup lang="ts">
// Impressum / Offenlegung (§ 25 MedienG, § 5 ECG). German is authoritative; English as a courtesy.
import { useI18n } from "vue-i18n";
import { setLocale } from "../i18n/index.ts";
const { locale } = useI18n();
const EMAIL = "simon.legner@gmail.com";
</script>

<template>
  <article class="legal max-w-3xl">
    <template v-if="locale === 'de'">
      <h1>Impressum</h1>
      <p>Offenlegung gemäß § 25 Mediengesetz und Informationen gemäß § 5 E-Commerce-Gesetz</p>
      <h2>Medieninhaber und Betreiber</h2>
      <p>
        Simon Legner<br />
        Innsbruck, Österreich<br />
        E-Mail: <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>
      </p>
      <h2>Grundlegende Richtung</h2>
      <p>
        zugx ist eine private, nicht-kommerzielle Website mit Fahrplan- und Echtzeitinformationen zu
        Zügen in Österreich. Es gibt keine Werbung und keine Bezahlfunktionen.
      </p>
      <h2>Keine Verbindung zur ÖBB</h2>
      <p>
        zugx ist kein Angebot der ÖBB-Personenverkehr AG oder anderer Verkehrsunternehmen. Die Daten
        stammen aus der Fahrplanauskunft der ÖBB (inoffizielle Schnittstelle) und aus offenen
        Fahrplandaten (<a href="https://data.oebb.at/">data.oebb.at</a>, CC BY 4.0). Angaben ohne
        Gewähr – verbindlich sind die Informationen des jeweiligen Verkehrsunternehmens.
      </p>
      <h2>Haftung für Links</h2>
      <p>
        Für die Inhalte verlinkter externer Websites sind ausschließlich deren Betreiber
        verantwortlich.
      </p>
      <h2>Quellcode</h2>
      <p>
        Der Quellcode ist unter der AGPL-3.0 auf
        <a href="https://github.com/simon04/zugx">GitHub</a> veröffentlicht.
      </p>
      <p><RouterLink to="/privacy">Datenschutzerklärung</RouterLink></p>
    </template>
    <template v-else>
      <h1>Imprint</h1>
      <p>
        Disclosure according to § 25 Austrian Media Act (MedienG) and § 5 Austrian E-Commerce Act
        (ECG). The <a href="#" @click.prevent="setLocale('de')">German version</a> is authoritative.
      </p>
      <h2>Owner and operator</h2>
      <p>
        Simon Legner<br />
        Innsbruck, Austria<br />
        Email: <a :href="`mailto:${EMAIL}`">{{ EMAIL }}</a>
      </p>
      <h2>Purpose</h2>
      <p>
        zugx is a private, non-commercial website with timetable and realtime information on trains
        in Austria. There is no advertising and nothing to buy.
      </p>
      <h2>Not affiliated with ÖBB</h2>
      <p>
        zugx is not a service of ÖBB-Personenverkehr AG or any other transport operator. Data comes
        from the ÖBB journey planner (unofficial interface) and open timetable data (<a
          href="https://data.oebb.at/"
          >data.oebb.at</a
        >, CC BY 4.0). No guarantee of accuracy – the operator's information is binding.
      </p>
      <h2>External links</h2>
      <p>The operators of linked external websites are solely responsible for their content.</p>
      <h2>Source code</h2>
      <p>
        The source code is published under the AGPL-3.0 on
        <a href="https://github.com/simon04/zugx">GitHub</a>.
      </p>
      <p><RouterLink to="/privacy">Privacy policy</RouterLink></p>
    </template>
  </article>
</template>
