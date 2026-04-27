"use client";

import Link from "next/link";

export function HomeTopbar() {
  return (
    <div className="home-topbar-wrapper">
      <header className="home-topbar">
        <Link href="/" style={{ textDecoration: "none", display: "inline-flex" }}>
          <span className="home-topbar-logo" aria-label="Nexus">
            nexus<span className="home-logo-dot">.</span>
          </span>
        </Link>
        <Link href="/login" className="btn btn-primary home-topbar-cta">
          Join us
        </Link>
      </header>
    </div>
  );
}

