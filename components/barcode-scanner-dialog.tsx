'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ScanStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  lastResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void | Promise<void>;
  lastResult?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastHandledRef = useRef<{ code: string; at: number } | null>(null);
  const handlingRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [status, setStatus] = useState<ScanStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!open) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setStatus({ kind: 'idle' });
      lastHandledRef.current = null;
      handlingRef.current = false;
      return;
    }

    let cancelled = false;

    const start = async () => {
      setStatus({ kind: 'starting' });
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          async (result) => {
            if (!result || cancelled) return;
            const code = result.getText().trim();
            if (!code) return;

            const now = Date.now();
            const last = lastHandledRef.current;
            if (last && last.code === code && now - last.at < 2500) return;
            if (handlingRef.current) return;

            handlingRef.current = true;
            lastHandledRef.current = { code, at: now };
            try {
              await onScanRef.current(code);
            } finally {
              handlingRef.current = false;
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStatus({ kind: 'ready' });
      } catch (e) {
        console.error('barcode scanner start', e);
        if (!cancelled) {
          setStatus({
            kind: 'error',
            message:
              e instanceof Error &&
              /permission|notallowed|denied/i.test(e.message)
                ? 'Camera permission denied. Allow camera access and try again.'
                : 'Could not start the camera. Use HTTPS and allow camera access.',
          });
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className='flex max-h-[min(92vh,40rem)] w-[calc(100%-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md'
      >
        <DialogHeader className='shrink-0 space-y-1 border-b px-4 py-3 pr-12'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Camera className='h-4 w-4' />
            Scan barcode
          </DialogTitle>
          <DialogDescription className='text-xs'>
            Point the camera at a product barcode. Matches are marked arrived
            automatically — keep scanning the next item.
          </DialogDescription>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='absolute top-2 right-2 h-9 w-9'
            onClick={() => onOpenChange(false)}
            aria-label='Close scanner'
          >
            <X className='h-4 w-4' />
          </Button>
        </DialogHeader>

        <div className='relative min-h-0 flex-1 bg-black'>
          <video
            ref={videoRef}
            className='aspect-[3/4] w-full object-cover sm:aspect-video'
            muted
            playsInline
            autoPlay
          />
          <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            <div className='h-40 w-[78%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' />
          </div>
          {status.kind === 'starting' ? (
            <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
              <Loader2 className='h-8 w-8 animate-spin text-white' />
            </div>
          ) : null}
          {status.kind === 'error' ? (
            <div className='absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center'>
              <p className='text-sm text-white'>{status.message}</p>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            'shrink-0 border-t px-4 py-3 text-sm',
            lastResult
              ? 'bg-emerald-50 text-emerald-950'
              : 'bg-muted/40 text-muted-foreground'
          )}
        >
          {lastResult ? lastResult : 'Waiting for a barcode…'}
        </div>
      </DialogContent>
    </Dialog>
  );
}
