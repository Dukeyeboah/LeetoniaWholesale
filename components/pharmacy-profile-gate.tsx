'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { PharmacyOnboardingDialog } from '@/components/pharmacy-onboarding-dialog';
import { PharmacyVerificationDialog } from '@/components/pharmacy-verification-dialog';

const PENDING_NOTICE_KEY = 'leetonia_affiliation_notice';

export function PharmacyProfileGate({ children }: { children: React.ReactNode }) {
  const { loading, needsClientPharmacyProfile, pharmacyAffiliation, refreshUser } =
    useAuth();
  const [noticeAck, setNoticeAck] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key =
      pharmacyAffiliation === 'pending' || pharmacyAffiliation === 'rejected'
        ? `${PENDING_NOTICE_KEY}:${pharmacyAffiliation}`
        : null;
    if (!key) {
      setNoticeAck(true);
      return;
    }
    setNoticeAck(sessionStorage.getItem(key) === '1');
  }, [pharmacyAffiliation]);

  const acknowledge = () => {
    if (typeof window !== 'undefined' && pharmacyAffiliation) {
      sessionStorage.setItem(`${PENDING_NOTICE_KEY}:${pharmacyAffiliation}`, '1');
    }
    setNoticeAck(true);
  };

  if (loading) {
    return <>{children}</>;
  }

  const showVerificationDialog =
    !needsClientPharmacyProfile &&
    !noticeAck &&
    (pharmacyAffiliation === 'pending' || pharmacyAffiliation === 'rejected');

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
      {showVerificationDialog &&
      (pharmacyAffiliation === 'pending' ||
        pharmacyAffiliation === 'rejected') ? (
        <PharmacyVerificationDialog
          status={pharmacyAffiliation}
          onAcknowledge={acknowledge}
        />
      ) : null}
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
