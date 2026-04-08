'use client';

import type React from 'react';
import { useAuth } from '@/lib/auth-context';
import { PharmacyOnboardingDialog } from '@/components/pharmacy-onboarding-dialog';
export function PharmacyProfileGate({ children }: { children: React.ReactNode }) {
  const { loading, needsClientPharmacyProfile, refreshUser } = useAuth();

  if (loading) {
    return <>{children}</>;
  }

  return (
    <>
      {needsClientPharmacyProfile && (
        <PharmacyOnboardingDialog
          open
          onComplete={() => {
            void refreshUser();
          }}
        />
      )}
      <div
        className={
          needsClientPharmacyProfile
            ? 'pointer-events-none min-h-[50vh] select-none opacity-40'
            : undefined
        }
        aria-hidden={needsClientPharmacyProfile ? true : undefined}
      >
        {children}
      </div>
    </>
  );
}
