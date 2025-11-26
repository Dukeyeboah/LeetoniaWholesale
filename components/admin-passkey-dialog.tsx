'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';
import { verifyAdminPasskey, getAdminConfig } from '@/lib/admin-config';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface AdminPasskeyDialogProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AdminPasskeyDialog({
  open,
  onSuccess,
  onCancel,
}: AdminPasskeyDialogProps) {
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!user?.email) {
      setError('User email not found');
      setLoading(false);
      return;
    }

    const isValid = verifyAdminPasskey(user.email, passkey);

    if (!isValid) {
      setError('Invalid passkey. Please try again.');
      setLoading(false);
      return;
    }

    // Update user role to admin in Firestore
    try {
      if (db) {
        const adminConfig = getAdminConfig(user.email);
        await updateDoc(doc(db, 'users', user.id), {
          role: 'admin',
          name: adminConfig?.name || user.name,
        });
        toast.success('Admin access granted!');
        setPasskey('');
        onSuccess();
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      setError('Failed to grant admin access. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <Lock className='h-5 w-5 text-primary' />
            <DialogTitle>Admin Access Required</DialogTitle>
          </div>
          <DialogDescription>
            Your email is authorized for admin access. Please enter your unique
            passkey to continue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className='space-y-2'>
            <Label htmlFor='passkey'>Admin Passkey</Label>
            <Input
              id='passkey'
              type='password'
              placeholder='Enter your passkey'
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              required
              autoFocus
            />
            <p className='text-xs text-muted-foreground'>
              Contact your system administrator if you don't have a passkey.
            </p>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
