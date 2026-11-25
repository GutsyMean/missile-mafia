"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import wow from "@/components/wow/wow.module.css";
import { SECTIONS } from "@/lib/site";
import styles from "./site.module.css";

/** The bar across the top of every page: the guild's name, its sections, and the way in for members. */
export function SiteHeader() {
  const pathname = usePathname();
  const inView = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className={styles.header}>
      <a className={styles.skip} href="#main">
        Skip to the page
      </a>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand} aria-label="Missile Mafia HQ, home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.crest} src="/icon.png" alt="" width={40} height={40} />
          <span className={styles.wordmark}>
            Missile Mafia <span>HQ</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Sections">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={styles.tab}
              aria-current={inView(section.href) ? "page" : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
        {/* Which of the two shows is decided in the visitor's browser: see lib/account-marker. */}
        <Link href="/admin" className={`${wow.button} ${styles.account}`}>
          <span className={styles.newVisitor}>Become a Crafter</span>
          <span className={styles.returning}>My characters</span>
        </Link>
      </div>
    </header>
  );
}
