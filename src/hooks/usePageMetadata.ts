import { useEffect } from 'react';

export type PageMetadata = {
  title: string;
  description: string;
  image: string;
  url: string;
  type?: 'website' | 'product';
};

function setMetaContent(kind: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
  const created = !element;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(kind, key);
    document.head.append(element);
  }
  const previousContent = element.getAttribute('content');
  element.setAttribute('content', content);

  return () => {
    if (created) element?.remove();
    else if (previousContent === null) element?.removeAttribute('content');
    else element?.setAttribute('content', previousContent);
  };
}

function absoluteImageUrl(source: string) {
  try {
    const url = new URL(source, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : new URL('/media/favicon.svg', window.location.origin).href;
  } catch {
    return new URL('/media/favicon.svg', window.location.origin).href;
  }
}

export function usePageMetadata(metadata: PageMetadata) {
  const { title, description, image, url, type = 'website' } = metadata;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const imageUrl = absoluteImageUrl(image);
    const metaCleanup = [
      setMetaContent('name', 'description', description),
      setMetaContent('property', 'og:title', title),
      setMetaContent('property', 'og:description', description),
      setMetaContent('property', 'og:image', imageUrl),
      setMetaContent('property', 'og:url', url),
      setMetaContent('property', 'og:type', type),
      setMetaContent('property', 'og:site_name', 'Moon Face'),
      setMetaContent('name', 'twitter:card', 'summary_large_image'),
      setMetaContent('name', 'twitter:title', title),
      setMetaContent('name', 'twitter:description', description),
      setMetaContent('name', 'twitter:image', imageUrl),
    ];
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const createdCanonical = !canonical;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    const previousCanonical = canonical.getAttribute('href');
    canonical.href = url;

    return () => {
      document.title = previousTitle;
      metaCleanup.forEach((cleanup) => cleanup());
      if (createdCanonical) canonical?.remove();
      else if (previousCanonical === null) canonical?.removeAttribute('href');
      else canonical?.setAttribute('href', previousCanonical);
    };
  }, [description, image, title, type, url]);
}