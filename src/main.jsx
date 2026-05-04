import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase/firebase";
import PublicSite from "./pages/PublicSite";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import "./styles/global.css";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">Nomad Lights</div>
      <div className="loading-spinner" />
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(window.location.hash || "#/");
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const handler = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  if (route === "#/admin") {
    if (checking) return <LoadingScreen />;
    return user ? <Admin user={user} /> : <Login />;
  }

  return <PublicSite />;
}

createRoot(document.getElementById("root")).render(<App />);
