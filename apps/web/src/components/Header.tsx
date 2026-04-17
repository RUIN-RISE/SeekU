"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="h-[60px] bg-bg-dark flex items-center px-6">
      <div className="flex items-center gap-8 w-full max-w-[1200px] mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <span className="text-xl font-english-display font-bold text-text-light">
            Seek<span className="text-accent-blue">u</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          <Link
            href="/chat"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            Copilot
          </Link>
          <Link
            href="/search"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            搜索
          </Link>
          <Link
            href="/deal-flow"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            Deal Flow
          </Link>
          <Link
            href="/admin"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            管理
          </Link>
        </nav>
      </div>
    </header>
  );
}
