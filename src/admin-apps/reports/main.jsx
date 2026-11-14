import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import AdminPushControl from '../AdminPushControl';
import CommunityReportsPanel from '../../components/admin/CommunityReportsPanel';

export function ReportsMicroAppBody({ sessionUser }) {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }
    const onSwMessage = (event) => {
      if (event.data?.type === 'TB_PUSH_RECEIVED') {
        setRefreshKey((prev) => prev + 1);
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, []);

  return (
    <div className="space-y-4">
      <AdminPushControl
        sessionUser={sessionUser}
        appTitle="TB Reports"
        variant="banner"
      />
      <CommunityReportsPanel key={refreshKey} />
    </div>
  );
}

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="reports">
      {({ sessionUser }) => <ReportsMicroAppBody sessionUser={sessionUser} />}
    </AdminMicroAppShell>
  </StrictMode>,
);
