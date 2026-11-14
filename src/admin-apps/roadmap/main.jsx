import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import IntranetRoadmap from '../../components/intranet/IntranetRoadmap';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="roadmap">
      <IntranetRoadmap />
    </AdminMicroAppShell>
  </StrictMode>,
);
