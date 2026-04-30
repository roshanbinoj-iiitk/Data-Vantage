import { Navigate } from "react-router-dom";

export function RequireLaunch({ children }: { children: JSX.Element }) {
  if (typeof window === "undefined") return <Navigate to="/" replace />;
  const launched = localStorage.getItem("data-vantage-launched") === "true";
  return launched ? children : <Navigate to="/" replace />;
}

export default RequireLaunch;
