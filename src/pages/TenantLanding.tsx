import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Phone, Mail, User, ArrowRight, Loader2, Star, Shield, Paperclip, FileText, Play, Pause, Volume2, VolumeX, Maximize, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { maskPhone, unmask } from "@/lib/masks";
import { toast } from "sonner";

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
}

const DEFAULT_BENEFITS = [
  "Projeto 3D gratuito e sem compromisso",
  "Atendimento personalizado por especialista",
  "Orçamento detalhado em até 24h",
  "Melhores condições de pagamento",
];

/* ─── Video Player ─── */
function PromoVideoPlayer({ url, color }: { url: string; color: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  };

  const handleVolumeChange = (v: number[]) => {
    const val = v[0];
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val / 100;
    setMuted(val === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !muted;
    setMuted(newMuted);
    videoRef.current.muted = newMuted;
  };

  const fullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-black group cursor-pointer"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(playing)}
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full aspect-video object-cover"
        onClick={toggle}
        onEnded={() => setPlaying(false)}
        playsInline
      />
      {/* Overlay play button when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30" onClick={toggle}>
          <div className="h-16 w-16 rounded-full flex items-center justify-center bg-white/90 shadow-xl transition-transform hover:scale-110">
            <Play className="h-7 w-7 ml-1" style={{ color }} />
          </div>
        </div>
      )}
      {/* Controls bar */}
      <AnimatePresence>
        {(showControls || !playing) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <button onClick={toggle} className="text-white hover:scale-110 transition-transform">
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button onClick={toggleMute} className="text-white hover:scale-110 transition-transform">
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <div className="w-20">
                <Slider
                  value={[muted ? 0 : volume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="cursor-pointer"
                />
              </div>
              <div className="flex-1" />
              <button onClick={fullscreen} className="text-white hover:scale-110 transition-transform">
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Image Carousel ─── */
function PromoCarousel({ images, color }: { images: string[]; color: string }) {
  const [current, setCurrent] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(0);

  useEffect(() => {
    if (images.length <= 1 || expanded) return;
    const iv = setInterval(() => setCurrent((p) => (p + 1) % images.length), 4000);
    return () => clearInterval(iv);
  }, [images.length, expanded]);

  if (images.length === 0) return null;

  const openExpanded = (idx: number) => {
    setExpandedIdx(idx);
    setExpanded(true);
  };

  const closeExpanded = () => setExpanded(false);

  const prevExpanded = () => setExpandedIdx((p) => (p - 1 + images.length) % images.length);
  const nextExpanded = () => setExpandedIdx((p) => (p + 1) % images.length);

  return (
    <>
      <div className="mt-4">
        <div className="relative rounded-xl overflow-hidden cursor-pointer group" onClick={() => openExpanded(current)}>
          <AnimatePresence mode="wait">
            <motion.img
              key={images[current]}
              src={images[current]}
              alt={`Imagem ${current + 1}`}
              className="w-full aspect-square object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
              Clique para expandir
            </span>
          </div>
        </div>
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === current ? 20 : 8,
                  backgroundColor: i === current ? color : "#d1d5db",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
            onClick={closeExpanded}
          >
            <button className="absolute top-4 right-4 text-white hover:scale-110 transition-transform z-10" onClick={closeExpanded}>
              <X className="h-8 w-8" />
            </button>
            {images.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/20 rounded-full p-2 hover:bg-white/30 z-10"
                  onClick={(e) => { e.stopPropagation(); prevExpanded(); }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/20 rounded-full p-2 hover:bg-white/30 z-10"
                  onClick={(e) => { e.stopPropagation(); nextExpanded(); }}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <motion.img
              key={images[expandedIdx]}
              src={images[expandedIdx]}
              alt={`Imagem ${expandedIdx + 1}`}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-6 text-white text-sm">
              {expandedIdx + 1} / {images.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    (async () => {
      try {
        const { data: info } = await (supabase as any).rpc("resolve_tenant_landing", { p_code: codigo });
        if (info) {
          const tenantData: TenantData = {
            ...info,
            promo_video_url: info.promo_video_url || null,
            carousel_images: Array.isArray(info.carousel_images) ? info.carousel_images.filter(Boolean) : [],
          };

          // Fetch media from funnel config via RPC or direct query
          if (info.id) {
            try {
              const { data: media } = await (supabase as any).rpc("get_tenant_funnel_media", { p_tenant_id: info.id });
              if (media) {
                tenantData.promo_video_url = media.promo_video_url || tenantData.promo_video_url;
                tenantData.carousel_images = Array.isArray(media.carousel_images) ? media.carousel_images.filter(Boolean) : tenantData.carousel_images;
              }
            } catch {
              // RPC not available, try direct query
              const { data: funnelData } = await supabase
                .from("tenant_funnel_config" as any)
                .select("promo_video_url, carousel_images")
                .eq("tenant_id", info.id)
                .maybeSingle();
              if (funnelData) {
                const fd = funnelData as any;
                if (fd.promo_video_url) tenantData.promo_video_url = fd.promo_video_url;
                if (Array.isArray(fd.carousel_images)) tenantData.carousel_images = fd.carousel_images.filter(Boolean);
              }
            }
          }

          setTenant(tenantData);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) { toast.error("Preencha nome e telefone"); return; }
    const cleanPhone = unmask(telefone);
    if (cleanPhone.length < 10) { toast.error("Telefone inválido"); return; }
    setSending(true);
    try {
      const res = await supabase.functions.invoke("lead-capture", {
        body: {
          nome: nome.trim(), telefone: cleanPhone, email: email.trim() || undefined,
          interesse: "Projeto 3D gratuito", origem: refCode ? "indicacao" : "funil_loja",
          referral_code: refCode || undefined, tenant_id: tenant?.id,
        },
      });
      if (res.error) throw res.error;
      setSent(true);
      toast.success("Cadastro realizado com sucesso!");
    } catch { toast.error("Erro ao enviar. Tente novamente."); }
    finally { setSending(false); }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !tenant) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-foreground">Loja não encontrada</h1>
          <p className="text-muted-foreground">O código informado não corresponde a nenhuma loja cadastrada.</p>
        </div>
      </div>
    );
  }

  const color = tenant.primary_color || "hsl(199,89%,48%)";
  const benefits = tenant.benefits?.length ? tenant.benefits : DEFAULT_BENEFITS;
  const hasVideo = !!tenant.promo_video_url;
  const hasCarousel = tenant.carousel_images.length > 0;
  const hasMedia = hasVideo || hasCarousel;

  if (sent) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Recebemos seu cadastro!</h2>
          <p className="text-gray-600">A equipe da <strong>{tenant.nome_loja}</strong> entrará em contato em breve para agendar seu projeto 3D gratuito.</p>
          {tenant.whatsapp_loja && (
            <a href={`https://wa.me/55${unmask(tenant.whatsapp_loja)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium shadow-lg transition-transform active:scale-[0.97]"
              style={{ backgroundColor: "#25D366" }}>
              <Phone className="h-4 w-4" /> Falar no WhatsApp
            </a>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: `linear-gradient(180deg, ${color}08 0%, white 40%)` }}>
      {/* Header */}
      <header className="py-6 px-4 sm:px-6">
        <div className="flex flex-col items-center gap-3">
          {tenant.logo_url && (
            <motion.img src={tenant.logo_url} alt={tenant.nome_loja}
              className="h-16 sm:h-20 w-auto object-contain drop-shadow-lg"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} />
          )}
          <motion.h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
            {tenant.nome_loja}
          </motion.h1>
          <motion.p className="text-sm sm:text-base font-semibold tracking-wide uppercase" style={{ color }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}>
            Somos especialistas em Móveis Planejados
          </motion.p>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left column: Media + Copy */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
            {/* Video Player */}
            {hasVideo && (
              <PromoVideoPlayer url={tenant.promo_video_url!} color={color} />
            )}

            {/* Carousel below video */}
            {hasCarousel && (
              <PromoCarousel images={tenant.carousel_images} color={color} />
            )}

            {/* Copy section */}
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                {tenant.headline || "Ganhe seu Projeto 3D Gratuito"}
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed max-w-lg">
                {tenant.sub_headline || `A ${tenant.nome_loja} cria o projeto ideal para sua casa. Preencha o formulário e receba um projeto 3D exclusivo sem custo.`}
              </p>
            </div>

            <div className="space-y-3">
              {benefits.map((b, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <span className="text-gray-700">{b}</span>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">+200 clientes</span> já aprovaram
              </div>
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-5 sticky top-8">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-gray-900">{tenant.cta_text || "Solicite seu Projeto 3D Grátis"}</h2>
                <p className="text-sm text-gray-500">Sem compromisso. Retornamos em até 24h.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-nome" className="text-sm font-medium text-gray-700">Seu Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="lead-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como podemos te chamar?" className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-telefone" className="text-sm font-medium text-gray-700">WhatsApp</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="lead-telefone" type="tel" inputMode="numeric" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email" className="text-sm font-medium text-gray-700">Email <span className="text-gray-400">(opcional)</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-descricao" className="text-sm font-medium text-gray-700">Descreva sua necessidade <span className="text-gray-400">(opcional)</span></Label>
                  <Textarea id="lead-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Cozinha planejada para apartamento de 60m², preciso de projeto que aproveite bem o espaço..." className="rounded-xl border-gray-200 focus:border-primary min-h-[80px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Anexar planta ou fotos <span className="text-gray-400">(opcional)</span></Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gray-300 transition-colors cursor-pointer" onClick={() => document.getElementById("lead-files")?.click()}>
                    <input id="lead-files" type="file" multiple accept="image/*,.pdf,.dwg" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setArquivos(prev => [...prev, ...files]); }} />
                    <Paperclip className="h-5 w-5 mx-auto text-gray-400 mb-1" />
                    <p className="text-sm text-gray-500">Clique para enviar planta, fotos ou documentos</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">JPG, PNG, PDF • Até 10MB</p>
                  </div>
                  {arquivos.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {arquivos.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <button type="button" onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={sending} className="w-full h-13 text-base font-semibold rounded-xl shadow-lg text-white transition-all active:scale-[0.97]" style={{ backgroundColor: color }}>
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : (<>Quero meu Projeto 3D Grátis <ArrowRight className="ml-2 h-5 w-5" /></>)}
                </Button>
              </form>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-400 pt-1">
                <div className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Dados protegidos</div>
                <div className="flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Sem spam</div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400">
        {tenant.nome_loja} · Powered by OrçaMóvel PRO — Todos os Direitos Reservados — 2026
      </footer>
    </div>
  );
}
