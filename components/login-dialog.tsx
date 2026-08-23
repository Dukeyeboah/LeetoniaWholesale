'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthForm } from '@/components/auth-form';
import type { AuthIntent } from '@/lib/ensure-user-profile';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultIntent?: AuthIntent;
  description?: string;
}

export function LoginDialog({
  open,
  onOpenChange,
  defaultIntent = 'signup',
  description,
}: LoginDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='gap-0 border-border/40 bg-white p-6 shadow-xl sm:max-w-[400px] sm:rounded-2xl'>
        <DialogTitle className='sr-only'>
          {defaultIntent === 'signup' ? 'Create account' : 'Welcome back'}
        </DialogTitle>
        <DialogDescription className='sr-only'>
          {description ||
            'Create an account or log in to Leetonia Wholesale.'}
        </DialogDescription>
        {open && (
          <AuthForm
            defaultIntent={defaultIntent}
            description={description}
            recaptchaContainerId='recaptcha-container-login-dialog'
            onAuthenticated={() => onOpenChange(false)}
            onAdminAuthenticated={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
