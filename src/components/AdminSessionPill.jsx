import { isAdminUser } from '../lib/adminAccess';
import { setAdminOverlaysHidden } from '../lib/adminOverlayPreference';
import { useHideAdminOverlays } from '../lib/useAdminChrome';

/**
 * Bleibt sichtbar, solange eine Admin-Session existiert – auch in der Gast-Simulation.
 */
function AdminSessionPill({ sessionUser }) {
  const guestSimulation = useHideAdminOverlays();
  const realAdmin = isAdminUser(sessionUser, {
    allowPublic: true,
    ignoreGuestSimulation: true,
  });
  if (!realAdmin) return null;

  if (!guestSimulation) {
    return (
      <div className="tb-admin-session" role="status">
        <span>🔧 ADMIN AKTIV</span>
        <button
          type="button"
          onClick={() => setAdminOverlaysHidden(true)}
        >
          👁️ Gast-Ansicht simulieren
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="tb-admin-session tb-admin-session--guest"
      onClick={() => setAdminOverlaysHidden(false)}
      title="Admin-Ansicht wieder einschalten"
    >
      👁️ GAST-SIMULATION (Admin eingeloggt)
    </button>
  );
}

export default AdminSessionPill;
