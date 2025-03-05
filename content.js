// Log when content script is loaded
console.log('Content script loaded on: ' + window.location.href);

function extractLinksFromPage() {
    try {
        console.log('Extracting links from page...');
        const links = [];
        const resultElements = document.querySelectorAll('div#search div.g a[href], div#search div.yuRUbf a[href], div#search div[data-sokoban-container] a[href]');
        
        console.log(`Found ${resultElements.length} potential result elements`);
        
        if (resultElements.length === 0) {
            console.warn('No search results found on page');
            // Try alternate selectors as Google's DOM structure changes often
            console.log('Trying alternative selectors...');
            const altElements = document.querySelectorAll('a[href^="http"]:not([href*="google"])');
            console.log(`Found ${altElements.length} elements with alternative selector`);
            
            altElements.forEach((element) => {
                const href = element.getAttribute('href');
                // Only include links that look like search results
                if (href && 
                    !href.includes('google.com') && 
                    !href.includes('/search?') && 
                    !links.includes(href)) {
                    links.push(href);
                }
            });
        } else {
            resultElements.forEach((element) => {
                const href = element.getAttribute('href');
                if (href && 
                    href.startsWith('http') && 
                    !href.includes('google.com') && 
                    !href.includes('/search?') && 
                    !links.includes(href)) {
                    links.push(href);
                }
            });
        }
        
        console.log(`Extracted ${links.length} unique links from the page`);
        return links;
    } catch (error) {
        console.error('Error extracting links:', error);
        return [];
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    if (request.action === 'extractLinks') {
        console.log('Extracting links as requested');
        const links = extractLinksFromPage();
        console.log(`Sending ${links.length} links back to background script`);
        sendResponse({ links });
    }
    return true;
});