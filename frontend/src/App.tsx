import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getAuthToken } from './apiCrud';
import MissionApp from './MissionApp';
import LoginPage from './LoginPage';
import { ROUTES } from './routes/paths';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getAuthToken()) {
    return <Navigate to={ROUTES.login} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Navigate to={ROUTES.dashboard} replace />
            </RequireAuth>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <MissionApp />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
