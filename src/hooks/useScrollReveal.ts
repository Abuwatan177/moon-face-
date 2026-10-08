import { useInView } from 'react-intersection-observer';

export function useScrollReveal(threshold = 0.1, triggerOnce = true) {
  const { ref, inView } = useInView({
    threshold,
    triggerOnce,
  });

  return { ref, inView };
}
