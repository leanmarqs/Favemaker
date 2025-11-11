export interface SiteMetadata {
    title: string;
    description: string;
    favicon: string;
}

export const fetchUrlMetadata = async (url: string): Promise<SiteMetadata> => {
    // Helper to generate fallback data
    const getFallback = () => {
        try {
            const urlObject = new URL(url);
            const hostname = urlObject.hostname.replace('www.', '');
            const name = hostname.split('.')[0];
            const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
            return {
                title: capitalizedName,
                description: '',
                favicon: `https://www.google.com/s2/favicons?domain=${urlObject.hostname}&sz=64`
            };
        } catch {
            return { title: url, description: '', favicon: '' };
        }
    };
    
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            console.warn(`Failed to fetch URL content for ${url}, using fallback.`);
            return getFallback();
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const title = doc.querySelector('title')?.innerText.trim() || '';
        const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || 
                              doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
                              '';
        
        let favicon = doc.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') || 
                      doc.querySelector('link[rel="icon"]')?.getAttribute('href') ||
                      doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
                      '';
        
        if (favicon) {
            try {
                // Resolve relative URLs
                favicon = new URL(favicon, url).href;
            } catch (e) {
                favicon = ''; // Invalid favicon URL
            }
        }

        const fallbackData = getFallback();
        return {
            title: title || fallbackData.title,
            description: description,
            favicon: favicon || fallbackData.favicon
        };
    } catch (error) {
        console.error("Error fetching metadata:", error);
        return getFallback();
    }
};
