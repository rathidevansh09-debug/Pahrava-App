import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CloudGate } from './components/CloudGate';
import { Shell } from './components/Shell';
import { CLOUD } from './data/cloud-config';
import { startBackground } from './data/store';
import { Broadcasts } from './pages/Broadcasts';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { ExhibitorProfile } from './pages/ExhibitorProfile';
import { Exhibitors } from './pages/Exhibitors';
import { FollowUps } from './pages/FollowUps';
import { LayoutEditor } from './pages/LayoutEditor';
import { Ledger } from './pages/Ledger';
import { Settings } from './pages/Settings';
import { StallMap } from './pages/StallMap';
import { VisitorRegister } from './pages/VisitorRegister';
import { WhatsAppDemo } from './pages/WhatsAppDemo';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function StaffApp() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Events />} />
        <Route path="/e/:eventId" element={<Dashboard />} />
        <Route path="/e/:eventId/map" element={<StallMap />} />
        <Route path="/e/:eventId/ledger" element={<Ledger />} />
        <Route path="/e/:eventId/layout" element={<LayoutEditor />} />
        <Route path="/exhibitors" element={<Exhibitors />} />
        <Route path="/exhibitors/:id" element={<ExhibitorProfile />} />
        <Route path="/follow-ups" element={<FollowUps />} />
        <Route path="/broadcasts" element={<Broadcasts />} />
        <Route path="/whatsapp" element={<WhatsAppDemo />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  useEffect(() => startBackground(), []);
  useEffect(() => {
    if (CLOUD) void import('./data/cloud').then((m) => m.startCloud());
  }, []);
  return (
    <CloudGate>
      <HashRouter>
        <ScrollTop />
        <Routes>
          <Route path="/register" element={<VisitorRegister />} />
          <Route path="/*" element={<StaffApp />} />
        </Routes>
      </HashRouter>
    </CloudGate>
  );
}
