import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import IntranetCreators from '../../components/intranet/IntranetCreators';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="creators">
      <IntranetCreators />
    </AdminMicroAppShell>
  </StrictMode>,
);
