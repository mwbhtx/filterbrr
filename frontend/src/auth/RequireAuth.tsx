import { Navigate } from 'react-router-dom';
import { getIdToken } from './auth';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  return getIdToken() ? <>{children}</> : <Navigate to="/login" replace />;
}
