/**
 * Angaben für Impressum (§ 5 DDG) und Datenschutz.
 * Werte in eckigen Klammern sind Platzhalter — vor dem Livegang ersetzen.
 *
 * Noch von dir auszufüllen:
 * - name, street, zipCity, email (Pflicht)
 * - phone (optional, aber empfohlen)
 * - legalForm / registerCourt / registerNumber / vatId nur wenn Firma/GmbH/USt-IdNr.
 * - responsibleMStV nur wenn abweichend vom Anbieter
 * - supervisoryAuthority = Landes-Datenschutzbehörde (nicht BfDI)
 */
export const LEGAL = {
  siteName: 'TrophyBase.app',
  siteUrl: 'https://trophybase.app',
  lastUpdated: '2026-08-20',

  name: '[Vor- und Nachname bzw. vollständige Firma]',
  street: '[Straße und Hausnummer]',
  zipCity: '[PLZ Ort]',
  country: 'Deutschland',
  email: '[E-Mail-Adresse]',
  phone: '',

  /** Nur bei Kapitalgesellschaften / eingetragenen Firmen */
  legalForm: '',
  registerCourt: '',
  registerNumber: '',
  vatId: '',

  /** Verantwortliche Person nach § 18 Abs. 2 MStV; leer = wie name */
  responsibleMStV: '',

  /** Zuständige Landesbehörde, nicht der BfDI (der ist nur Bund) */
  supervisoryAuthority: '[Zuständige Datenschutz-Aufsichtsbehörde des Bundeslands]',

  hosting:
    'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA (Auslieferung über CDN; AV-Vertrag / DPF bzw. SCC beim Anbieter prüfen)',
  database: 'Supabase Inc., Projektregion Frankfurt (eu-central-1)',
};

export function isLegalPlaceholder(value) {
  const raw = String(value ?? '').trim();
  return !raw || (raw.startsWith('[') && raw.endsWith(']'));
}

export const TRADEMARK_DISCLAIMER =
  'TrophyBase is an independent, non-official fan platform. PlayStation, PS5, PS4 and PlayStation Network are registered trademarks or trademarks of Sony Interactive Entertainment Inc. All game titles, logos, artwork and associated trademarks are property of their respective owners (e.g. Ubisoft, Capcom, Electronic Arts).';
