# The Humor Project

A modern web application built with [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), and [Supabase](https://supabase.com/) for PostgreSQL database storage and Google OAuth authentication.

---

## Features

- **Database Integration (Supabase)**: Server-side querying of Supabase database tables (e.g. character data from the `sample` table) rendered into a structured table view on the home page.
- **Google OAuth Authentication**: Seamless single sign-on using Google OAuth powered by Supabase Auth (`supabase.auth.signInWithOAuth`).
- **OAuth Callback Pipeline**:
  - Client callback listener (`/auth/callback`) to parse OAuth access tokens from URL parameters and hash fragments.
  - Server Route Handler (`/auth/v1/callback`) to securely persist access tokens into HTTP-only cookies.
- **Protected Profile Page**: Client-side session verification on `/profile` displaying user account details (email) with sign-out functionality.
- **SSR & Client Supabase Helpers**: Structured `@supabase/ssr` helper utilities for server components, client components, and middleware session synchronization.

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router)
- **Frontend**: [React](https://react.dev/) 19 & [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **Backend & Auth**: [Supabase](https://supabase.com/) (`@supabase/supabase-js`, `@supabase/ssr`)
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## Project Structure

```text
the-humor-project/
├── app/
│   ├── auth/
│   │   ├── callback/
│   │   │   └── page.tsx           # Client-side OAuth callback parser & redirector
│   │   └── v1/
│   │       └── callback/
│   │           └── route.ts       # POST/GET Route Handler managing auth cookies
│   ├── components/
│   │   └── login.tsx              # Google OAuth login button component
│   ├── profile/
│   │   └── page.tsx               # Protected profile page with sign-out
│   ├── supabase/
│   │   └── supabaseClient.ts      # Standard Supabase JS client instance
│   ├── globals.css                # Global stylesheet & Tailwind CSS imports
│   ├── layout.tsx                 # Root layout with Geist font setup
│   └── page.tsx                   # Home page displaying Supabase data & login button
├── utils/
│   └── supabase/
│       ├── client.ts              # Browser client utility (@supabase/ssr)
│       ├── middleware.ts          # Middleware session cookie helper (@supabase/ssr)
│       └── server.ts              # Server component client utility (@supabase/ssr)
├── public/                        # Static assets & icons
├── .env.example                   # Example environment variable template
├── .env.local                     # Local environment variables (untracked)
├── package.json                   # Project scripts and dependencies
└── tsconfig.json                  # TypeScript configuration
```

---

## Environment Variables

Create a `.env.local` file in the root directory (refer to `.env.example`):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key

# Google OAuth Configuration (configured in Supabase Dashboard)
SUPABASE_AUTH_GOOGLE_CLIENT_ID=your-google-client-id
SUPABASE_AUTH_GOOGLE_SECRET=your-google-client-secret
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20 or higher recommended)
- [pnpm](https://pnpm.io/) (version 9 or higher; project configured with `pnpm@11.14.0`)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd the-humor-project
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. Run the development server:
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the Next.js development server on [http://localhost:3000](http://localhost:3000) |
| `pnpm build` | Builds the application for production |
| `pnpm start` | Runs the compiled production build |
| `pnpm lint` | Runs ESLint to check for code quality and syntax issues |

---

## Authentication Workflow

1. **Initiate Sign-In**: Clicking **Log In** in [`LogInButton`](app/components/login.tsx) calls `supabase.auth.signInWithOAuth` using the Google provider and redirects to Google's authentication page.
2. **Handle Callback**: Once authorized, the user is redirected to [`/auth/callback`](app/auth/callback/page.tsx). The callback page retrieves the access token from the URL search parameters or hash fragment.
3. **Persist Session**: The callback page sends a POST request with the access token to [`/auth/v1/callback`](app/auth/v1/callback/route.ts), which stores the token in a secure, HTTP-only cookie (`supabase_access_token`).
4. **Profile Check & Prompt**: The callback page checks `public.profiles` for `first_name` and `last_name`. If either is missing, it prompts the user to submit their first and last name, updating `public.profiles`.
5. **Access Profile**: Once profile verification is complete, the user is redirected as normal to [`/profile`](app/profile/page.tsx) where their first name, last name, and email are displayed alongside a **Sign Out** button. If unauthenticated, access is denied.
