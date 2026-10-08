let audioContext: AudioContext | null = null;

type SoundKind = 'like' | 'cart';

export function playStoreSound(kind: SoundKind) {
  if (typeof window === 'undefined') return;
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    audioContext ||= new AudioContextConstructor();
    const context = audioContext;
    const play = () => {
      const now = context.currentTime;
      const notes = kind === 'like' ? [660, 880] : [440, 660];
      notes.forEach((frequency, index) => {
        const start = now + index * 0.075;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.15);
      });
    };

    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    return;
  }
}