import {useState, useEffect, useCallback} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Avatar, AvatarImage, AvatarFallback} from "@/components/ui/avatar";
import {Separator} from "@/components/ui/separator";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Calendar} from "@/components/ui/calendar";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Progress} from "@/components/ui/progress";
import {Badge} from "@/components/ui/badge";
import {Save, Upload, CalendarIcon, Eye, EyeOff, Facebook, Instagram, Linkedin, Palette, RotateCcw, Check} from "lucide-react";
import {cn} from "@/lib/utils";
import {format} from "date-fns";
import {supabase} from "@/lib/supabaseClient";
import {useAuth} from "@/contexts/AuthContext";
import {toast} from "sonner";
import {COLOR_THEMES, getStoredThemeId, applyTheme, type ColorTheme} from "@/lib/colorThemes";

// TikTok icon
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52V6.8a4.84 4.84 0 01-1-.11z" />
    </svg>
  );
}

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

interface ProfileData {
  nome_completo: string;
  apelido: string;
  email: string;
  telefone: string;
  telefone_whatsapp: string;
  data_nascimento: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  linkedin: string;
}

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)})${d.slice(2)}`;
  return `(${d.slice(0,2)})${d.slice(2,7)}-${d.slice(7)}`;
}

function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

export function UserProfileModal({ open, onClose }: UserProfileModalProps) {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [birthDate, setBirthDate] = useState<Date | undefined>();
  const [triedSave, setTriedSave] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(getStoredThemeId);

  const [form, setForm] = useState<ProfileData>({
    nome_completo: "", apelido: "", email: "", telefone: "", telefone_whatsapp: "",
    data_nascimento: "", cep: "", endereco: "", numero: "", complemento: "",
    bairro: "", cidade: "", uf: "", facebook: "", instagram: "", tiktok: "", linkedin: "",
  });

  const requiredFields: { key: keyof ProfileData | "birthDate"; label: string }[] = [
    { key: "nome_completo", label: "Nome Completo" },
    { key: "email", label: "Email" },
    { key: "telefone_whatsapp", label: "WhatsApp" },
  ];

  const isFieldInvalid = (key: string) => {
    if (!triedSave) return false;
    if (key === "birthDate") return !birthDate;
    return !form[key as keyof ProfileData]?.trim();
  };

  const invalidClass = (key: string) =>
    isFieldInvalid(key) ? "border-destructive ring-1 ring-destructive/30" : "";

  // Profile completeness
  const profileFields = [
    { filled: !!form.nome_completo.trim() },
    { filled: !!form.apelido.trim() },
    { filled: !!form.email.trim() },
    { filled: !!form.telefone.trim() },
    { filled: !!form.telefone_whatsapp.trim() },
    { filled: !!birthDate },
    { filled: !!fotoUrl },
    { filled: !!form.cep.trim() },
    { filled: !!form.endereco.trim() },
    { filled: !!form.cidade.trim() },
    { filled: !!form.uf.trim() },
  ];
  const filledCount = profileFields.filter(f => f.filled).length;
  const progressPercent = Math.round((filledCount / profileFields.length) * 100);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;

    // Try by app user id first
    let { data } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // Fallback: try by auth_user_id
    if (!data) {
      const { data: session } = await supabase.auth.getSession();
      const authUid = session?.session?.user?.id;
      if (authUid) {
        const res = await supabase
          .from("usuarios")
          .select("*")
          .eq("auth_user_id", authUid)
          .maybeSingle();
        data = res.data;
      }
    }

    if (data) {
      setForm({
        nome_completo: data.nome_completo || "",
        apelido: (data as any).apelido || "",
        email: (data as any).email || "",
        telefone: (data as any).telefone || "",
        telefone_whatsapp: (data as any).telefone_whatsapp || "",
        data_nascimento: (data as any).data_nascimento || "",
        cep: (data as any).cep || "",
        endereco: (data as any).endereco || "",
        numero: (data as any).numero || "",
        complemento: (data as any).complemento || "",
        bairro: (data as any).bairro || "",
        cidade: (data as any).cidade || "",
        uf: (data as any).uf || "",
        facebook: (data as any).facebook || "",
        instagram: (data as any).instagram || "",
        tiktok: (data as any).tiktok || "",
        linkedin: (data as any).linkedin || "",
      });
      setFotoUrl((data as any).foto_url || null);
      if ((data as any).data_nascimento) {
        const parts = ((data as any).data_nascimento as string).split("-");
        setBirthDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      }
    }
  }, [user?.id]);

  const getAuthIdentity = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user;

    return {
      authUid: authUser?.id ?? null,
      authEmail: authUser?.email?.trim().toLowerCase() ?? null,
    };
  }, []);

  useEffect(() => {
    if (open) {
      loadProfile();
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    }
  }, [open, loadProfile]);

  const handleChange = (field: keyof ProfileData, value: string) => {
    if (field === "telefone" || field === "telefone_whatsapp") {
      setForm(p => ({ ...p, [field]: maskPhone(value) }));
    } else if (field === "cep") {
      setForm(p => ({ ...p, [field]: maskCep(value) }));
    } else {
      setForm(p => ({ ...p, [field]: value }));
    }
  };

  const buscarCep = async () => {
    const cepNum = form.cep.replace(/\D/g, "");
    if (cepNum.length !== 8) { toast.error("CEP inválido"); return; }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepNum}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setForm(p => ({
        ...p,
        endereco: data.logradouro || "",
        bairro: data.bairro || "",
        cidade: data.localidade || "",
        uf: data.uf || "",
        complemento: data.complemento || p.complemento,
      }));
      toast.success("Endereço preenchido!");
    } catch { toast.error("Erro ao buscar CEP"); }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploading(true);
    const { authUid } = await getAuthIdentity();
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      toast.error("Erro ao enviar foto");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = urlData.publicUrl + `?t=${Date.now()}`;

    const photoPayload = {
      foto_url: url,
      updated_at: new Date().toISOString(),
      ...(authUid ? { auth_user_id: authUid } : {}),
    };

    const { error: updateErr } = authUid
      ? await supabase
          .from("usuarios")
          .update(photoPayload as any)
          .or(`id.eq.${user.id},auth_user_id.eq.${authUid}`)
      : await supabase
          .from("usuarios")
          .update(photoPayload as any)
          .eq("id", user.id);

    if (updateErr) {
      toast.error("Erro ao salvar foto do perfil");
      setUploading(false);
      return;
    }

    setFotoUrl(url);
    toast.success("Foto atualizada!");
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setTriedSave(true);

    const missing = requiredFields.filter(f => {
      if (f.key === "birthDate") return !birthDate;
      return !form[f.key as keyof ProfileData]?.trim();
    });
    if (missing.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missing.map(m => m.label).join(", ")}`);
      return;
    }

    setSaving(true);
    const { authUid, authEmail } = await getAuthIdentity();

    const updateData: Record<string, unknown> = {
      nome_completo: form.nome_completo,
      apelido: form.apelido || null,
      email: form.email || null,
      telefone: form.telefone || null,
      telefone_whatsapp: form.telefone_whatsapp || null,
      data_nascimento: birthDate ? format(birthDate, "yyyy-MM-dd") : null,
      cep: form.cep || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      facebook: form.facebook || null,
      instagram: form.instagram || null,
      tiktok: form.tiktok || null,
      linkedin: form.linkedin || null,
      updated_at: new Date().toISOString(),
      ...(authUid ? { auth_user_id: authUid } : {}),
    };

    const primaryResult = authUid
      ? await supabase
          .from("usuarios")
          .update(updateData as any)
          .or(`id.eq.${user.id},auth_user_id.eq.${authUid}`)
          .select("id, auth_user_id")
      : await supabase
          .from("usuarios")
          .update(updateData as any)
          .eq("id", user.id)
          .select("id, auth_user_id");

    let updatedRows = primaryResult.data;

    if (primaryResult.error) {
      console.error("Profile update error:", primaryResult.error);
      toast.error("Erro ao salvar: " + primaryResult.error.message);
      setSaving(false);
      return;
    }

    if ((!updatedRows || updatedRows.length === 0) && authEmail) {
      const retryResult = await supabase
        .from("usuarios")
        .update(updateData as any)
        .ilike("email", authEmail)
        .select("id, auth_user_id");

      if (retryResult.error) {
        console.error("Retry update by email error:", retryResult.error);
        toast.error("Erro ao salvar perfil. Verifique suas permissões.");
        setSaving(false);
        return;
      }

      updatedRows = retryResult.data;
    }

    if (!updatedRows || updatedRows.length === 0) {
      toast.error("Não foi possível salvar. A política de segurança do banco ainda não permite atualizar este perfil.");
      setSaving(false);
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); setSaving(false); return; }
      if (newPassword !== confirmPassword) { toast.error("As senhas não coincidem"); setSaving(false); return; }
      const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
      if (passErr) { toast.error("Erro ao alterar senha: " + passErr.message); setSaving(false); return; }
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    }

    toast.success("Perfil atualizado com sucesso!");
    await loadProfile();
    await refreshUser();
    setSaving(false);
  };

  const initials = (form.nome_completo || "U").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl">Meu Perfil</DialogTitle>
          <div className="flex items-center gap-3 mt-2">
            <Progress value={progressPercent} className="h-2 flex-1" />
            <span className={cn(
              "text-xs font-bold min-w-[3rem] text-right",
              progressPercent === 100 ? "text-emerald-600" : "text-muted-foreground"
            )}>
              {progressPercent}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {progressPercent === 100 ? "✅ Perfil completo!" : `${filledCount} de ${profileFields.length} campos preenchidos`}
          </p>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="p-6 pt-4 space-y-6">
            {/* Photo + Cargo */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  {fotoUrl ? <AvatarImage src={fotoUrl} alt={form.nome_completo} /> : null}
                  <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Upload className="h-5 w-5 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} disabled={uploading} />
                </label>
              </div>
              <div>
                <p className="font-semibold text-foreground text-lg">{form.nome_completo || "Usuário"}</p>
                {user?.cargo_nome && (
                  <Badge variant="secondary" className="mt-1">{user.cargo_nome}</Badge>
                )}
                <p className="text-xs text-muted-foreground mt-1">Clique na foto para alterar</p>
              </div>
            </div>

            <Separator />

            {/* Personal Data */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Dados Pessoais</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input value={form.nome_completo} onChange={(e) => handleChange("nome_completo", e.target.value)} className={cn("mt-1", invalidClass("nome_completo"))} />
                  {isFieldInvalid("nome_completo") && <p className="text-xs text-destructive mt-1">Campo obrigatório</p>}
                </div>
                <div>
                  <Label>Apelido</Label>
                  <Input value={form.apelido} onChange={(e) => handleChange("apelido", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input value={form.email} onChange={(e) => handleChange("email", e.target.value)} className={cn("mt-1", invalidClass("email"))} type="email" />
                  {isFieldInvalid("email") && <p className="text-xs text-destructive mt-1">Campo obrigatório</p>}
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => handleChange("telefone", e.target.value)} className="mt-1" placeholder="(99)99999-9999" />
                </div>
                <div>
                  <Label>WhatsApp *</Label>
                  <Input value={form.telefone_whatsapp} onChange={(e) => handleChange("telefone_whatsapp", e.target.value)} className={cn("mt-1", invalidClass("telefone_whatsapp"))} placeholder="(99)99999-9999" />
                  {isFieldInvalid("telefone_whatsapp") && <p className="text-xs text-destructive mt-1">Campo obrigatório</p>}
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal", !birthDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {birthDate ? format(birthDate, "dd/MM/yyyy") : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={birthDate}
                        onSelect={setBirthDate}
                        captionLayout="dropdown-buttons"
                        fromYear={1940}
                        toYear={new Date().getFullYear()}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>CEP</Label>
                    <Input value={form.cep} onChange={(e) => handleChange("cep", e.target.value)} className="mt-1" placeholder="00000-000" />
                  </div>
                  <Button variant="outline" size="sm" onClick={buscarCep} className="mb-0">Buscar</Button>
                </div>
                <div className="md:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.endereco} onChange={(e) => handleChange("endereco", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => handleChange("numero", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input value={form.complemento} onChange={(e) => handleChange("complemento", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro} onChange={(e) => handleChange("bairro", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => handleChange("cidade", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>UF</Label>
                  <select
                    value={form.uf}
                    onChange={(e) => handleChange("uf", e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecione</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Social Media */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Redes Sociais</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2"><Facebook className="h-4 w-4 text-blue-600" /> Facebook</Label>
                  <Input value={form.facebook} onChange={(e) => handleChange("facebook", e.target.value)} className="mt-1" placeholder="https://facebook.com/seu-perfil" />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-500" /> Instagram</Label>
                  <Input value={form.instagram} onChange={(e) => handleChange("instagram", e.target.value)} className="mt-1" placeholder="@seu-usuario" />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><TikTokIcon className="h-4 w-4" /> TikTok</Label>
                  <Input value={form.tiktok} onChange={(e) => handleChange("tiktok", e.target.value)} className="mt-1" placeholder="@seu-usuario" />
                </div>
                <div>
                  <Label className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-blue-700" /> LinkedIn</Label>
                  <Input value={form.linkedin} onChange={(e) => handleChange("linkedin", e.target.value)} className="mt-1" placeholder="https://linkedin.com/in/seu-perfil" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Password Change */}
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowPasswordSection(!showPasswordSection)} className="gap-2 text-muted-foreground">
                {showPasswordSection ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPasswordSection ? "Ocultar alteração de senha" : "Alterar senha"}
              </Button>
              {showPasswordSection && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label>Nova Senha</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showPass ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-2.5 text-muted-foreground">
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label>Confirmar Senha</Label>
                    <Input
                      type={showPass ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="mt-1"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Save */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || !form.nome_completo} className="gap-2 px-8">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Perfil"}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
