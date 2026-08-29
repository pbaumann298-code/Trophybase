import React, { useEffect } from 'react';
import { LEGAL, isLegalPlaceholder } from '../lib/legalConfig';

function Field({ value, fallback = '—' }) {
  const text = String(value ?? '').trim() || fallback;
  const todo = isLegalPlaceholder(text);
  return <span className={todo ? 'text-amber-400' : 'text-zinc-200'}>{text}</span>;
}

function LegalPageShell({ title, children, onBack }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${LEGAL.siteName}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <article className="w-full max-w-3xl min-w-0 mx-auto px-4 sm:px-6 pt-8 pb-16 box-border">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer mb-6 px-0"
      >
        ← TrophyBase
      </button>
      <h1 className="text-2xl font-bold text-white tracking-tight mb-2">{title}</h1>
      <p className="text-[11px] font-mono text-zinc-500 mb-8">
        Stand: {LEGAL.lastUpdated} · {LEGAL.siteUrl}
      </p>
      <div className="legal-prose space-y-6 text-sm text-zinc-300 leading-relaxed">{children}</div>
    </article>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function LegalNoticePage({ onBack }) {
  return (
    <LegalPageShell title="Impressum" onBack={onBack}>
      <p className="text-zinc-500 text-xs">
        Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG).
      </p>

      <Section title="Anbieter">
        <p>
          <Field value={LEGAL.name} />
          <br />
          <Field value={LEGAL.street} />
          <br />
          <Field value={LEGAL.zipCity} />
          <br />
          {LEGAL.country}
        </p>
        {LEGAL.legalForm ? <p>Rechtsform: {LEGAL.legalForm}</p> : null}
        {LEGAL.vatId ? <p>USt-IdNr.: {LEGAL.vatId}</p> : null}
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail:{' '}
          {isLegalPlaceholder(LEGAL.email) ? (
            <Field value={LEGAL.email} />
          ) : (
            <a className="text-[#00ff66] hover:underline" href={`mailto:${LEGAL.email}`}>
              {LEGAL.email}
            </a>
          )}
        </p>
        {LEGAL.phone ? (
          <p>
            Telefon:{' '}
            <a className="text-[#00ff66] hover:underline" href={`tel:${LEGAL.phone.replace(/\D/g, '')}`}>
              {LEGAL.phone}
            </a>
          </p>
        ) : null}
      </Section>

      <Section title="Registereintrag der KG">
        <p>
          Registergericht: {LEGAL.registerCourt}
          <br />
          Registernummer: {LEGAL.registerNumber}
        </p>
      </Section>

      <Section title="Vertreten durch">
        <p>
          Die {LEGAL.complementaryCompany}
          <br />
          diese vertreten durch den Geschäftsführer: {LEGAL.managingDirector}
        </p>
      </Section>

      <Section title="Registereintrag der GmbH">
        <p>
          Registergericht: {LEGAL.complementaryRegisterCourt}
          <br />
          Registernummer: {LEGAL.complementaryRegisterNumber}
        </p>
      </Section>

      <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          <Field value={LEGAL.responsibleMStV || LEGAL.name} />
          <br />
          <Field value={LEGAL.street} />
          <br />
          <Field value={LEGAL.zipCity} />
        </p>
      </Section>

      <Section title="Haftung für Inhalte und Links">
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte nach den allgemeinen Gesetzen
          verantwortlich. Für fremde Inhalte verlinkter Seiten übernehmen wir keine Gewähr. Bei
          Kenntnis von Rechtsverletzungen entfernen wir entsprechende Inhalte umgehend.
        </p>
      </Section>

      <Section title="Marken und urheberrechtlich geschützte Inhalte">
        <p>
          TrophyBase ist eine unabhängige, inoffizielle Fan-Plattform und steht in keiner
          Verbindung zu Sony Interactive Entertainment oder den jeweiligen Spieleherausgebern.
          Cover, Logos und Spieltitel dienen ausschließlich der Identifikation im
          redaktionellen und datenbankbasierten Kontext (nominative / Fair Use). Es entsteht
          kein Eindruck einer offiziellen Partnerschaft.
        </p>
      </Section>
    </LegalPageShell>
  );
}

