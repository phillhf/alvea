import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { Permission, useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({
  children,
  permission,
  anyOf,
}: {
  children: ReactNode;
  permission?: Permission;
  anyOf?: Permission[];
}) {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission) && !can("verwaltung")) {
    return <div className="p-8 text-status-danger">403 · Kein Zugriff</div>;
  }
  if (anyOf && !anyOf.some(p => can(p)) && !can("verwaltung")) {
    return <div className="p-8 text-status-danger">403 · Kein Zugriff</div>;
  }
  return <>{children}</>;
}
