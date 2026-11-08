/**
 * Angaben für Impressum (§ 5 DDG) und Datenschutz.
 *
 * supervisoryAuthority = Landes-Datenschutzbehörde (Sachsen, Sitz Dresden).
 */
export const LEGAL = {
  siteName: 'TrophyBase.app',
  siteUrl: 'https://trophybase.app',
  lastUpdated: '2026-11-08',

  name: 'TrophyBase GmbH & Co. KG',
  street: 'Adolfstraße 1',
  zipCity: '01139 Dresden',
  country: 'Deutschland',
  email: 'info@trophybase.app',
  supportEmail: 'support@trophybase.app',
  creatorEmail: 'creator@trophybase.app',
  phone: '', // Bewusst leer: blendet die Telefonzeile im Impressum automatisch aus

  legalForm: 'GmbH & Co. KG',
  registerCourt: 'Amtsgericht Dresden',
  registerNumber: 'HRA 12564',
  vatId: '', // Wird erst eingetragen, sobald die DE-USt-IdNr. vom BZSt vorliegt

  complementaryCompany: 'TrophyBase Verwaltungs GmbH',
  complementaryRegisterCourt: 'Amtsgericht Dresden',
  complementaryRegisterNumber: 'HRB 48328',
  managingDirector: 'Philipp Baumann',

  /** Verantwortliche Person nach § 18 Abs. 2 MStV */
  responsibleMStV: 'Philipp Baumann',

  supervisoryAuthority:
    'Sächsischer Datenschutzbeauftragter, Devrientstraße 5, 01067 Dresden',

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
