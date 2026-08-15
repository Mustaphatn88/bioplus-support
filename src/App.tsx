import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AutomateScanner from './components/AutomateScanner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketCreation from './pages/TicketCreation';
import TicketDetail from './pages/TicketDetail';

const basename = window.location.pathname.startsWith('/bioplus-support')
  ? '/bioplus-support'
  : '/';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/automate/:id" element={<AutomateScanner />} />
            <Route path="/ticket/new" element={<TicketCreation />} />
            <Route path="/ticket/:id" element={<TicketDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}