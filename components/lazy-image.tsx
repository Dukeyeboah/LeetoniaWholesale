'use client';

import { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}

/**
 * Lazy loading image component using Intersection Observer
 * Only loads the image when it comes into view
 */
export function LazyImage({ src, alt, className = '', onError }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        // Start loading when image is 100px away from viewport
        rootMargin: '100px',
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isInView && src && !hasError) {
      setImageSrc(src);
    }
  }, [isInView, src, hasError]);

  const handleError = () => {
    setHasError(true);
    setImageSrc(null);
    onError?.();
  };

  return (
    <div ref={imgRef} className="w-full h-full">
      {imageSrc && !hasError ? (
        <img
          src={imageSrc}
          alt={alt}
          className={className}
          onError={handleError}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-secondary/20">
          <span className="text-2xl font-serif opacity-30">{alt.charAt(0)}</span>
        </div>
      )}
    </div>
  );
}

