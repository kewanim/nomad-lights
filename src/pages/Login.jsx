import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Camera } from "lucide-react";
import { auth } from "../firebase/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setStatus("Incorrect email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <Camera size={28} strokeWidth={1.5} color="#1d1d1f" />
        <p className="section-label" style={{ marginBottom: 4, marginTop: 16 }}>
          Private Area
        </p>
        <h1>Nomad Lights Admin</h1>
        <p>
          Only the owner can upload or manage photos. Public visitors see the
          portfolio only.
        </p>

        <div className="form-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="form-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            autoComplete="current-password"
          />
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {status && <p className="login-status">{status}</p>}

        <a href="#/" className="back-link">
          ← Back to website
        </a>
      </form>
    </main>
  );
}
