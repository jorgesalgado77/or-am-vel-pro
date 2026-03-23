import { useEffect, useState, memo } from "react";
import { Box } from "lucide-react";

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
    setLoading(false);
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
