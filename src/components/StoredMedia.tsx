import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FocusEventHandler, type MouseEventHandler } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import useStoredMedia from '../hooks/useStoredMedia';
import { useLanguage } from '../i18n';

function embeddedVideoProvider(source: string) {
  try {
    const host = new URL(source).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || /^(?:m\.)?youtube(?:-nocookie)?\.com$/.test(host)) return 'youtube';
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
  } catch {
    return null;
  }
  return null;
}

function videoEmbedUrl(source: string, autoPlay: boolean) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const youtubeId = host === 'youtu.be'
    ? url.pathname.split('/').filter(Boolean)[0]
    : /^(?:m\.)?youtube(?:-nocookie)?\.com$/.test(host)
      ? url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
      : null;
  if (youtubeId && /^[\w-]{11}$/.test(youtubeId)) {
    const params = new URLSearchParams({ playsinline: '1', rel: '0', controls: '1', enablejsapi: '1', origin: window.location.origin });
    if (autoPlay) params.set('autoplay', '1'), params.set('mute', '1');
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
  }

  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
    if (videoId) return `https://player.vimeo.com/video/${videoId}?${new URLSearchParams({ autoplay: autoPlay ? '1' : '0', muted: autoPlay ? '1' : '0', controls: '1', playsinline: '1', api: '1' })}`;
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1];
    if (videoId) return `https://www.tiktok.com/player/v1/${videoId}?${new URLSearchParams({ controls: '1', autoplay: autoPlay ? '1' : '0' })}`;
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const post = url.pathname.match(/\/(reel|p|tv)\/([^/]+)/);
    if (post) return `https://www.instagram.com/${post[1]}/${post[2]}/embed/?hidecaption=true`;
  }

  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') {
    return `https://www.facebook.com/plugins/video.php?${new URLSearchParams({ href: url.href, show_text: 'false', autoplay: autoPlay ? 'true' : 'false' })}`;
  }

  if (host === 'drive.google.com') {
    const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
    if (fileId) return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  }

  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    url.searchParams.set('raw', '1');
    return url.href;
  }

  if (/\.(?:mp4|webm|ogg|mov|m3u8)$/i.test(url.pathname)) return null;
  if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  return null;
}

type Props = {
  type: 'image' | 'video';
  source: string;
  alt: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  autoPlayWhenVisible?: boolean;
  muted?: boolean;
  loop?: boolean;
  onMouseEnter?: MouseEventHandler<HTMLVideoElement>;
  onMouseLeave?: MouseEventHandler<HTMLVideoElement>;
  onFocus?: FocusEventHandler<HTMLVideoElement>;
  onBlur?: FocusEventHandler<HTMLVideoElement>;
};

const StoredMedia = forwardRef<HTMLVideoElement, Props>(function StoredMedia({ type, source, alt, className = '', controls = false, autoPlay = false, autoPlayWhenVisible = false, muted = false, loop = false, onMouseEnter, onMouseLeave, onFocus, onBlur }, ref) {
  const { t } = useLanguage();
  const resolvedSource = useStoredMedia(source);
  const [isVisible, setIsVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const visibilityTargetRef = useRef<HTMLElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shouldAutoPlay = autoPlay || (autoPlayWhenVisible && isVisible);
  const embedProvider = type === 'video' ? embeddedVideoProvider(resolvedSource) : null;

  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, [resolvedSource]);

  useEffect(() => {
    if (!autoPlayWhenVisible || type !== 'video' || !resolvedSource) {
      setIsVisible(false);
      return;
    }

    const target = visibilityTargetRef.current;
    if (!target) return;
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35);
    }, { threshold: [0, 0.35] });
    observer.observe(target);
    return () => observer.disconnect();
  }, [autoPlayWhenVisible, resolvedSource, type]);

  useEffect(() => setSoundEnabled(false), [resolvedSource]);

  useEffect(() => {
    if (!autoPlayWhenVisible || type !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    if (shouldAutoPlay) void video.play().catch(() => undefined);
    else video.pause();
  }, [autoPlayWhenVisible, resolvedSource, shouldAutoPlay, type]);

  const setEmbeddedSound = (enabled: boolean) => {
    const iframe = iframeRef.current;
    if (!iframe || !embedProvider) return;
    const targetOrigin = new URL(iframe.src).origin;
    const message = embedProvider === 'youtube'
      ? { event: 'command', func: enabled ? 'unMute' : 'mute', args: [] }
      : { method: 'setVolume', value: enabled ? 1 : 0 };
    iframe.contentWindow?.postMessage(JSON.stringify(message), targetOrigin);
    setSoundEnabled(enabled);
  };

  if (!resolvedSource) return <div className={`bg-moon-face-100 ${className}`} aria-hidden="true" />;

  const embedUrl = type === 'video' ? videoEmbedUrl(resolvedSource, shouldAutoPlay) : null;
  if (embedUrl) return <div ref={(node) => { visibilityTargetRef.current = node; }} className={`relative overflow-hidden ${className}`}>
    <iframe ref={iframeRef} title={alt} src={embedUrl} className="absolute inset-0 h-full w-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    {autoPlayWhenVisible && shouldAutoPlay && embedProvider && <button type="button" onClick={(event) => { event.stopPropagation(); setEmbeddedSound(!soundEnabled); }} className="absolute bottom-14 right-3 z-20 grid size-10 place-items-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm" aria-label={t(soundEnabled ? 'muteVideo' : 'enableVideoSound')} title={t(soundEnabled ? 'muteVideo' : 'enableVideoSound')}>
      <span className="sr-only">{t(soundEnabled ? 'muteVideo' : 'enableVideoSound')}</span>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>}
  </div>;

  return type === 'video'
    ? <video ref={(node) => { videoRef.current = node; visibilityTargetRef.current = node; }} src={resolvedSource} aria-label={alt} className={className} controls={controls} autoPlay={shouldAutoPlay} muted={muted || shouldAutoPlay} loop={loop || shouldAutoPlay} playsInline preload="metadata" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onFocus={onFocus} onBlur={onBlur} onClick={(event) => event.stopPropagation()} />
    : <img src={resolvedSource} alt={alt} className={className} loading="lazy" />;
});

export default StoredMedia;
