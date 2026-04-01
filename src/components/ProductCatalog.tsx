/**
 * ProductCatalog — Full product catalog management UI
 */
import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package, Plus, Trash2, Pencil, Search, Loader2, Upload, Image as ImageIcon,
  Factory, ChevronLeft, ChevronRight, AlertTriangle, FileSpreadsheet, X, ShoppingCart, Video, Star,
} from "lucide-react";
import { useProductCatalog, calculateSalePrice, type Product, type Supplier, type ProductImage } from "@/hooks/useProductCatalog";
import { ProductDetailModal } from "@/components/catalog/ProductDetailModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { maskCpfCnpj, maskPhone, maskCep } from "@/lib/masks";
import { toast } from "sonner";

const STOCK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  em_estoque: { label: "Em estoque", color: "bg-green-500/10 text-green-700 border-green-200" },
  sob_encomenda: { label: "Sob encomenda", color: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  indisponivel: { label: "Indisponível", color: "bg-red-500/10 text-red-700 border-red-200" },
};

const CATEGORY_OPTIONS = [
  "geral", "decoração", "iluminação", "eletrodoméstico", "móvel pronto",
  "acessório", "ferragem", "complemento", "tapete", "cortina",
];

const ENVIRONMENT_OPTIONS = [
  "cozinha", "lavanderia", "sala", "hall", "area gourmet",
  "banheiro social", "lavabo", "banheiro suite",
  "dormitorio solteiro", "dormitorio infantil", "dormitorio hospede", "dormitorio casal",
  "outros",
];

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ProductFormData {
  id?: string;
  name: string;
  internal_code: string;
  description: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  cost_price: number;
  markup_percentage: number;
  min_sale_price: number;
  manufacturer_code: string;
  environment: string;
  environment_custom: string;
  supplier_id: string;
  stock_quantity: number;
  stock_status: string;
  video_url: string;
}

const emptyForm: ProductFormData = {
  name: "", internal_code: "", description: "", category: "geral",
  width: 0, height: 0, depth: 0, cost_price: 0, markup_percentage: 50,
  min_sale_price: 0, manufacturer_code: "", environment: "", environment_custom: "",
  supplier_id: "", stock_quantity: 0, stock_status: "em_estoque", video_url: "",
};

interface SupplierFormData {
  id: string;
  name: string;
  razao_social: string;
  cnpj: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  whatsapp: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  observacoes: string;
}

const emptySupplierForm: SupplierFormData = {
  id: "", name: "", razao_social: "", cnpj: "", contact_name: "", contact_phone: "",
  contact_email: "", whatsapp: "", endereco: "", bairro: "", cidade: "", uf: "", cep: "", observacoes: "",
};

