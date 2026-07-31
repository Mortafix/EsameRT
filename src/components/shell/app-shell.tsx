"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpenText,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NewSimulationLink } from "@/components/quiz/new-simulation-link";
import styles from "./app-shell.module.css";

type SessionUser = {
  id: string;
  name?: string;
  displayName?: string;
  role: "user" | "admin";
};

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/studia", label: "Studia", icon: BookOpenText },
  { href: "/storico", label: "Storico", icon: History },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ user?: SessionUser } | SessionUser>("/api/auth/me")
      .then((payload) => {
        if (!active) return;
        const nextUser =
          "user" in payload && payload.user ? payload.user : (payload as SessionUser);
        setUser(nextUser);
      })
      .catch(() => router.replace("/login"));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMenuOpen(false);
      setProfileOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const links = useMemo(
    () =>
      user?.role === "admin"
        ? [
            ...navigation,
            { href: "/admin", label: "Admin", icon: ShieldCheck },
          ]
        : navigation,
    [user?.role],
  );
  const userLabel = user?.displayName ?? user?.name ?? "Caricamento…";

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={cn("page-shell", styles.headerInner)}>
          <Link href="/dashboard" className={styles.brand} aria-label="RT Lab home">
            <span className={styles.logo} aria-hidden>
              <Image
                src="/favicon-96x96.png"
                alt=""
                width={43}
                height={43}
                priority
                unoptimized
              />
            </span>
            <span>
              <strong>RT Lab</strong>
              <small>Responsabile Tecnico</small>
            </span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Navigazione principale">
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(styles.navLink, active && styles.navLinkActive)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>

          <NewSimulationLink className={styles.newQuiz}>
            <Plus size={16} aria-hidden />
            Inizia prova
          </NewSimulationLink>

          <div className={styles.profile}>
            <button
              type="button"
              className={styles.profileButton}
              onClick={() => setProfileOpen((value) => !value)}
              aria-expanded={profileOpen}
            >
              <span className={styles.avatar} aria-hidden>
                {userLabel === "Caricamento…"
                  ? "•"
                  : userLabel.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.profileCopy}>
                <strong>{userLabel}</strong>
                <small>{user?.role === "admin" ? "Amministratore" : "Studente"}</small>
              </span>
              <ChevronDown size={15} aria-hidden />
            </button>
            {profileOpen ? (
              <div className={styles.profileMenu}>
                {user?.role === "admin" ? (
                  <Link href="/admin">
                    <Settings2 size={16} aria-hidden /> Gestisci RT Lab
                  </Link>
                ) : null}
                <button type="button" onClick={logout}>
                  <LogOut size={16} aria-hidden /> Esci
                </button>
              </div>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={styles.mobileToggle}
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>
        </div>
      </header>

      {menuOpen ? (
        <div className={styles.mobileMenu}>
          <nav className="page-shell" aria-label="Navigazione mobile">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Icon size={19} aria-hidden />
                {label}
              </Link>
            ))}
            <button type="button" onClick={logout}>
              <LogOut size={19} aria-hidden />
              Esci
            </button>
          </nav>
        </div>
      ) : null}

      <main className={styles.main}>{children}</main>

      <nav className={styles.bottomNav} aria-label="Navigazione rapida">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={active ? styles.bottomNavActive : undefined}
            >
              <Icon size={20} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
