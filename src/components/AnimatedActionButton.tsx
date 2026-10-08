import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type ActionResult = void | boolean | string;

export default function AnimatedActionButton({
  children,
  className,
  disabled = false,
  icon,
  onAction,
  onSuccess,
  type = 'button',
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  icon: ReactNode;
  onAction: () => ActionResult | Promise<ActionResult>;
  onSuccess?: (result: ActionResult) => void;
  type?: 'button' | 'submit';
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleClick = async () => {
    if (disabled || phase !== 'idle') return;
    setPhase('loading');

    let result: ActionResult;
    try {
      result = await onAction();
    } catch {
      setPhase('idle');
      return;
    }

    if (result === false) {
      setPhase('idle');
      return;
    }

    setPhase('success');
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    setPhase('idle');
    if (onSuccess) {
      window.setTimeout(() => onSuccess(result), 180);
    }
  };

  const iconKey = phase === 'success' ? 'success' : phase === 'loading' ? 'loading' : 'idle';

  return (
    <motion.button
      type={type}
      disabled={disabled || phase === 'loading'}
      aria-busy={phase === 'loading'}
      onClick={handleClick}
      className={className}
      animate={{
        scale: phase === 'success' ? [1, 1.04, 1] : phase === 'loading' ? 0.97 : 1,
      }}
      style={phase === 'success' ? { backgroundColor: '#68704B', color: '#ffffff' } : undefined}
      transition={{ duration: 0.24 }}
      whileTap={{ scale: 0.96 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={iconKey}
          className="inline-flex shrink-0 items-center justify-center"
          initial={{ opacity: 0, scale: 0.6, rotate: -35 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 35 }}
          transition={{ duration: 0.16 }}
        >
          {phase === 'success' ? <Check className="h-4 w-4" /> : phase === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}
        </motion.span>
      </AnimatePresence>
      {children}
    </motion.button>
  );
}