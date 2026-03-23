import { useEffect, useState, memo } from "react";
import { Box } from "lucide-react";
import { persistProjectThumbnail } from "./thumbnailRenderer";

interface ProjectThumbnailProps {
  projectId: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  name: string;
}

export const ProjectThumbnail = memo(function ProjectThumbnail({ projectId, fileUrl, thumbnailUrl, name }: ProjectThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(thumbnailUrl || null);
  const [loading, setLoading] = useState(!thumbnailUrl);

  useEffect(() => {
    setThumbSrc(thumbnailUrl || null);

    if (thumbnailUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const persistedUrl = await Promise.race([
          persistProjectThumbnail(projectId, fileUrl),
          new Promise<string>((_, reject) => {
            window.setTimeout(() => reject(new Error("thumbnail-timeout")), 12000);
          }),
        ]);

        if (!cancelled) {
          setThumbSrc(persistedUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, projectId, thumbnailUrl]);

  return (
    <div className="h-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
      {thumbSrc ? (
        <img src={thumbSrc} alt={`Miniatura do projeto ${name}`} className="w-full h-full object-contain" loading="lazy" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Box className="h-10 w-10" />
          <span className="text-[10px]">{loading ? "Gerando miniatura..." : "Sem miniatura"}</span>
        </div>
      )}
    </div>
  );
});
