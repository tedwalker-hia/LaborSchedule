'use client';

import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Modal from '@/components/ui/Modal';

export function useWizard(total: number) {
  const [step, setStep] = useState(1);
  const next = useCallback(() => setStep((s) => s + 1), []);
  const back = useCallback(() => setStep((s) => s - 1), []);
  const goTo = useCallback((n: number) => setStep(n), []);
  const reset = useCallback(() => setStep(1), []);
  return {
    step,
    total,
    next,
    back,
    goTo,
    reset,
    isFirst: step === 1,
    isLast: step === total,
  };
}

interface WizardProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  step: number;
  total: number;
  children: ReactNode;
  footer?: ReactNode;
  showStepCount?: boolean;
}

export function Wizard({
  open,
  onClose,
  title,
  size = 'lg',
  step,
  total,
  children,
  footer,
  showStepCount = true,
}: WizardProps) {
  const fullTitle = showStepCount ? `${title} (Step ${step}/${total})` : title;
  return (
    <Modal isOpen={open} onClose={onClose} title={fullTitle} size={size} footer={footer}>
      {children}
    </Modal>
  );
}
