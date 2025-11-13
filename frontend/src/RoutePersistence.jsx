import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function RoutePersistence() {
  const location = useLocation();
  useEffect(() => {
    try {
      const value = location.pathname + (location.search || "") + (location.hash || "");
      localStorage.setItem("lastRoute", value);
    } catch (e) {
      // ignore storage errors
    }
  }, [location]);
  return null;
}

