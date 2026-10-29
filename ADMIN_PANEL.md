# Super Admin Control Panel Documentation

## Overview

The Super Admin Control Panel (`/admin`) is a centralized administrative suite for **The Humor Project**. It provides privileged platform oversight, real-time analytics, Gemini AI diagnostic capabilities, user role management, and global content moderation.

Access is strictly protected and conditionally rendered in the persistent navigation bar based on the `is_super_admin` boolean flag on the authenticated user's `public.profiles` record.

---

## Access Control & Security Architecture

- **Database Flag**: `public.profiles.is_super_admin` (`BOOLEAN DEFAULT false`).
- **Row Level Security (RLS)**:
  - Database policies grant users with `is_super_admin = true` full read, update, and delete access across `profiles`, `images`, `memes`, `meme_ratings`, and `sample`.
  - Standard users can only view their own profile and edit/delete content they personally uploaded or created.
- **Frontend Protection**:
  - Unauthenticated visitors are prompted with a dedicated sign-in screen.
  - Authenticated non-admin users receive a strict **403 Access Denied** notification displaying their profile's non-admin status.
- **Backend API Protection**:
  - Admin endpoints (`/api/admin/users`, `DELETE /api/memes`, `DELETE /api/images`) verify the caller's JWT token and check `is_super_admin === true` in `public.profiles`.

---

## 5 Super Admin Statistics & Insights

The panel computes and visualizes five critical metrics in real time:

1. **Platform Growth KPIs**:
   - Total registered users (`public.profiles`)
   - Total uploaded images (`public.images`)
   - Total community memes (`public.memes`)
   - Total likes/ratings cast (`public.meme_ratings`)
2. **Gemini AI Utilization & Health**:
   - Percentage of images with a generated Gemini summary (`description IS NOT NULL`).
   - Absolute counts of successfully analyzed images vs. images with missing or failed summaries.
3. **Meme Conversion & Engagement Rate**:
   - **Conversion Rate**: Percentage of uploaded images that have had at least one meme created from them.
   - **Engagement Velocity**: Average likes received per meme.
4. **Community Leaderboard**:
   - **Top 5 Most Liked Memes**: Ranked list displaying meme preview, caption, total likes, and creation date.
   - **Top Image Uploaders**: Ranked list of users who have contributed the most source images to the platform.
5. **Storage Footprint & Asset Health**:
   - Active storage file tracking in the Supabase `images` bucket.
   - Count of **orphaned images** (images uploaded but never converted into any meme).

---

## 5 Super Admin Actions

The panel empowers super admins to execute five privileged actions:

### 1. Global Meme Moderation (Hard Delete)
- Super admins can search, filter, and permanently delete **any meme** across the community regardless of who created it.
- Automatically purges all associated likes and ratings from `public.meme_ratings`.

### 2. Global Image Moderation & Orphan Pruning
- Super admins can review all uploaded images, filter exclusively for orphaned images (images with 0 memes), and perform a cascading hard delete.
- Deletion removes:
  - The physical file from Supabase Storage (`images` bucket)
  - The row from `public.images`
  - All corresponding memes from `public.memes`
  - All associated user ratings from `public.meme_ratings`

### 3. Trigger Gemini Multimodal AI Summaries
- Super admins can inspect images with missing descriptions and trigger the server-side Gemini multimodal API (`/api/images/summarize`) directly from the dashboard.
- Enables batch-updating or repairing AI summaries without requiring users to re-upload files.

### 4. User Role & Privilege Management
- Super admins can view all registered user profiles and promote standard users to Super Admin or demote existing admins via the `/api/admin/users` endpoint.
- Includes a safety safeguard preventing the sole super admin from demoting themselves and locking out administrative access.

### 5. System Announcement & Maintenance Broadcast
- Super admins can author a site-wide broadcast announcement visible as a highlighted alert banner across the platform.

---

## API Endpoints Reference

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/admin` | `GET` | Super Admin | Dashboard UI page protected by authentication and `is_super_admin` check. |
| `/api/admin/users` | `PATCH` | Super Admin | Promotes or demotes a user's `is_super_admin` status. |
| `/api/memes` | `DELETE` | Owner or Super Admin | Deletes a meme. Super admins can delete any meme; regular users can only delete their own. |
| `/api/images` | `DELETE` | Owner or Super Admin | Cascading delete of an image, its storage file, and all associated memes. |
| `/api/images/summarize` | `POST` | Authenticated | Invokes Gemini 2.5/Gemini Pro to generate an AI image summary. |
