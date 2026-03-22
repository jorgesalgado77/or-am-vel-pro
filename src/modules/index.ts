/**
 * OrçaMóvel PRO — Module Architecture Map
 * 
 * Each module encapsulates a domain with its own:
 *   - components/  (UI)
 *   - hooks/       (logic)
 *   - services/    (data layer - Supabase)
 *   - types/       (TypeScript definitions)
 * 
 * Import from modules for clean, domain-driven imports:
 *   import { ClientsKanban, useClientManager } from "@/modules/sales";
 *   import { FinancialPanel } from "@/modules/financial";
 * 
 * Modules:
 *   sales/       — Kanban, clients, contracts, simulator, negotiations
 *   financial/   — Financial panel, payroll, rates, commissions
 *   affiliates/  — Referral program, affiliate management
 *   campaigns/   — Campaign library, scheduling, image generation
 *   chat/        — VendaZap AI, live chat, auto-pilot
 *   dealroom/    — Deal room views and store widgets
 *   auth/        — Authentication, users, tenants, audit
 *   admin/       — Master admin panel (SaaS-level)
 *   settings/    — Tenant settings, tabs, configurations
 *   landing/     — Public landing pages, funnel, lead capture
 *   shared/      — UI components, utilities, common hooks
 */

export * from "./sales";
export * from "./financial";
export * from "./affiliates";
export * from "./campaigns";
export * from "./chat";
export * from "./dealroom";
export * from "./auth";
export * from "./admin";
export * from "./settings";
export * from "./landing";
export * from "./shared";
