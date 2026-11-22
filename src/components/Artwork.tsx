import { useState } from "react";
import { Music2 } from "lucide-react";

interface ArtworkProps {
  src?: string;
  alt: string;
  className?: string;
  title?: string;
  rounded?: "small" | "medium" | "large";
}

const palette = ["#183c47", "#573a2f", "#2f405f", "#4d304c", "#34492f", "#544c27"];

function colorFor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function Artwork({
  src,
  alt,
  className = "",
  title = "",
  rounded = "medium",
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`artwork artwork-${rounded} ${className}`}
      style={!showImage ? { backgroundColor: colorFor(title || alt) } : undefined}
      aria-label={alt}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Music2 aria-hidden="true" />
      )}
    </div>
  );
}
