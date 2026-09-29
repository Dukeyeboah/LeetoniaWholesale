'use client';

import { useRef, useState } from 'react';
import { Loader2, Plus, Upload } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  buildReceivalFromImport,
  defaultMonthKeyFromDate,
  generateReceivalDocId,
  parseReceivalImportFile,
  sanitizeReceivalLinesForFirestore,
} from '@/lib/warehouse-receival';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type AdminReceivalCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: string[];
  onCreated: (id: string) => void;
};

export function AdminReceivalCreateDialog({
  open,
  onOpenChange,
  existingIds,
  onCreated,
}: AdminReceivalCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [monthKey, setMonthKey] = useState(defaultMonthKeyFromDate());
  const [pasteText, setPasteText] = useState('');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle('');
    setMonthKey(defaultMonthKeyFromDate());
    setPasteText('');
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseReceivalImportFile(text, file.name);
      if (rows.length === 0) {
        toast.error('No valid lines found in file.');
        return;
      }
      setPasteText(JSON.stringify(rows, null, 2));
      if (!title.trim()) {
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(base.trim() || 'New shipment');
      }
      toast.success(`Loaded ${rows.length} lines from ${file.name}`);
    } catch (e) {
      console.error(e);
      toast.error('Could not read import file.');
    }
  };

  const handleCreate = async () => {
    if (!db) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Enter a name for this receival.');
      return;
    }
    if (!pasteText.trim()) {
      toast.error('Upload or paste a shipment manifest first.');
      return;
    }

    let rows;
    try {
      rows = parseReceivalImportFile(pasteText, 'paste.json');
    } catch (e) {
      console.error(e);
      toast.error('Invalid manifest — use JSON or CSV.');
      return;
    }
    if (rows.length === 0) {
      toast.error('No valid lines in manifest.');
      return;
    }

    let id = generateReceivalDocId(trimmedTitle, monthKey);
    if (existingIds.includes(id)) {
      id = `${id}-${Date.now().toString(36).slice(-4)}`;
    }

    setCreating(true);
    try {
      const receival = buildReceivalFromImport(trimmedTitle, rows, {
        id,
        monthKey: monthKey.trim() || defaultMonthKeyFromDate(),
      });
      await setDoc(doc(db, 'warehouseReceivals', receival.id), {
        title: receival.title,
        monthKey: receival.monthKey,
        lines: sanitizeReceivalLinesForFirestore(receival.lines),
        transfers: [],
        createdAt: receival.createdAt,
        updatedAt: receival.updatedAt,
      });
      toast.success(`Created "${receival.title}" with ${rows.length} lines.`);
      onCreated(receival.id);
      onOpenChange(false);
      reset();
    } catch (e) {
      console.error(e);
      toast.error('Could not create receival.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>New port receival</DialogTitle>
          <DialogDescription>
            Name this shipment and import its manifest (JSON or CSV). You can add
            future deliveries as separate receivals.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='receival-title'>Name</Label>
            <Input
              id='receival-title'
              placeholder='e.g. October 2026 shipment — Batch A'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='receival-month'>Month key</Label>
            <Input
              id='receival-month'
              placeholder='2026-10'
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              Used for sorting and document id prefix (YYYY-MM).
            </p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <input
              ref={fileRef}
              type='file'
              accept='.json,.csv,.tsv,.txt,application/json,text/csv'
              className='hidden'
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => fileRef.current?.click()}
            >
              <Upload className='mr-2 h-4 w-4' />
              Upload file
            </Button>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='receival-paste'>Manifest (JSON array or CSV)</Label>
            <Textarea
              id='receival-paste'
              rows={8}
              placeholder='[{"code":"…","description":"…","quantity":1,"price":9.99,"total":9.99}]'
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className='font-mono text-xs'
            />
          </div>
        </div>

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type='button' onClick={() => void handleCreate()} disabled={creating}>
            {creating ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Plus className='mr-2 h-4 w-4' />
            )}
            Create receival
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