export function ProductCatalog() {
  const {
    products, suppliers, loading, saving, search, setSearch,
    categoryFilter, setCategoryFilter, categories,
    page, setPage, totalPages, totalCount,
    saveProduct, deleteProduct,
    saveSupplier, deleteSupplier,
    uploadProductImage, uploadProductVideo, loadProductImages, deleteProductImage, setDefaultImage,
    importProducts, loadSuppliers,
  } = useProductCatalog();

  const { currentUser, hasPermission } = useCurrentUser();
  const canManageProducts = hasPermission("cadastrar_produtos");
  const isAdmin = ["administrador", "admin"].includes((currentUser?.cargo_nome || "").toLowerCase());

  const [activeTab, setActiveTab] = useState("products");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Supplier dialog
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>(emptySupplierForm);
  const [cepLoading, setCepLoading] = useState(false);

  // Sale registration
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleQty, setSaleQty] = useState(1);
  const [saleSaving, setSaleSaving] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openSaleDialog = (p: Product) => {
    setSaleProduct(p);
    setSaleQty(1);
    setSaleDialogOpen(true);
  };

  const handleRegisterSale = async () => {
    if (!saleProduct) return;
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Tenant não identificado"); return; }
    setSaleSaving(true);
    const { error } = await supabase.from("product_sales" as any).insert({
      tenant_id: tenantId,
      product_id: saleProduct.id,
      quantity: saleQty,
      unit_price: saleProduct.sale_price,
      total_price: saleProduct.sale_price * saleQty,
    } as any);
    if (error) {
      toast.error("Erro ao registrar venda: " + error.message);
    } else {
      toast.success(`Venda de ${saleQty}x ${saleProduct.name} registrada!`);
      setSaleDialogOpen(false);
    }
    setSaleSaving(false);
  };

  const computedPrice = calculateSalePrice(form.cost_price, form.markup_percentage);

  const openNewProduct = () => {
    setForm(emptyForm);
    setImages([]);
    setVideoFile(null);
    setVideoPreview("");
    setDialogOpen(true);
  };

  const openEditProduct = async (p: Product) => {
    setForm({
      id: p.id,
      name: p.name,
      internal_code: p.internal_code,
      description: p.description,
      category: p.category,
      width: p.width,
      height: p.height,
      depth: p.depth,
      cost_price: p.cost_price,
      markup_percentage: p.markup_percentage,
      min_sale_price: p.min_sale_price || 0,
      manufacturer_code: p.manufacturer_code || "",
      environment: p.environment || "",
      environment_custom: p.environment_custom || "",
      supplier_id: p.supplier_id || "",
      stock_quantity: p.stock_quantity,
      stock_status: p.stock_status,
      video_url: p.video_url || "",
    });
    const imgs = await loadProductImages(p.id);
    setImages(imgs);
    setVideoFile(null);
    setVideoPreview("");
    setDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do produto"); return; }
    if (!form.internal_code.trim()) { toast.error("Informe o código interno"); return; }
    if (form.cost_price <= 0) { toast.error("Informe o preço de custo"); return; }
    if (!form.supplier_id) { toast.error("Selecione um fornecedor"); return; }

    // If there's a video file, upload first and set URL
    let finalVideoUrl = form.video_url;
    if (videoFile && form.id) {
      const uploaded = await uploadProductVideo(form.id, videoFile);
      if (uploaded) finalVideoUrl = uploaded;
    }

    const result = await saveProduct({
      ...form,
      video_url: finalVideoUrl,
      id: form.id || undefined,
      supplier_id: form.supplier_id || null,
    } as any);
    if (result) {
      // If new product and has video file, upload after creation
      if (!form.id && videoFile && result.id) {
        const uploaded = await uploadProductVideo(result.id, videoFile);
        if (uploaded) {
          await saveProduct({ ...result, video_url: uploaded } as any);
        }
      }
      setVideoFile(null);
      setVideoPreview("");
      setDialogOpen(false);
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !form.id) { toast.error("Salve o produto antes de adicionar imagens"); return; }
    setUploading(true);
    for (const file of Array.from(files)) {
      const result = await uploadProductImage(form.id, file);
      if (result) setImages(prev => [...prev, result as any]);
    }
    setUploading(false);
  };

  const handleRemoveImage = async (imgId: string) => {
    await deleteProductImage(imgId);
    setImages(prev => prev.filter(i => i.id !== imgId));
    toast.success("Imagem removida");
  };

  // Import handler
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let items: any[] = [];
    try {
      if (file.name.endsWith(".json")) {
        items = JSON.parse(text);
      } else {
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length < 2) { toast.error("Arquivo CSV vazio"); return; }
        const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
        items = lines.slice(1).map(line => {
          const cols = line.split(";");
          const obj: any = {};
          headers.forEach((h, i) => {
            const val = cols[i]?.trim() || "";
            if (["cost_price", "markup_percentage", "width", "height", "depth", "stock_quantity", "preco_custo", "markup"].includes(h)) {
              obj[h === "preco_custo" ? "cost_price" : h === "markup" ? "markup_percentage" : h] = Number(val.replace(",", ".")) || 0;
            } else if (h === "nome" || h === "name") {
              obj.name = val;
            } else if (h === "codigo" || h === "internal_code" || h === "codigo_interno") {
              obj.internal_code = val;
            } else if (h === "fornecedor" || h === "supplier_name") {
              obj.supplier_name = val;
            } else if (h === "categoria" || h === "category") {
              obj.category = val;
            } else if (h === "descricao" || h === "description") {
              obj.description = val;
            } else {
              obj[h] = val;
            }
          });
          return obj;
        });
      }
      if (!items.length) { toast.error("Nenhum item encontrado"); return; }
      const valid = items.filter(i => i.name && i.internal_code && i.cost_price > 0);
      if (valid.length === 0) { toast.error("Nenhum item válido. Campos obrigatórios: nome, código interno, preço de custo"); return; }
      if (valid.length < items.length) toast.warning(`${items.length - valid.length} itens ignorados por dados incompletos`);
      await importProducts(valid);
    } catch (err) {
      toast.error("Erro ao ler o arquivo");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };

  // CEP lookup for supplier form
  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setSupplierForm(prev => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
      }));
      toast.success("Endereço preenchido pelo CEP!");
    } catch { toast.error("Erro ao buscar CEP"); }
    finally { setCepLoading(false); }
  };

  // Supplier save
  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) { toast.error("Informe o nome"); return; }
    const result = await saveSupplier(
      supplierForm.id
        ? supplierForm as any
        : {
            name: supplierForm.name,
            razao_social: supplierForm.razao_social,
            cnpj: supplierForm.cnpj,
            contact_name: supplierForm.contact_name,
            contact_phone: supplierForm.contact_phone,
            contact_email: supplierForm.contact_email,
            whatsapp: supplierForm.whatsapp,
            endereco: supplierForm.endereco,
            bairro: supplierForm.bairro,
            cidade: supplierForm.cidade,
            uf: supplierForm.uf,
            cep: supplierForm.cep,
            observacoes: supplierForm.observacoes,
            ativo: true,
          } as any
    );
    if (result) {
      setSupplierDialogOpen(false);
      setSupplierForm(emptySupplierForm);
      // Auto-select the new supplier in the product form
      if (!supplierForm.id && result.id) {
        setForm(f => ({ ...f, supplier_id: (result as any).id }));
      }
    }
  };

  const openNewSupplier = () => {
    setSupplierForm(emptySupplierForm);
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setSupplierForm({
      id: s.id,
      name: s.name,
      razao_social: s.razao_social || "",
      cnpj: s.cnpj || "",
      contact_name: s.contact_name || "",
      contact_phone: s.contact_phone || "",
      contact_email: s.contact_email || "",
      whatsapp: s.whatsapp || "",
      endereco: s.endereco || "",
      bairro: s.bairro || "",
      cidade: s.cidade || "",
      uf: s.uf || "",
      cep: s.cep || "",
      observacoes: s.observacoes || "",
    });
    setSupplierDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="products" className="gap-1.5 text-xs"><Package className="h-3.5 w-3.5" />Produtos</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1.5 text-xs"><Factory className="h-3.5 w-3.5" />Fornecedor Decorados</TabsTrigger>
        </TabsList>

        {/* === PRODUCTS TAB === */}
        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Catálogo de Produtos ({totalCount})
                </CardTitle>
                {canManageProducts && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => importInputRef.current?.click()}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Importar
                    </Button>
                    <input ref={importInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImport} />
                    <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openNewProduct}>
                      <Plus className="h-3.5 w-3.5" /> Novo Produto
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar por nome ou código..." className="pl-8 h-9 text-sm" />
                </div>
                <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger className="h-9 w-[160px] text-xs">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {[...new Set([...CATEGORY_OPTIONS, ...categories])].sort().map(c => (
                      <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : products.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {search || categoryFilter ? "Nenhum produto encontrado" : "Nenhum produto cadastrado. Clique em \"Novo Produto\"."}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Nome</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Categoria</TableHead>
                          {isAdmin && <TableHead className="text-xs text-right">Custo</TableHead>}
                          {isAdmin && <TableHead className="text-xs text-right hidden md:table-cell">Markup</TableHead>}
                          <TableHead className="text-xs text-right">Venda</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Estoque</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Fornecedor</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map(p => {
                          const status = STOCK_STATUS_LABELS[p.stock_status] || STOCK_STATUS_LABELS.em_estoque;
                          return (
                            <TableRow key={p.id} className="cursor-pointer" onClick={() => { setDetailProduct(p); setDetailOpen(true); }}>
                              <TableCell className="text-xs font-mono">{p.internal_code}</TableCell>
                              <TableCell className="text-xs font-medium max-w-[200px] truncate">{p.name}</TableCell>
                              <TableCell className="text-xs capitalize hidden sm:table-cell">{p.category}</TableCell>
                              {isAdmin && <TableCell className="text-xs text-right">{formatBRL(p.cost_price)}</TableCell>}
                              {isAdmin && <TableCell className="text-xs text-right hidden md:table-cell">{p.markup_percentage}%</TableCell>}
                              <TableCell className="text-xs text-right font-semibold text-primary">{formatBRL(p.sale_price)}</TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                                  {p.stock_quantity} — {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs hidden lg:table-cell">{p.supplier?.name || "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Registrar venda" onClick={() => openSaleDialog(p)}>
                                    <ShoppingCart className="h-3.5 w-3.5" />
                                  </Button>
                                  {canManageProducts && (
                                    <>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditProduct(p)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteProduct(p.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === SUPPLIERS TAB === */}
        <TabsContent value="suppliers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  Fornecedor Decorados ({suppliers.length})
                </CardTitle>
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openNewSupplier}>
                  <Plus className="h-3.5 w-3.5" /> Novo Fornecedor
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {suppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum fornecedor cadastrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">CNPJ</TableHead>
                      <TableHead className="text-xs">Contato</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Telefone</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Cidade/UF</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs font-medium">{s.name}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{s.cnpj || "—"}</TableCell>
                        <TableCell className="text-xs">{s.contact_name || "—"}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{s.contact_phone || "—"}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell">{s.cidade ? `${s.cidade}/${s.uf}` : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSupplier(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSupplier(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* === PRODUCT DIALOG === */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              {form.id ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ maxHeight: "calc(90dvh - 130px)" }}>
            <div className="space-y-3 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Código Interno *</Label>
                  <Input value={form.internal_code} onChange={e => setForm(f => ({ ...f, internal_code: e.target.value }))} className="mt-1 h-9 text-sm font-mono" placeholder="EX-001" />
                </div>
                <div>
                  <Label className="text-xs">Nome *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Nome do produto" />
                </div>
                <div>
                  <Label className="text-xs">Cód. Fabricante</Label>
                  <Input value={form.manufacturer_code} onChange={e => setForm(f => ({ ...f, manufacturer_code: e.target.value }))} className="mt-1 h-9 text-sm font-mono" placeholder="Código do fabricante" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 text-sm min-h-[50px]" placeholder="Descrição detalhada..." />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Largura (cm)</Label>
                  <Input type="number" value={form.width || ""} onChange={e => setForm(f => ({ ...f, width: Number(e.target.value) }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Altura (cm)</Label>
                  <Input type="number" value={form.height || ""} onChange={e => setForm(f => ({ ...f, height: Number(e.target.value) }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Profundidade (cm)</Label>
                  <Input type="number" value={form.depth || ""} onChange={e => setForm(f => ({ ...f, depth: Number(e.target.value) }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>

              {/* Ambiente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ambiente</Label>
                  <Select value={form.environment} onValueChange={v => setForm(f => ({ ...f, environment: v, environment_custom: v === "outros" ? f.environment_custom : "" }))}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Selecione o ambiente" /></SelectTrigger>
                    <SelectContent>
                      {ENVIRONMENT_OPTIONS.map(e => <SelectItem key={e} value={e} className="text-xs capitalize">{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.environment === "outros" && (
                  <div>
                    <Label className="text-xs">Ambiente Personalizado</Label>
                    <Input value={form.environment_custom} onChange={e => setForm(f => ({ ...f, environment_custom: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Informe o ambiente" />
                  </div>
                )}
              </div>

              {/* Pricing */}
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <p className="text-xs font-semibold mb-2">Precificação</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Custo (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.cost_price || ""}
                        onChange={e => setForm(f => ({ ...f, cost_price: Number(e.target.value) }))}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Markup (%)</Label>
                      <Input
                        type="number"
                        value={form.markup_percentage || ""}
                        onChange={e => setForm(f => ({ ...f, markup_percentage: Number(e.target.value) }))}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço Venda</Label>
                      <div className="mt-1 h-9 flex items-center text-sm font-bold text-primary bg-primary/5 rounded-md px-3 border">
                        {formatBRL(computedPrice)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Preço Mín. Venda</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.min_sale_price || ""}
                        onChange={e => setForm(f => ({ ...f, min_sale_price: Number(e.target.value) }))}
                        className="mt-1 h-9 text-sm"
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Supplier & Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Fornecedor *</Label>
                  <div className="flex gap-1 mt-1">
                    <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
                      <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 && <SelectItem value="none" disabled className="text-xs">Cadastre um fornecedor primeiro</SelectItem>}
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={openNewSupplier} title="Cadastrar novo fornecedor">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Qtd. Estoque</Label>
                  <Input type="number" value={form.stock_quantity || ""} onChange={e => setForm(f => ({ ...f, stock_quantity: Number(e.target.value) }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Status Estoque</Label>
                  <Select value={form.stock_status} onValueChange={v => setForm(f => ({ ...f, stock_status: v }))}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_estoque" className="text-xs">Em estoque</SelectItem>
                      <SelectItem value="sob_encomenda" className="text-xs">Sob encomenda</SelectItem>
                      <SelectItem value="indisponivel" className="text-xs">Indisponível</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Video: URL or Upload */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Vídeo do Produto</Label>
                <Input
                  value={form.video_url}
                  onChange={e => { setForm(f => ({ ...f, video_url: e.target.value })); setVideoFile(null); setVideoPreview(""); }}
                  className="h-9 text-sm"
                  placeholder="https://youtube.com/watch?v=... ou link direto"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">ou</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => videoInputRef.current?.click()}>
                    <Upload className="h-3 w-3" /> Upload Vídeo
                  </Button>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setVideoFile(f);
                      setVideoPreview(URL.createObjectURL(f));
                      setForm(prev => ({ ...prev, video_url: "" }));
                    }
                  }} />
                  {videoFile && <span className="text-xs text-muted-foreground truncate max-w-[150px]">{videoFile.name}</span>}
                </div>
                {/* Video preview */}
                {videoPreview && (
                  <video src={videoPreview} controls className="w-full max-h-40 rounded-md border" />
                )}
                {!videoPreview && form.video_url && (
                  (() => {
                    const ytMatch = form.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                    if (ytMatch) return <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}`} className="w-full aspect-video rounded-md border" allowFullScreen />;
                    const vimeoMatch = form.video_url.match(/vimeo\.com\/(\d+)/);
                    if (vimeoMatch) return <iframe src={`https://player.vimeo.com/video/${vimeoMatch[1]}`} className="w-full aspect-video rounded-md border" allowFullScreen />;
                    return <video src={form.video_url} controls className="w-full max-h-40 rounded-md border" />;
                  })()
                )}
              </div>

              {/* Images (only for existing products) */}
              {form.id && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Imagens do Produto</Label>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Upload
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e.target.files)} />
                  </div>
                  {images.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhuma imagem adicionada</p>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {images.map(img => (
                        <div key={img.id} className="relative group w-20 h-20 rounded-md overflow-hidden border">
                          <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                          <button
                            className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRemoveImage(img.id)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute bottom-0.5 left-0.5">
                            <button
                              className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium transition-colors ${img.is_default ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                              onClick={async () => {
                                await setDefaultImage(form.id!, img.id);
                                setImages(prev => prev.map(i => ({ ...i, is_default: i.id === img.id })));
                                toast.success("Imagem padrão definida");
                              }}
                              title={img.is_default ? "Imagem padrão" : "Definir como padrão"}
                            >
                              <Star className="h-2.5 w-2.5" />
                              {img.is_default ? "Padrão" : ""}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!form.id && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Salve o produto para adicionar imagens
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="px-4 sm:px-6 py-3 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSaveProduct} disabled={saving} className="w-full sm:w-auto gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {form.id ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === SUPPLIER DIALOG (COMPLETO) === */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              {supplierForm.id ? "Editar Fornecedor Decorados" : "Novo Fornecedor Decorados"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ maxHeight: "calc(90dvh - 130px)" }}>
            <div className="space-y-3 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome Fantasia *</Label>
                  <Input value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Nome fantasia" />
                </div>
                <div>
                  <Label className="text-xs">Razão Social</Label>
                  <Input value={supplierForm.razao_social} onChange={e => setSupplierForm(f => ({ ...f, razao_social: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input value={supplierForm.cnpj} onChange={e => setSupplierForm(f => ({ ...f, cnpj: maskCpfCnpj(e.target.value) }))} className="mt-1 h-9 text-sm" placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label className="text-xs">Pessoa de Contato</Label>
                  <Input value={supplierForm.contact_name} onChange={e => setSupplierForm(f => ({ ...f, contact_name: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Telefone</Label>
                  <Input value={supplierForm.contact_phone} onChange={e => setSupplierForm(f => ({ ...f, contact_phone: maskPhone(e.target.value) }))} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input value={supplierForm.whatsapp} onChange={e => setSupplierForm(f => ({ ...f, whatsapp: maskPhone(e.target.value) }))} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={supplierForm.contact_email} onChange={e => setSupplierForm(f => ({ ...f, contact_email: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CEP</Label>
                  <div className="relative">
                    <Input
                      value={supplierForm.cep}
                      onChange={e => {
                        const masked = maskCep(e.target.value);
                        setSupplierForm(f => ({ ...f, cep: masked }));
                        if (masked.replace(/\D/g, "").length === 8) fetchCep(masked);
                      }}
                      className="mt-1 h-9 text-sm pr-8"
                      placeholder="00000-000"
                    />
                    {cepLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Endereço</Label>
                  <Input value={supplierForm.endereco} onChange={e => setSupplierForm(f => ({ ...f, endereco: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Bairro</Label>
                  <Input value={supplierForm.bairro} onChange={e => setSupplierForm(f => ({ ...f, bairro: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Input value={supplierForm.cidade} onChange={e => setSupplierForm(f => ({ ...f, cidade: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">UF</Label>
                  <Select value={supplierForm.uf} onValueChange={v => setSupplierForm(f => ({ ...f, uf: v }))}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={supplierForm.observacoes} onChange={e => setSupplierForm(f => ({ ...f, observacoes: e.target.value }))} className="mt-1 text-sm min-h-[60px]" />
              </div>
            </div>
          </div>

          <DialogFooter className="px-4 sm:px-6 py-3 border-t shrink-0">
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSaveSupplier} disabled={saving} className="w-full sm:w-auto gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {supplierForm.id ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Registration Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-emerald-600" /> Registrar Venda
            </DialogTitle>
          </DialogHeader>
          {saleProduct && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium">{saleProduct.name}</p>
                <p className="text-xs text-muted-foreground">{saleProduct.internal_code} • {saleProduct.category}</p>
                <p className="text-sm font-semibold text-primary mt-1">{formatBRL(saleProduct.sale_price)} / un.</p>
              </div>
              <div>
                <Label className="text-xs">Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={saleQty}
                  onChange={e => setSaleQty(Math.max(1, Number(e.target.value)))}
                  className="mt-1"
                />
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-200">
                <p className="text-xs text-muted-foreground">Total da venda</p>
                <p className="text-lg font-bold text-emerald-700">{formatBRL(saleProduct.sale_price * saleQty)}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegisterSale} disabled={saleSaving} className="gap-1.5">
              {saleSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <ShoppingCart className="h-3.5 w-3.5" />
              Registrar Venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Detail Modal */}
      <ProductDetailModal product={detailProduct} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
