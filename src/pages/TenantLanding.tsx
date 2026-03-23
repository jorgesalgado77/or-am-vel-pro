import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, Phone, Mail, User, ArrowRight, Loader2, Star, Shield,
  Paperclip, FileText, Play, Pause, Volume2, VolumeX, Maximize,
  X, ChevronLeft, ChevronRight, Sparkles, MessageCircle,
  Instagram, Facebook, Youtube, Globe, Twitter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { maskPhone, unmask } from "@/lib/masks";
import { validateFileUpload } from "@/lib/validation";
import { toast } from "sonner";

// TikTok icon (not in lucide)
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.37a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.8z"/>
  </svg>
);

interface SocialLinks {
  instagram_url?: string;
  facebook_url?: string;
  youtube_url?: string;
  twitter_url?: string;
  tiktok_url?: string;
  website_url?: string;
}

interface TenantData {
  id: string;
  nome_loja: string;
  logo_url: string | null;
  primary_color: string;
  subtitle: string;
  telefone_loja: string | null;
  whatsapp_loja: string | null;
  headline: string;
  sub_headline: string;
  cta_text: string;
  benefits: string[];
  promo_video_url: string | null;
  carousel_images: string[];
  social_links: SocialLinks | null;
}

const DEFAULT_BENEFITS = [
  "Projeto 3D gratuito e sem compromisso",
  "Atendimento personalizado por especialista",
  "Orçamento detalhado em até 24h",
  "Melhores condições de pagamento",
];

/* ─── CSS-only fade animation helper ─── */
const fadeInUp = (delay = 0): React.CSSProperties => ({
  opacity: 0,
  transform: "translateY(20px)",
  animation: `landingFadeIn 0.6s ease-out ${delay}s forwards`,
});

