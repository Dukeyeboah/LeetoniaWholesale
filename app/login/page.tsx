'use client';

import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className='flex min-h-screen items-center justify-center bg-white px-4 py-10'>
      <div className='w-full max-w-[400px] rounded-2xl border border-border/40 bg-white p-6 shadow-xl sm:p-8'>
        <AuthForm
          defaultIntent='signup'
          recaptchaContainerId='recaptcha-container-login-page'
          onAuthenticated={() => router.push('/home')}
          onAdminAuthenticated={() => router.push('/admin')}
        />
      </div>
    </div>
  );
}
