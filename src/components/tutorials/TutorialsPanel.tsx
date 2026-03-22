import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Play, Clock, BookOpen, Film } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";

interface Tutorial {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  video_url: string;
  thumbnail_url: string | null;
  duracao_segundos: number | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Início": "bg-primary/10 text-primary",
  "Clientes": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Simulador": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Financeiro": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Configurações": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "VendaZap": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Campanhas": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TutorialsPanel() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [playingTutorial, setPlayingTutorial] = useState<Tutorial | null>(null);

  useEffect(() => {
    fetchTutorials();
  }, []);

  const fetchTutorials = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tutorials" as any)
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    setTutorials((data as any[]) || []);
    setLoading(false);
  };

  const categories = Array.from(new Set(tutorials.map((t) => t.categoria))).sort();

  const filtered = tutorials.filter((t) => {
    const matchSearch =
      !search ||
      t.titulo.toLowerCase().includes(search.toLowerCase()) ||
      (t.descricao && t.descricao.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = !selectedCategory || t.categoria === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Film className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Tutoriais do Sistema</h3>
          <p className="text-sm text-muted-foreground">
            Aprenda a usar cada funcionalidade com vídeos práticos
          </p>
        </div>
      </div>

      {/* Search & filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tutorial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen className="h-4 w-4" />
          {filtered.length} {filtered.length === 1 ? "tutorial" : "tutoriais"}
        </span>
        {categories.length > 0 && (
          <span className="flex items-center gap-1">
            <Film className="h-4 w-4" />
            {categories.length} {categories.length === 1 ? "categoria" : "categorias"}
          </span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video bg-muted rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Film className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {search || selectedCategory
              ? "Nenhum tutorial encontrado com esses filtros"
              : "Nenhum tutorial disponível ainda"}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Os tutoriais serão adicionados pelo administrador do sistema
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tutorial) => (
            <Card
              key={tutorial.id}
              className="group cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden border-border/50"
              onClick={() => setPlayingTutorial(tutorial)}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-muted overflow-hidden">
                {tutorial.thumbnail_url ? (
                  <img
                    src={tutorial.thumbnail_url}
                    alt={tutorial.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20">
                    <Film className="h-12 w-12 text-primary/40" />
                  </div>
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 shadow-xl">
                    <Play className="h-7 w-7 text-primary-foreground ml-0.5" />
                  </div>
                </div>

                {/* Duration */}
                {tutorial.duracao_segundos && (
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    {formatDuration(tutorial.duracao_segundos)}
                  </span>
                )}
              </div>

              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm text-foreground line-clamp-2 leading-tight">
                    {tutorial.titulo}
                  </h4>
                </div>
                {tutorial.descricao && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {tutorial.descricao}
                  </p>
                )}
                <Badge
                  variant="secondary"
                  className={CATEGORY_COLORS[tutorial.categoria] || "bg-muted text-muted-foreground"}
                >
                  {tutorial.categoria}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      {playingTutorial && (
        <VideoPlayer
          src={playingTutorial.video_url}
          title={playingTutorial.titulo}
          onClose={() => setPlayingTutorial(null)}
        />
      )}
    </div>
  );
}
