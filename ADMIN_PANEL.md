# Super Admin Control Suite Documentation

## Overview

The Super Admin Control Suite at [`/admin`](file:///Users/anthony/Documents/Repositories/the-humor-project/app/admin/page.tsx) is a centralized, role-protected administrative dashboard for **JokeWorks**.

Access is verified via the `is_super_admin` boolean flag on the authenticated user's `public.profiles` record. Verified super admins receive an exclusive `🛡️ Admin` pill in the persistent navigation bar.

---

## Architecture Rework Status

The admin panel and prompt chains/AI pipelines are undergoing an architectural redesign. The database tables previously supporting experimental chains, providers, terms, logs, and domain restrictions have been decommissioned:

| Capability | Database Table | Status | Current Admin Panel Behavior |
|---|---|---|---|
| **Users** | `public.profiles` | **Active** | Inspect registered users, IDs, emails, signup dates, and toggle Super Admin status. |
| **Images CRUD** | `public.images` & Storage | **Active** | Upload images directly, trigger Gemini AI multimodal summarization, edit descriptions inline, and delete images with cascading cleanup. |
| **AI Media** | `public.memes` | **Active** | Browse community memes, view like counts, and moderate inappropriate media. |
| **Prompt Chains** | `public.prompt_chains` | **Deleted** | Placeholder tab with planned DAG pipeline architecture. |
| **Prompt Chain Steps** | `public.prompt_chain_steps` | **Deleted** | Placeholder tab. |
| **Prompt Chain Mix** | `public.prompt_chain_mix` | **Deleted** | Placeholder tab. |
| **AI Generation Examples** | `public.ai_generation_examples` | **Deleted** | Placeholder tab. |
| **LLM Models** | `public.llm_models` | **Deleted** | Placeholder tab with planned multi-provider registry. |
| **LLM Providers** | `public.llm_providers` | **Deleted** | Placeholder tab. |
| **Terms Glossary** | `public.terms` | **Deleted** | Placeholder tab with planned vocabulary injection. |
| **Generation Requests** | `public.generation_requests` | **Deleted** | Placeholder tab with planned telemetry and trace observability. |
| **LLM Responses** | `public.llm_responses` | **Deleted** | Placeholder tab. |
| **Allowed Signup Domains** | `public.allowed_signup_domains` | **Deleted** | Placeholder tab with planned RBAC and domain policies. |
| **Whitelisted Emails** | `public.whitelisted_emails` | **Deleted** | Placeholder tab. |

---

## Responsive Navigation & Viewport Layout

The admin dashboard adapts between desktop and narrow/mobile viewports:

- **Desktop (`lg:`) Pinned Collapsible Sidebar**:
  - Pinned to the left in the document flow (`lg:sticky lg:top-3`).
  - Toggle button (`◀` / `▶`) collapses the sidebar into an icon-only rail (`lg:w-16`) or expands to full width (`lg:w-64 xl:w-72`).
  - Collapsed state persists in browser `localStorage` under `humor_admin_sidebar_collapsed`.
  - Icon-only rail mode displays accessible native tooltips for every navigation item and system status.
- **Narrow / Mobile (`< lg`) Separate Drawer**:
  - The sidebar is removed from the normal vertical document flow, allowing 100% of the screen width and height to be dedicated to the content without pushing it down.
  - Acts as a separate off-canvas slide-over drawer (`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]`) with a dimmed backdrop.
  - Can be opened via the header **`☰ Menu: [Active Tab]`** button or the floating **`☰ Admin Menu`** action pill in the bottom-left corner.
  - Selecting any tab automatically switches views and closes the drawer. Can also be dismissed via the `✕` close button, backdrop click, or `Escape` key.
- **Full Vertical Height Overview**:
  - On desktop, the Overview tab is constrained to `lg:h-[calc(100dvh-7.5rem)]`, ensuring that all 4 panels stretch to fill the remaining vertical viewport height in a 2x2 grid (`lg:grid-cols-2 lg:grid-rows-2 lg:grid-flow-col`) without vertical page scrolling.
  - On mobile, panels adapt to a single-column layout so mobile users can scroll down through stats and leaderboard cleanly.

### Navigation Tabs

1. **📊 Overview**: Full-height, single-screen platform KPIs and live analytics:
   - **Top KPI Metrics Strip (4 Core Cards)**: Quick figures for Profiles, Image Assets, Generated Memes, and Community Likes.
   - **📈 Content Creation Velocity (7-Day Dual Bar Chart)**: Daily comparison of image uploads vs AI meme generations over the last 7 calendar days, dynamically expanding vertically to fill panel height.
   - **🎯 Platform Conversion Funnel**: 3-stage lifecycle visualization (Uploaded Images ➔ Converted to AI Memes ➔ Liked & Engaged by Community).
   - **🏆 Top Memes Community Leaderboard**: Compact ranking of top 3 community memes with like counts and previews.
   - **⚙️ System Infrastructure & Status**: Operational status of profiles, image storage, community memes, and active rework notices.
2. **👥 Users**: Read all profiles and manage user permissions.
3. **🖼️ Images CRUD**: Full image lifecycle management:
   - **Upload Image Modal**: Upload local files to the `images` bucket, record in `public.images`, and trigger Gemini summarization.
   - **Inline Edit**: Edit descriptions / AI summaries on any image.
   - **Cascade Delete**: Hard delete any image with full storage and meme cleanup.
   - **✨ Gemini Trigger**: One-click generation or re-generation of multimodal summaries.
4. **🎭 AI Generated Media**: View community memes, inspect captions, like totals, and moderate inappropriate media.
5. **⛓️ Prompt Chains & Mix (Placeholder)**: Information and upcoming capabilities for DAG pipelines and routing mix.
6. **🤖 LLM Models & Providers (Placeholder)**: Information and upcoming capabilities for multi-provider registry.
7. **📖 Terms (Placeholder)**: Information and upcoming capabilities for humor taxonomy and glossary injection.
8. **📜 AI Requests & Logs (Placeholder)**: Information and upcoming capabilities for distributed tracing and observability.
9. **🔐 Access Control (Placeholder)**: Information and upcoming capabilities for RBAC and domain governance.

---

## API Endpoints Reference

- `GET /admin` – Protected dashboard page.
- `PATCH /api/admin/users` – Updates `is_super_admin` with anti-lockout safeguards.
- `DELETE /api/memes` – Super admin override to permanently delete any meme.
- `DELETE /api/images` – Super admin override to delete any image and cascade across storage and memes.
- `POST /api/images/summarize` – Multimodal Gemini AI summarization pipeline.
