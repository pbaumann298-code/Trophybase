import ProfilePage from '../pages/ProfilePage';

/**
 * V2 UserHubDrawer / Userbereich-Komponente:
 * Kapselt den umgebauten Userbereich (Sprachauswahl mit Multi-Select `preferred_locales`,
 * 3-stufige Bibliothek Watchlist -> Angefangen -> Fertige Spiele, interaktive Platin-Trophäenliste
 * aus `game_achievements` und Platin-Bewertung mit "Senden"-Button ohne Inbox).
 */
export default function UserHubDrawer(props) {
  return <ProfilePage {...props} />;
}
