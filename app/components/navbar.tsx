'use client';

import Link from "next/link";
import AuthButton from "./authButton";

export default function Navbar() {
  return (
    <header className="border-b border-gray-200 bg-white shadow-2xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-gray-900 hover:text-blue-600 transition"
          >
            The Humor Project
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Home
            </Link>
            <Link
              href="/memes"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Memes
            </Link>
            <Link
              href="/profile"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Profile
            </Link>
            <Link
              href="/upload"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Upload
            </Link>
            <Link
              href="/my-images"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              My Images
            </Link>
          </nav>
        </div>

        <div className="flex items-center">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
