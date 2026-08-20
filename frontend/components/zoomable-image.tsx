"use client";

import { CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";

export function ZoomableImage({ src, alt, className = "", imageStyle }: {
  src: string;
  alt: string;
  className?: string;
  imageStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button className={`zoomable-image ${className}`} type="button" onClick={() => setOpen(true)} aria-label={`${alt} 크게 보기`}>
      <img src={src} alt={alt} style={imageStyle}/>
      <span><ZoomIn size={16}/>클릭하여 확대</span>
    </button>
    {mounted && open && createPortal(
      <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${alt} 확대 보기`} onMouseDown={() => setOpen(false)}>
        <div className="image-lightbox-content" onMouseDown={(event) => event.stopPropagation()}>
          <header><strong>{alt}</strong><button type="button" onClick={() => setOpen(false)} aria-label="확대 이미지 닫기"><X size={22}/></button></header>
          <div><img src={src} alt={alt}/></div>
        </div>
      </div>,
      document.body,
    )}
  </>;
}
