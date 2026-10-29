# Super Admin Control Suite Documentation

## Overview

The Super Admin Control Suite at [`/admin`](file:///Users/anthony/Documents/Repositories/the-humor-project/app/admin/page.tsx) is a centralized, role-protected administrative dashboard for **The Humor Project**.

Access is verified via the `is_super_admin` boolean flag on the authenticated user's `public.profiles` record. Verified super admins receive an exclusive `🛡️ Admin` pill in the persistent navigation bar.

---

## Complete Feature & Criteria Mapping

The admin panel implements 100% of the administrative criteria:

| Capability | Database Table | Actions Available in Admin Panel |
|---|---|---|
| **Read Users** | `public.profiles` | Inspect all registered user IDs, full names, emails, signup timestamps, and toggle Super Admin status. |
| **Read Prompt Chains** | `public.prompt_chains` | View all multi-stage prompt chains and their descriptions. |
| **Read Prompt Chain Steps** | `public.prompt_chain_steps` | Inspect sequential steps per chain, including step order, step name, prompt template, and target model. |
| **Read / Update Prompt Chain Mix** | `public.prompt_chain_mix` | Inspect and edit generation routing weights (`0.0 - 1.0`), toggle active status, and update configuration notes. |
| **CRUD Terms** | `public.terms` | Create, read, edit definitions/categories, and delete humor terms, techniques, and prompt vocabulary. |
| **Read / View AI Generated Media** | `public.memes` | Browse all AI-generated captions and visual meme media with live render cards and like counters. |
| **Read Generation Requests** | `public.generation_requests` | Inspect user generation prompts, model IDs, status codes, and request timestamps. |
| **CRUD AI Generation Examples** | `public.ai_generation_examples` | Create, read, edit, and delete in-context few-shot learning examples (input context + target punchline pairs). |
| **CRUD LLM Models** | `public.llm_models` | Register and edit models (display name, model ID, provider, token context window, active state). |
| **CRUD LLM Providers** | `public.llm_providers` | Create, edit, and delete AI providers (e.g. Google Gemini, OpenAI, Anthropic), slug identifiers, and API base URLs. |
| **Read LLM Responses** | `public.llm_responses` | Inspect raw response outputs, latency in milliseconds, token counts, and linked request IDs. |
| **CRUD Allowed Signup Domains** | `public.allowed_signup_domains` | Add, edit, toggle active status, and delete permitted email domains (e.g. `columbia.edu`, `barnard.edu`). |
| **CRUD Whitelisted E-mail Addresses** | `public.whitelisted_emails` | Add, edit notes, and remove specific VIP and administrator whitelisted email addresses. |
| **CRUD Images (including Upload)** | `public.images` & Storage | **Upload new images directly** (with optional automatic Gemini AI summarization), view all platform uploads, edit image descriptions inline, and hard delete images with cascading cleanup. |

---

## Tabbed Navigation Structure

The admin dashboard organizes these tools across focused views:

1. **📊 Overview**: High-level platform KPIs, summary counts, and system status.
2. **👥 Users**: Read all profiles and manage user permissions.
3. **🖼️ Images CRUD**: Full image lifecycle management:
   - **Upload Image Modal**: Upload local files to the `images` bucket, record in `public.images`, and trigger Gemini summarization.
   - **Inline Edit**: Edit descriptions / AI summaries on any image.
   - **Cascade Delete**: Hard delete any image with full storage and meme cleanup.
   - **✨ Gemini Trigger**: One-click generation or re-generation of multimodal summaries.
4. **🎭 AI Generated Media**: View community memes, inspect captions, like totals, and moderate inappropriate media.
5. **⛓️ Prompt Chains & Mix**:
   - Inspect Chains & Sequential Steps
   - Inline weight and active status editor for **Prompt Chain Mix**
   - Full CRUD modal for **AI Generation Examples**
6. **🤖 LLM Models & Providers**:
   - Full CRUD modal for **LLM Providers** (Google Gemini, OpenAI, Anthropic)
   - Full CRUD modal for **LLM Models** (Gemini 2.5 Flash, GPT-4o Mini, context windows)
7. **📖 Terms**:
   - Full CRUD modal for vocabulary, humor techniques, and prompt terms.
8. **📜 AI Requests & Logs**:
   - Inspect generation requests and raw LLM responses with latency and token metrics.
9. **🔐 Access Control**:
   - Full CRUD modal for **Allowed Signup Domains**
   - Full CRUD modal for **Whitelisted E-mail Addresses**

---

## API Endpoints Reference

- `GET /admin` – Protected dashboard page.
- `PATCH /api/admin/users` – Updates `is_super_admin` with anti-lockout safeguards.
- `DELETE /api/memes` – Super admin override to permanently delete any meme.
- `DELETE /api/images` – Super admin override to delete any image and cascade across storage and memes.
- `POST /api/images/summarize` – Multimodal Gemini AI summarization pipeline.
