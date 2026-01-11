import { useEffect } from 'react';

interface MetaTagsConfig {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

/**
 * Hook to dynamically update meta tags for SEO and social sharing
 */
export function useMetaTags(config: MetaTagsConfig) {
  useEffect(() => {
    const {
      title,
      description,
      image,
      url,
      type = 'website'
    } = config;

    // Update document title
    if (title) {
      document.title = title;
    }

    // Helper to update or create meta tag
    const updateMetaTag = (selector: string, content: string) => {
      let element = document.querySelector(selector);
      if (element) {
        element.setAttribute('content', content);
      } else {
        // Create the meta tag if it doesn't exist
        const isProperty = selector.includes('property');
        element = document.createElement('meta');
        if (isProperty) {
          element.setAttribute('property', selector.split('="')[1].split('"]')[0]);
        } else {
          element.setAttribute('name', selector.split('="')[1].split('"]')[0]);
        }
        element.setAttribute('content', content);
        document.head.appendChild(element);
      }
    };

    // Update description
    if (description) {
      updateMetaTag('meta[name="description"]', description);
      updateMetaTag('meta[property="og:description"]', description);
      updateMetaTag('meta[name="twitter:description"]', description);
    }

    // Update title for social
    if (title) {
      updateMetaTag('meta[property="og:title"]', title);
      updateMetaTag('meta[name="twitter:title"]', title);
    }

    // Update image
    if (image) {
      updateMetaTag('meta[property="og:image"]', image);
      updateMetaTag('meta[name="twitter:image"]', image);
    }

    // Update URL
    if (url) {
      updateMetaTag('meta[property="og:url"]', url);
      updateMetaTag('meta[name="twitter:url"]', url);

      // Update canonical link
      let canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) {
        canonical.setAttribute('href', url);
      } else {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        canonical.setAttribute('href', url);
        document.head.appendChild(canonical);
      }
    }

    // Update type
    if (type) {
      updateMetaTag('meta[property="og:type"]', type);
    }
  }, [config.title, config.description, config.image, config.url, config.type]);
}
