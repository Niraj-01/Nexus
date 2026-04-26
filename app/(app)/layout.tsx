"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { signOut as firebaseSignOut } from "firebase/auth";
import { Home, Ticket, User, LogOut, ChevronDown, Menu, X, Shield } from "lucide-react";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const { user, loading, claims } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="auth-shell">
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  const isAdmin = claims?.role === "PLATFORM_ADMIN";

  const navLinks = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Tickets",   href: "/tickets",   icon: Ticket },
    { name: "Org Profile", href: "/profile", icon: User },
    ...(isAdmin ? [{ name: "Admin", href: "/admin/organizations", icon: Shield }] : []),
  ];

  const handleSignOut = async () => {
    await firebaseSignOut(auth);
    router.push("/login");
  };

  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user.email?.charAt(0).toUpperCase() ?? "U");

  return (
    <div className="app-shell-top">
      {/* ── Top Navigation Bar ── */}
      <header className="app-topnav">
        <div className="app-topnav-inner">

          {/* Logo */}
          <Link href="/dashboard" className="app-topnav-logo">
            NEXUS<span className="home-logo-dot">.</span>
          </Link>

          {/* Nav Links — desktop */}
          <nav className="app-topnav-links">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/");
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`app-topnav-link${isActive ? " is-active" : ""}`}
                >
                  <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                  {link.name}
                </Link>
              );
            })}
          </nav>

          {/* Right side: user pill + hamburger */}
          <div className="app-topnav-right">
            {/* User dropdown */}
            <div className="app-topnav-user-wrap">
              <button
                className="app-topnav-user-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="app-topnav-avatar">{initials}</div>
                <span className="app-topnav-user-name">
                  {user.displayName ?? user.email?.split("@")[0] ?? "Account"}
                </span>
                <ChevronDown size={14} strokeWidth={2} className={`app-topnav-chevron${userMenuOpen ? " is-open" : ""}`} />
              </button>

              {userMenuOpen && (
                <div className="app-topnav-dropdown">
                  <div className="app-topnav-dropdown-user">
                    <span className="app-topnav-dropdown-name">
                      {user.displayName ?? "User"}
                    </span>
                    <span className="app-topnav-dropdown-email">{user.email}</span>
                  </div>
                  <div className="app-topnav-dropdown-divider" />
                  <button onClick={handleSignOut} className="app-topnav-dropdown-item">
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="app-topnav-hamburger"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileMenuOpen && (
          <div className="app-topnav-mobile-menu">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/");
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`app-topnav-mobile-link${isActive ? " is-active" : ""}`}
                >
                  <Icon size={16} />
                  {link.name}
                </Link>
              );
            })}
            <div className="app-topnav-dropdown-divider" style={{ margin: "8px 0" }} />
            <button onClick={handleSignOut} className="app-topnav-mobile-link" style={{ color: "var(--color-muted)" }}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* ── Page Content ── */}
      <main className="app-main-top">
        <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%", padding: "40px 24px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