/* ─── Video Player (lightweight, no framer-motion) ─── */
function PromoVideoPlayer({ url, color }: { url: string; color: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.volume = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }, [playing]);

  const handleVolumeChange = useCallback((v: number[]) => {
    const val = v[0];
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val / 100;
      videoRef.current.muted = val === 0;
    }
    setMuted(val === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !muted;
    videoRef.current.muted = newMuted;
    setMuted(newMuted);
    if (!newMuted && volume === 0) {
      setVolume(80);
      videoRef.current.volume = 0.8;
    }
  }, [muted, volume]);

  const fullscreen = useCallback(() => {
    videoRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl group cursor-pointer border border-white/20">
      <video
        ref={videoRef}
        src={url}
        className="w-full aspect-video object-cover bg-gray-900"
        onClick={toggle}
        onEnded={() => setPlaying(false)}
        playsInline
        autoPlay
        muted
        loop
        preload="auto"
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={toggle}>
          <div
            className="h-16 w-16 sm:h-20 sm:w-20 rounded-full flex items-center justify-center shadow-2xl transition-transform active:scale-95"
            style={{ backgroundColor: color, boxShadow: `0 0 40px ${color}60` }}
          >
            <Play className="h-7 w-7 sm:h-8 sm:w-8 ml-1 text-white" />
          </div>
        </div>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 p-3 transition-opacity duration-300"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <button onClick={toggle} className="text-white active:scale-90 transition-transform">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button onClick={toggleMute} className="text-white active:scale-90 transition-transform">
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <div className="w-16 sm:w-20">
            <Slider value={[muted ? 0 : volume]} min={0} max={100} step={1} onValueChange={handleVolumeChange} className="cursor-pointer" />
          </div>
          <div className="flex-1" />
          <button onClick={fullscreen} className="text-white active:scale-90 transition-transform">
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Image Carousel (CSS transitions, no framer-motion) ─── */
function PromoCarousel({ images, color }: { images: string[]; color: string }) {
  const [current, setCurrent] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(0);

  useEffect(() => {
    if (images.length <= 1 || expanded) return;
    const iv = setInterval(() => setCurrent(p => (p + 1) % images.length), 4000);
    return () => clearInterval(iv);
  }, [images.length, expanded]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden shadow-xl border border-white/20 cursor-pointer group"
        onClick={() => { setExpandedIdx(current); setExpanded(true); }}>
        {images.map((img, i) => (
          <img
            key={i}
            src={img}
            alt={`Projeto ${i + 1}`}
            className="w-full aspect-[16/10] object-cover absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === current ? 1 : 0, position: i === 0 ? "relative" : "absolute" }}
            loading="lazy"
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 sm:transition-opacity" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {current + 1}/{images.length}
          </span>
          <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            Toque para expandir
          </span>
        </div>
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                width: i === current ? 24 : 10,
                backgroundColor: i === current ? color : "rgba(0,0,0,0.15)",
              }}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {expanded && (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center landing-fade-in" onClick={() => setExpanded(false)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10 active:scale-90 transition-transform" onClick={() => setExpanded(false)}>
            <X className="h-8 w-8" />
          </button>
          {images.length > 1 && (
            <>
              <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-white/15 backdrop-blur-sm rounded-full p-2.5 active:scale-90 z-10"
                onClick={(e) => { e.stopPropagation(); setExpandedIdx(p => (p - 1 + images.length) % images.length); }}>
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-white/15 backdrop-blur-sm rounded-full p-2.5 active:scale-90 z-10"
                onClick={(e) => { e.stopPropagation(); setExpandedIdx(p => (p + 1) % images.length); }}>
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <img
            src={images[expandedIdx]}
            alt={`Imagem ${expandedIdx + 1}`}
            className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg landing-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-5 text-white/70 text-sm font-medium">
            {expandedIdx + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main Page ─── */
export default function TenantLanding() {
  const { codigo } = useParams<{ codigo: string }>();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [descricao, setDescricao] = useState("");
  const [investimento, setInvestimento] = useState("");
  const [investmentRanges, setInvestmentRanges] = useState<string[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);

  useEffect(() => {
    if (!codigo) return;

    let active = true;

    (async () => {
      setLoading(true);
      setNotFound(false);

      try {
        const normalizedCode = codigo.trim();

        const safeRpc = (fn: string, params: any) =>
          Promise.resolve((supabase as any).rpc(fn, params)).then(
            (res: any) => res,
            (error: any) => ({ data: null, error })
          );

        const [landingResult, tenantIdResult, tenantInfoResult] = await Promise.all([
          safeRpc("resolve_tenant_landing", { p_code: normalizedCode }),
          safeRpc("resolve_tenant_by_code", { p_code: normalizedCode }),
          safeRpc("resolve_tenant_info_by_code", { p_code: normalizedCode }),
        ]);

        console.info("[TenantLanding] lookup", {
          normalizedCode,
          landingData: landingResult?.data ?? null,
          landingError: landingResult?.error?.message ?? null,
          tenantIdData: tenantIdResult?.data ?? null,
          tenantIdError: tenantIdResult?.error?.message ?? null,
          tenantInfoData: tenantInfoResult?.data ?? null,
          tenantInfoError: tenantInfoResult?.error?.message ?? null,
        });

        const landingData = landingResult?.data ?? null;
        const tenantId = typeof tenantIdResult?.data === "string"
          ? tenantIdResult.data
          : tenantIdResult?.data?.tenant_id ?? tenantIdResult?.data?.id ?? null;
        const tenantInfo = tenantInfoResult?.data ?? null;

        let tenantData: TenantData | null = landingData
          ? {
              ...landingData,
              nome_loja: (tenantInfo?.nome && tenantInfo.nome !== "Loja" ? tenantInfo.nome : null) || landingData.nome_loja,
              logo_url: landingData.logo_url || null,
              primary_color: landingData.primary_color || "hsl(199,89%,48%)",
              subtitle: landingData.subtitle || "",
              telefone_loja: landingData.telefone_loja || null,
              whatsapp_loja: landingData.whatsapp_loja || null,
              headline: landingData.headline || "Ganhe seu Projeto 3D Gratuito",
              sub_headline: landingData.sub_headline || "",
              cta_text: landingData.cta_text || "Solicite seu Projeto 3D Grátis",
              benefits: Array.isArray(landingData.benefits) && landingData.benefits.length ? landingData.benefits : DEFAULT_BENEFITS,
              promo_video_url: landingData.promo_video_url || null,
              carousel_images: Array.isArray(landingData.carousel_images) ? landingData.carousel_images.filter(Boolean) : [],
              social_links: landingData.social_links || null,
            }
          : null;

        if (!tenantData && tenantId) {
          tenantData = {
            id: tenantId,
            nome_loja: tenantInfo?.nome || "Loja",
            logo_url: null,
            primary_color: "hsl(199,89%,48%)",
            subtitle: tenantInfo?.subtitulo || "",
            telefone_loja: null,
            whatsapp_loja: null,
            headline: "Ganhe seu Projeto 3D Gratuito",
            sub_headline: "",
            cta_text: "Solicite seu Projeto 3D Grátis",
            benefits: DEFAULT_BENEFITS,
            promo_video_url: null,
            carousel_images: [],
            social_links: null,
          };
        }

        if (!tenantData) {
          console.warn("[TenantLanding] not found branch", { normalizedCode });
          if (active) setNotFound(true);
          return;
        }

        if (tenantData.id) {
          try {
            // Try direct query first (works for authenticated users)
            let fd: any = null;
            const { data: directData } = await supabase
              .from("tenant_funnel_config" as any)
              .select("promo_video_url, carousel_images, primary_color, headline, sub_headline, cta_text, benefits, social_links, whatsapp, investment_ranges")
              .eq("tenant_id", tenantData.id)
              .maybeSingle();
            fd = directData;

            // If direct fails (RLS), try via RPC with fixed function
            if (!fd) {
              const rpcRes = await Promise.resolve(
                (supabase as any).rpc("get_tenant_funnel_public", { p_tenant_id: tenantData.id })
              ).then((r: any) => r, () => ({ data: null }));
              fd = rpcRes?.data ?? null;
            }

            if (fd) {
              const d = fd as any;
              if (d.promo_video_url) tenantData.promo_video_url = d.promo_video_url;
              if (Array.isArray(d.carousel_images) && d.carousel_images.length) tenantData.carousel_images = d.carousel_images.filter(Boolean);
              if (d.primary_color) tenantData.primary_color = d.primary_color;
              if (d.headline) tenantData.headline = d.headline;
              if (d.sub_headline) tenantData.sub_headline = d.sub_headline;
              if (d.cta_text) tenantData.cta_text = d.cta_text;
              if (Array.isArray(d.benefits) && d.benefits.length) tenantData.benefits = d.benefits;
              if (d.social_links) tenantData.social_links = d.social_links;
              if (d.whatsapp) tenantData.whatsapp_loja = d.whatsapp;
              if (Array.isArray(d.investment_ranges) && d.investment_ranges.length) {
                if (active) setInvestmentRanges(d.investment_ranges);
              }
            }
          } catch {
            // keep lightweight fallback data for public route
          }

          // Also try to get logo and nome_empresa from company_settings
          try {
            const { data: cs } = await supabase
              .from("company_settings" as any)
              .select("logo_url, whatsapp, nome_empresa")
              .eq("tenant_id", tenantData.id)
              .maybeSingle();
            if (cs) {
              if ((cs as any).logo_url && !tenantData.logo_url) tenantData.logo_url = (cs as any).logo_url;
              if ((cs as any).whatsapp && !tenantData.whatsapp_loja) tenantData.whatsapp_loja = (cs as any).whatsapp;
              const nomeEmpresa = (cs as any).nome_empresa;
              if (nomeEmpresa && nomeEmpresa.trim()) tenantData.nome_loja = nomeEmpresa.trim();
            }
          } catch {}
        }

        if (active) {
          console.info("[TenantLanding] resolved tenant", tenantData);
          setTenant(tenantData);
          setNotFound(false);
        }
      } catch (error) {
        console.error("[TenantLanding] fatal error", error);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [codigo]);

  // Realtime: update benefits/config when admin saves changes
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("funnel-config-realtime")
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "tenant_funnel_config",
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload: any) => {
        const d = payload.new;
        if (!d) return;
        setTenant(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            ...(Array.isArray(d.benefits) && d.benefits.length ? { benefits: d.benefits } : {}),
            ...(d.headline ? { headline: d.headline } : {}),
            ...(d.sub_headline ? { sub_headline: d.sub_headline } : {}),
            ...(d.cta_text ? { cta_text: d.cta_text } : {}),
            ...(d.primary_color ? { primary_color: d.primary_color } : {}),
            ...(d.promo_video_url !== undefined ? { promo_video_url: d.promo_video_url } : {}),
            ...(Array.isArray(d.carousel_images) ? { carousel_images: d.carousel_images.filter(Boolean) } : {}),
          };
        });
        if (Array.isArray(d.investment_ranges) && d.investment_ranges.length) {
          setInvestmentRanges(d.investment_ranges);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id]);

  const uploadLeadAttachments = useCallback(async (clientId?: string) => {
    if (!arquivos.length || !tenant?.id) return { uploaded: 0, failed: 0 };

    let uploaded = 0;
    let failed = 0;
    const total = arquivos.length;

    for (const [index, file] of arquivos.entries()) {
      setUploadProgress({ current: index + 1, total, fileName: file.name });

      const validation = validateFileUpload(file);
      if (!validation.valid) {
        failed += 1;
        continue;
      }

      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `leads/${tenant.id}/${Date.now()}_${index}_${safeName}`;
      const { error } = await supabase.storage.from("company-assets").upload(path, file);

      if (error) {
        failed += 1;
        console.warn("[TenantLanding] attachment upload failed:", error.message);
        continue;
      }

      uploaded += 1;

      const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
      await supabase.from("lead_attachments" as any).insert({
        tenant_id: tenant.id,
        client_id: clientId || null,
        client_name: nome.trim(),
        file_name: file.name,
        file_path: path,
        file_url: urlData?.publicUrl || null,
        file_size: file.size,
        file_type: file.type || null,
      } as any).then(({ error: insertErr }: any) => {
        if (insertErr) console.warn("[TenantLanding] lead_attachments insert failed:", insertErr.message);
      });
    }

    setUploadProgress(null);
    return { uploaded, failed };
  }, [arquivos, tenant?.id, nome]);

  const finalizeLeadSuccess = useCallback(async (clientId?: string | null) => {
    setSent(true);
    toast.success("Cadastro realizado com sucesso!");

    const { failed } = await uploadLeadAttachments(clientId || undefined);
    if (failed > 0) {
      toast.info("Lead enviado, mas alguns anexos não puderam ser enviados.");
    }
  }, [uploadLeadAttachments]);

  // Anti-spam: cooldown de 30s entre envios
  const lastSubmitRef = useRef<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting — 30s cooldown
    const now = Date.now();
    const elapsed = now - lastSubmitRef.current;
    if (elapsed < 30_000 && lastSubmitRef.current > 0) {
      const wait = Math.ceil((30_000 - elapsed) / 1000);
      toast.error(`Aguarde ${wait}s antes de enviar novamente.`);
      return;
    }

    if (!nome.trim() || !telefone.trim()) { toast.error("Preencha nome e telefone"); return; }
    const cleanPhone = unmask(telefone);
    if (cleanPhone.length < 10) { toast.error("Telefone inválido"); return; }
    if (!tenant?.id) { toast.error("Loja não identificada."); return; }

    lastSubmitRef.current = now;

    setSending(true);

    const interesseText = [descricao.trim(), investimento ? `Investimento: ${investimento}` : ""].filter(Boolean).join(" | ") || "Projeto 3D gratuito";
    const origem = refCode ? "indicacao" : "landing_page";
    const leadPayload = {
      nome: nome.trim(),
      telefone: cleanPhone,
      email: email.trim() || undefined,
      interesse: interesseText,
      origem,
      referral_code: refCode || undefined,
      tenant_id: tenant.id,
    };

    try {
      const res = await supabase.functions.invoke("lead-capture", { body: leadPayload });
      if (res.error) throw res.error;
      await finalizeLeadSuccess((res.data as any)?.client_id ?? null);
    } catch (edgeFnErr) {
      console.error("Edge function failed, trying direct insert:", edgeFnErr);

      try {
        const { data: clientData, error: clientError } = await supabase.from("clients").insert({
          nome: nome.trim(),
          telefone1: cleanPhone,
          email: email.trim() || "",
          tenant_id: tenant.id,
          status: "novo",
          origem_lead: origem,
          descricao_ambientes: interesseText,
          quantidade_ambientes: 1,
        } as any).select("id").single();

        if (!clientError) {
          await finalizeLeadSuccess((clientData as any)?.id ?? null);
          return;
        }

        console.error("Direct client insert failed, trying leads table:", clientError);

        const { error: leadError } = await supabase.from("leads").insert({
          nome: nome.trim(),
          telefone: cleanPhone,
          email: email.trim() || "",
          area_atuacao: "outro",
          cargo: "outro",
          notas: interesseText,
          status: "novo",
          tenant_id: tenant.id,
        } as any);

        if (leadError) {
          console.error("All insert methods failed:", { edgeFnErr, clientError, leadError });
          toast.error("Erro ao enviar. Tente novamente.");
          return;
        }

        await finalizeLeadSuccess();
      } catch (fallbackErr) {
        console.error("Fallback insert failed:", { edgeFnErr, fallbackErr });
        toast.error("Erro ao enviar. Tente novamente.");
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950">
        <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !tenant) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-white">Loja não encontrada</h1>
          <p className="text-gray-400">O código informado não corresponde a nenhuma loja cadastrada.</p>
        </div>
      </div>
    );
  }

  const color = tenant.primary_color || "#2196F3";
  const benefits = tenant.benefits?.length ? tenant.benefits : DEFAULT_BENEFITS;
  const hasVideo = !!tenant.promo_video_url;
  const hasCarousel = tenant.carousel_images.length > 0;

  if (sent) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: `linear-gradient(135deg, #0f172a, ${color}30, #0f172a)` }}>
        <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-2xl p-8 text-center space-y-5 landing-scale-in">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}, ${color}80)` }}>
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Recebemos seu cadastro!</h2>
          <p className="text-gray-600">A equipe da <strong>{tenant.nome_loja}</strong> entrará em contato em breve.</p>
          <button
            onClick={() => window.location.href = "https://orcamovelpro.lovable.app"}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium shadow-lg active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#25D366" }}
          >
            <CheckCircle2 className="h-4 w-4" /> Obrigado pelo contato
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Inject performant CSS animations — reduced motion & mobile-first */}
      <style>{`
        @keyframes landingFadeIn {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landingFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes landingGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes landingParticle {
          0% { transform: translateY(0) translateX(0) scale(0); opacity: 0; }
          20% { opacity: 1; transform: scale(1); }
          100% { transform: translateY(-120px) translateX(var(--tx, 30px)) scale(0); opacity: 0; }
        }
        .landing-fade-in { animation: landingFadeIn 0.3s ease-out forwards; }
        .landing-scale-in { animation: landingFadeIn 0.4s ease-out forwards; }
        .landing-float { animation: landingFloat 3s ease-in-out infinite; }
        .landing-glow { animation: landingGlow 3s ease-in-out infinite; }
        .landing-particle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: landingParticle var(--dur, 4s) ease-out var(--delay, 0s) infinite;
        }
        /* Disable heavy effects on low-end / reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .landing-float, .landing-glow, .landing-particle { animation: none !important; }
          .landing-fade-in, .landing-scale-in { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
        /* Disable particles on small screens for GPU savings */
        @media (max-width: 640px) {
          .landing-particle:nth-child(n+7) { display: none; }
          .landing-glow-orb { display: none; }
        }
      `}</style>

      <div className="min-h-[100dvh] flex flex-col" style={{ background: `linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)` }}>

        {/* ═══ Hero Header ═══ */}
        <header className="relative pt-6 sm:pt-8 pb-4 sm:pb-6 px-3 sm:px-6 overflow-hidden contain-paint">
          {/* Particles — only 8, mobile hides extras via CSS */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`p-${i}`}
              className="landing-particle"
              style={{
                width: `${2 + Math.random() * 3}px`,
                height: `${2 + Math.random() * 3}px`,
                backgroundColor: i % 3 === 0 ? color : `rgba(255,255,255,${0.2 + Math.random() * 0.3})`,
                left: `${5 + Math.random() * 90}%`,
                bottom: `${Math.random() * 40}%`,
                '--tx': `${-40 + Math.random() * 80}px`,
                '--dur': `${3 + Math.random() * 4}s`,
                '--delay': `${Math.random() * 5}s`,
              } as React.CSSProperties}
            />
          ))}
          {/* Glow orb — hidden on mobile for GPU savings */}
          <div
            className="landing-glow-orb absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] sm:w-[400px] sm:h-[300px] rounded-full blur-[60px] sm:blur-[100px] landing-glow pointer-events-none"
            style={{ backgroundColor: color, opacity: 0.2 }}
          />
          <div className="relative flex flex-col items-center gap-3 sm:gap-4">
            <div className="landing-float" style={fadeInUp(0)}>
              {tenant.logo_url ? (
                <div className="relative">
                  <img src={tenant.logo_url} alt={tenant.nome_loja} className="h-16 sm:h-20 md:h-24 w-auto object-contain drop-shadow-2xl" loading="eager" />
                </div>
              ) : (
                <div className="relative">
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 items-center justify-center rounded-[20px] sm:rounded-[28px] border text-xl sm:text-2xl font-black text-white shadow-2xl" style={{ background: `linear-gradient(135deg, ${color}, ${color}80)`, borderColor: `${color}40` }}>
                    {tenant.nome_loja.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "LP"}
                  </div>
                </div>
              )}
            </div>
            <h1
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight text-center leading-tight"
              style={{ ...fadeInUp(0.15), textShadow: `0 0 40px ${color}30` }}
            >
              {tenant.nome_loja}
            </h1>
            <div
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border"
              style={{
                ...fadeInUp(0.3),
                borderColor: `${color}40`,
                background: `linear-gradient(135deg, ${color}15, transparent)`,
              }}
            >
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color }} />
              <span className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase" style={{ color }}>
                Especialistas em Móveis Planejados
              </span>
            </div>
          </div>
        </header>

        {/* ═══ Main Content ═══ */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 lg:py-10">
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-12 items-start">

            {/* ── Left: Media + Copy ── */}
            <div className="space-y-4 sm:space-y-6 order-2 lg:order-1" style={fadeInUp(0.2)}>
              {hasVideo && (
                <PromoVideoPlayer url={tenant.promo_video_url!} color={color} />
              )}
              {hasCarousel && (
                <PromoCarousel images={tenant.carousel_images} color={color} />
              )}

              {/* Headline & copy */}
              <div className="space-y-3 sm:space-y-4" style={fadeInUp(0.35)}>
                <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-white leading-tight">
                  {tenant.headline || "Ganhe seu Projeto 3D Gratuito"}
                </h2>
                <p className="text-sm sm:text-base lg:text-lg text-gray-400 leading-relaxed">
                  {tenant.sub_headline || `A ${tenant.nome_loja} cria o projeto ideal para sua casa. Preencha o formulário e receba um projeto 3D exclusivo sem custo.`}
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2 sm:space-y-3" style={fadeInUp(0.45)}>
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 sm:gap-3">
                    <div
                      className="mt-0.5 h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}80)` }}
                    >
                      <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                    </div>
                    <span className="text-gray-300 text-xs sm:text-sm lg:text-base">{b}</span>
                  </div>
                ))}
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 sm:gap-4 pt-1 sm:pt-2" style={fadeInUp(0.55)}>
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 border-gray-800 flex items-center justify-center text-[9px] sm:text-[11px] font-bold"
                      style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)`, color }}>
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <div className="text-xs sm:text-sm text-gray-400">
                  <span className="font-bold text-white">+200 clientes</span> já aprovaram
                </div>
              </div>
            </div>

            {/* ── Right: Form Card — mobile-first, on top for mobile ── */}
            <div className="order-1 lg:order-2 w-full" style={fadeInUp(0.25)}>
              <div
                className="rounded-2xl sm:rounded-3xl p-[1px] lg:sticky lg:top-6"
                style={{ background: `linear-gradient(135deg, ${color}50, transparent 50%, ${color}20)` }}
              >
                <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-7 space-y-4 sm:space-y-5">
                  <div className="text-center space-y-1">
                    <h2 className="text-base sm:text-lg md:text-xl font-bold text-white">
                      {tenant.cta_text || "Solicite seu Projeto 3D Grátis"}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-400">Sem compromisso. Retornamos em até 24h.</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="lead-nome" className="text-xs sm:text-sm font-medium text-gray-300">Seu Nome</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input id="lead-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Como podemos te chamar?"
                          className="pl-10 h-11 sm:h-12 rounded-xl bg-gray-800/80 border-gray-700 text-white text-sm placeholder:text-gray-500 focus:border-white/30 focus:ring-1 focus:ring-white/10" required />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lead-tel" className="text-xs sm:text-sm font-medium text-gray-300">WhatsApp</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input id="lead-tel" type="tel" inputMode="numeric" value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15}
                          className="pl-10 h-11 sm:h-12 rounded-xl bg-gray-800/80 border-gray-700 text-white text-sm placeholder:text-gray-500 focus:border-white/30 focus:ring-1 focus:ring-white/10" required />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lead-mail" className="text-xs sm:text-sm font-medium text-gray-300">Email <span className="text-gray-500">(opcional)</span></Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input id="lead-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                          className="pl-10 h-11 sm:h-12 rounded-xl bg-gray-800/80 border-gray-700 text-white text-sm placeholder:text-gray-500 focus:border-white/30 focus:ring-1 focus:ring-white/10" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lead-desc" className="text-xs sm:text-sm font-medium text-gray-300">Descreva sua necessidade <span className="text-gray-500">(opcional)</span></Label>
                      <Textarea id="lead-desc" value={descricao} onChange={e => setDescricao(e.target.value)}
                        placeholder="Ex: Cozinha planejada para apartamento de 60m²..."
                        className="rounded-xl bg-gray-800/80 border-gray-700 text-white text-sm placeholder:text-gray-500 focus:border-white/30 focus:ring-1 focus:ring-white/10 min-h-[60px] sm:min-h-[70px]" />
                    </div>
                    {investmentRanges.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs sm:text-sm font-medium text-gray-300">Quanto pretende investir em Móveis Planejados?</Label>
                        <select
                          value={investimento}
                          onChange={(e) => setInvestimento(e.target.value)}
                          className="w-full rounded-xl bg-gray-800/80 border border-gray-700 text-white px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm focus:border-white/30 focus:ring-1 focus:ring-white/10 appearance-none"
                        >
                          <option value="" className="bg-gray-900 text-gray-400">Selecione uma faixa de investimento</option>
                          {investmentRanges.map((range, i) => (
                            <option key={i} value={range} className="bg-gray-900 text-white">{range}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="border border-dashed border-gray-700 rounded-xl p-2.5 sm:p-3 text-center hover:border-gray-500 transition-colors cursor-pointer active:bg-gray-800/30"
                        onClick={() => document.getElementById("lead-files")?.click()}>
                        <input id="lead-files" type="file" multiple accept="image/*,.pdf,.dwg" className="hidden"
                          onChange={e => { setArquivos(prev => [...prev, ...Array.from(e.target.files || [])]); }} />
                        <Paperclip className="h-4 w-4 mx-auto text-gray-500 mb-1" />
                        <p className="text-[11px] sm:text-xs text-gray-400">Enviar planta, fotos ou documentos</p>
                        <p className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">JPG, PNG, PDF • Até 10MB</p>
                      </div>
                      {arquivos.length > 0 && (
                        <div className="space-y-1 mt-1">
                          {arquivos.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-300 bg-gray-800/60 rounded-lg px-2.5 sm:px-3 py-1.5">
                              <FileText className="h-3 w-3 shrink-0 text-gray-500" />
                              <span className="truncate flex-1">{f.name}</span>
                              <button type="button" onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-500 hover:text-red-400 p-1 -mr-1 min-w-[28px] min-h-[28px] flex items-center justify-center">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button type="submit" disabled={sending}
                      className="w-full h-12 sm:h-13 text-sm sm:text-base font-bold rounded-xl text-white shadow-xl active:scale-[0.97] transition-all border-0"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 8px 30px ${color}40` }}>
                      {sending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                          <span className="text-xs sm:text-sm">
                            {uploadProgress
                              ? `Enviando anexo ${uploadProgress.current}/${uploadProgress.total}...`
                              : "Enviando dados..."}
                          </span>
                        </span>
                      ) : (
                        <>Quero meu Projeto 3D Grátis <ArrowRight className="ml-1.5 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5" /></>
                      )}
                    </Button>

                    {/* Upload progress bar */}
                    {sending && uploadProgress && (
                      <div className="space-y-1 landing-fade-in">
                        <div className="w-full h-1.5 sm:h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${color}20` }}>
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                              background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-gray-400 truncate text-center">
                          📎 {uploadProgress.fileName}
                        </p>
                      </div>
                    )}
                  </form>

                  <div className="flex items-center justify-center gap-4 sm:gap-5 text-[10px] sm:text-[11px] text-gray-500 pt-1">
                    <div className="flex items-center gap-1"><Shield className="h-3 w-3" /> Dados protegidos</div>
                    <div className="flex items-center gap-1"><Star className="h-3 w-3" /> Sem spam</div>
                  </div>

                  {/* Social Links inside form card */}
                  {(() => {
                    const sl = tenant.social_links || {};
                    const socialItems = [
                      { icon: Instagram, label: "Instagram", url: sl.instagram_url, gradient: "linear-gradient(135deg, #E1306C, #F77737, #FCAF45)" },
                      { icon: Facebook, label: "Facebook", url: sl.facebook_url, gradient: "linear-gradient(135deg, #1877F2, #42A5F5)" },
                      { icon: Youtube, label: "YouTube", url: sl.youtube_url, gradient: "linear-gradient(135deg, #FF0000, #CC0000)" },
                      { icon: TikTokIcon, label: "TikTok", url: (sl as any).tiktok_url, gradient: "linear-gradient(135deg, #000000, #25F4EE, #FE2C55)" },
                      { icon: Twitter, label: "X/Twitter", url: sl.twitter_url, gradient: "linear-gradient(135deg, #1DA1F2, #0d8bd9)" },
                      { icon: Globe, label: "Site", url: sl.website_url, gradient: `linear-gradient(135deg, ${color}, ${color}cc)` },
                    ].filter(l => l.url && l.url.trim());
                    if (!socialItems.length) return null;
                    return (
                      <div className="pt-3 border-t border-gray-800/60">
                        <p className="text-[10px] sm:text-xs text-gray-500 text-center mb-2 sm:mb-3">Siga-nos nas redes sociais</p>
                        <div className="flex justify-center gap-2 sm:gap-3 flex-wrap">
                          {socialItems.map(({ icon: Icon, label, url, gradient }) => (
                            <a
                              key={label}
                              href={url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={label}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95"
                              style={{ background: gradient }}
                            >
                              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ═══ Social Links (bottom) ═══ */}
        {(() => {
          const sl = tenant.social_links || {};
          const links = [
            { icon: Instagram, label: "Instagram", url: sl.instagram_url },
            { icon: Facebook, label: "Facebook", url: sl.facebook_url },
            { icon: Youtube, label: "YouTube", url: sl.youtube_url },
            { icon: TikTokIcon, label: "TikTok", url: (sl as any).tiktok_url },
            { icon: Twitter, label: "X/Twitter", url: sl.twitter_url },
            { icon: Globe, label: "Site", url: sl.website_url },
          ].filter(l => l.url && l.url.trim());
          if (!links.length) return null;
          return (
            <div className="py-4 sm:py-6 px-4 flex justify-center gap-3 sm:gap-4 flex-wrap" style={fadeInUp(0.7)}>
              {links.map(({ icon: Icon, label, url }) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="group w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border border-gray-700 active:scale-90"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </a>
              ))}
            </div>
          );
        })()}

        {/* ═══ Footer ═══ */}
        <footer className="py-4 sm:py-6 px-4 text-center border-t border-gray-800/50">
          <p className="text-[10px] sm:text-xs text-gray-500">
            {tenant.nome_loja} · Powered by <span className="font-semibold text-gray-400">OrçaMóvel PRO</span> — Todos os Direitos Reservados — 2026
          </p>
        </footer>
      </div>
    </>
  );
}
