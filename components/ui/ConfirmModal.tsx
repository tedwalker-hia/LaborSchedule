'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { ButtonVariant } from '@/components/ui/Button';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: ReactNode;
  onConfirm: () => void | Promise<void>;
  variant?: Extract<ButtonVariant, 'primary' | 'danger'>;
  confirmLabel?: string;
}

export default function ConfirmModal({
  open,
  onClose,
  title,
  body,
  onConfirm,
  variant = 'danger',
  confirmLabel = variant === 'danger' ? 'Delete' : 'Confirm',
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant={variant} onClick={handleConfirm} loading={loading}>
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm" footer={footer}>
      {body}
    </Modal>
  );
}
