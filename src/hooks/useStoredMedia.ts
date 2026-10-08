import { useEffect, useState } from 'react';
import { loadLocalMedia } from '../lib/localMedia';

export default function useStoredMedia(source: string) {
  const [resolvedSource, setResolvedSource] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!source.startsWith('local-media:')) {
      setResolvedSource(source);
      return () => { active = false; };
    }

    setResolvedSource('');
    void loadLocalMedia(source).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setResolvedSource(objectUrl);
    }).catch(() => setResolvedSource(''));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return resolvedSource;
}
