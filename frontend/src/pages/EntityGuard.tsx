import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ROUTES, isEntityPathKey } from '../routes/paths';

export function EntityGuard({ children }: { children: React.ReactNode }) {
  const { entity } = useParams();
  if (!isEntityPathKey(entity)) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <>{children}</>;
}