export function PrivacyPage({ onBack, youtubeConsent, onRevokeYoutube }) {
  return (
    <LegalPageShell title="Datenschutzerklärung" onBack={onBack}>
      <p>
        Diese Erklärung informiert über die Verarbeitung personenbezogener Daten beim Besuch von{' '}
        {LEGAL.siteName} (Art. 12–14 DSGVO). TrophyBase verwendet keine Third-Party-Analytics
        (kein Google Analytics, Matomo-Cloud o. Ä.) und derzeit keine Affiliate-Cookies.
      </p>

      <Section title="1. Verantwortlicher">
        <p>
          <Field value={LEGAL.name} />
          <br />
          <Field value={LEGAL.street} />
          <br />
          <Field value={LEGAL.zipCity} />,{' '}
          {LEGAL.country}
          <br />
          E-Mail: <Field value={LEGAL.email} />
        </p>
      </Section>

      <Section title="2. Hosting und Auslieferung">
        <p>
          Die Website wird über {LEGAL.hosting} ausgeliefert. Dabei entstehen serverübliche
          Verbindungsdaten (IP-Adresse, Zeitpunkt, aufgerufene URL, User-Agent) in Server-Logs
          des Hosters. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (sichere, schnelle
          Bereitstellung).
        </p>
      </Section>

      <Section title="3. Datenbank, Konto und Spielstände">
        <p>
          Spiele-, Trophäen- und Guide-Inhalte liegen bei {LEGAL.database}. Bei Registrierung
          speichern wir E-Mail und Authentifizierungsdaten. Optional kannst du eine PSN-ID
          hinterlegen und Trophäenfortschritt synchronisieren. Community-Meldungen (Fehler im
          Guide) enthalten den gemeldeten Text und ggf. einen Account-Bezug.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag / Konto) bzw. lit. f
          (Bereitstellung des Katalogs ohne Konto).
        </p>
      </Section>

      <Section title="4. Cookies und lokale Speicherung">
        <p>Ohne Konto setzen wir nur technisch nötige Speicherung:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Sprachwahl (<span className="font-mono text-[11px]">tb_locale</span>-Cookie, 1 Jahr)
          </li>
          <li>Lokaler Trophäen- und Guide-Fortschritt (localStorage, Gerät)</li>
          <li>Anzeigeeinstellungen und YouTube-Einwilligung (localStorage)</li>
          <li>Sitzung nach Login (Supabase Auth, localStorage / Cookie des Anbieters)</li>
        </ul>
        <p>
          Beim ersten Besuch kann die ungefähre Region über den Vercel-Header{' '}
          <span className="font-mono text-[11px]">x-vercel-ip-country</span> gelesen werden, um
          eine Sprache vorzuschlagen. Die Angabe wird nicht zu Profilen zusammengeführt.
        </p>
      </Section>

      <Section title="5. YouTube und sonstige Dritte">
        <p>
          Als Vorschau laden wir Standbilder vom YouTube-Bild-CDN (i.ytimg.com), ohne den
          Player und ohne YouTube-Cookies. Guide-Videos selbst werden erst nach Einwilligung
          als Embed geladen (privacy-enhanced: youtube-nocookie.com). Dann kann Google
          (YouTube LLC, USA) Cookies setzen und Nutzungsdaten erhalten. Rechtsgrundlage:
          Art. 6 Abs. 1 lit. a DSGVO, § 25 TDDDG.
        </p>
        <p>
          Ausgehende Links zu YouTube (ohne Embed) laden Google-Inhalte erst auf der
          YouTube-Seite.
        </p>
        <p>
          Affiliate- oder Tracking-Cookies setzen wir derzeit nicht. Sobald sich das ändert,
          aktualisieren wir diese Erklärung und holen eine gesonderte Einwilligung ein.
        </p>
        <p className="text-zinc-400">
          YouTube-Embeds bei dir:{' '}
          <strong className="text-zinc-200">{youtubeConsent ? 'erlaubt' : 'nicht geladen'}</strong>
          {youtubeConsent ? (
            <>
              {' · '}
              <button
                type="button"
                onClick={onRevokeYoutube}
                className="text-[#00ff66] hover:underline bg-transparent border-none cursor-pointer p-0 text-sm"
              >
                Einwilligung widerrufen
              </button>
            </>
          ) : null}
        </p>
      </Section>

      <Section title="6. Progressive Web App">
        <p>
          Optional kann die Seite als App installiert werden. Ein Service Worker speichert nur
          statische Dateien (Layout, Scripts, Icons) und eine Offline-Hinweisseite. Zugriffe auf
          die Spiele-Datenbank werden nicht aus diesem Cache bedient.
        </p>
      </Section>

      <Section title="7. Speicherdauer">
        <p>
          Kontodaten bleiben bis zur Löschung des Accounts gespeichert. Server-Logs beim Hoster
          richten sich nach dessen Löschfristen. Lokale Fortschrittsdaten bleiben, bis du sie im
          Browser löschst.
        </p>
      </Section>

      <Section title="8. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit
          und Widerspruch (Art. 15–21 DSGVO) sowie das Recht, Einwilligungen mit Wirkung für die
          Zukunft zu widerrufen. Außerdem kannst du dich bei einer Aufsichtsbehörde beschweren.
        </p>
        <p>
          Zuständige Behörde: <Field value={LEGAL.supervisoryAuthority} />
        </p>
      </Section>

      <Section title="9. Pflicht zur Bereitstellung">
        <p>
          Ohne die technisch nötige Verarbeitung (Hosting, Auslieferung der Seite) ist ein Besuch
          nicht möglich. Konto und PSN-Anbindung sind freiwillig.
        </p>
      </Section>
    </LegalPageShell>
  );
}
