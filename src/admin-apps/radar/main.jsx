import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import IntranetRadarAndServertot from '../../components/intranet/IntranetRadarAndServertot';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="radar">
      {({ sessionUser, openInDrafts }) => (
        <IntranetRadarAndServertot
          mode="d_freigabe"
          sessionUser={sessionUser}
          onOpenInDrafts={openInDrafts}
        />
      )}
    </AdminMicroAppShell>
  </StrictMode>,
);
