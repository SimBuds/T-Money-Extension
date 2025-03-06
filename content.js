// Log when content script is loaded
console.log('Content script loaded on: ' + window.location.href);

function extractLinksFromPage() {
    try {
        console.log('Extracting links from page...');
        const links = [];
        const processedUrls = new Set(); // Track processed URLs to avoid duplicates
        
        // === People also ask section ===
        const peopleAlsoAskElements = document.querySelectorAll('div.related-question-pair a[href]');
        console.log(`Found ${peopleAlsoAskElements.length} 'People also ask' elements`);
        processCategoryElements(peopleAlsoAskElements, links, 'paa', processedUrls);
        
        // === Places/Maps section ===
        const placesElements = document.querySelectorAll('div.VkpGBb a[href], div.cXedhc a[href], div.rllt__details a[href], div[data-local-attribute] a[href]');
        console.log(`Found ${placesElements.length} 'Places' elements`);
        processCategoryElements(placesElements, links, 'places', processedUrls);
        
        // === Sitelinks ===
        const sitelinksElements = document.querySelectorAll('div.usJj9c a[href], div.fl a[href], table.AaVjTc a[href], div.St3GK a[href], div.KGu9hc a[href], div.byrV5b a[href], .hlcw0c div table a[href]');
        console.log(`Found ${sitelinksElements.length} sitelink elements`);
        processCategoryElements(sitelinksElements, links, 'sitelinks', processedUrls);
        
        // === Featured snippets (now categorized as organic) ===
        const featuredElements = document.querySelectorAll('div.V3FYCf a[href], div.ruhjFe a[href], div[role="heading"] + div a[href], div.IThcWe a[href]');
        console.log(`Found ${featuredElements.length} featured snippet elements (categorized as organic)`);
        processCategoryElements(featuredElements, links, 'organic', processedUrls);
        
        // === Main organic results ===
        // Use more specific selectors to avoid overlap with other categories
        const organicSelectors = [
            'div#search div.g a[href]:not(.fl):not([data-local-attribute])',
            'div#search div.yuRUbf a[href]:not(.fl):not([data-local-attribute])',
            'div#rso div.jtfYYd a[href]:not(.fl):not([data-local-attribute])',
            'div#search div.tF2Cxc a[href]:not(.fl):not([data-local-attribute])'
        ].join(', ');
        const organicElements = document.querySelectorAll(organicSelectors);
        console.log(`Found ${organicElements.length} organic result elements`);
        processCategoryElements(organicElements, links, 'organic', processedUrls);
        
        // === Fallback for any missed links ===
        if (links.length === 0) {
            console.warn('No links found with standard selectors');
            // Last resort - try to get all external links
            const fallbackElements = document.querySelectorAll('a[href^="http"]:not([href*="google"])');
            console.log(`Found ${fallbackElements.length} elements with fallback selector`);
            processCategoryElements(fallbackElements, links, 'organic', processedUrls);
        }
        
        console.log(`Extracted ${links.length} unique links from the page`);
        
        // Log category counts for debugging
        const categoryCounts = {};
        links.forEach(link => {
            categoryCounts[link.category] = (categoryCounts[link.category] || 0) + 1;
        });
        console.log('Links by category:', categoryCounts);
        
        return links;
    } catch (error) {
        console.error('Error extracting links:', error);
        return [];
    }
}

// Helper function to process elements by category and add them to links array
function processCategoryElements(elements, links, category, processedUrls) {
    elements.forEach((element) => {
        const href = element.getAttribute('href');
        
        // Skip if not a valid external link
        if (!href || 
            !href.startsWith('http') || 
            href.includes('google.com/search') || 
            href.includes('/account') || 
            href.includes('/signin')) {
            return;
        }
        
        // Skip if we already processed this URL (across all categories)
        if (processedUrls.has(href)) {
            return;
        }
        
        // Mark URL as processed
        processedUrls.add(href);
        
        // Try to find the title
        let title = '';
        
        // Handle specific category title extraction
        if (category === 'paa') {
            // For "People also ask" questions
            const questionParent = element.closest('.related-question-pair');
            if (questionParent) {
                const questionDiv = questionParent.querySelector('.wDYxhc');
                if (questionDiv) {
                    title = questionDiv.textContent || '';
                }
            }
        } else if (category === 'places') {
            // For places, try to get the business name
            const placeName = element.closest('.dbg0pd') || 
                             element.closest('[data-local-attribute="d3ph"]') ||
                             element.querySelector('.dbg0pd') ||
                             element.parentElement.querySelector('.dbg0pd');
            
            if (placeName) {
                title = placeName.innerText || placeName.textContent;
            }
        }
        
        // If no title found with category-specific methods, try general methods
        if (!title || title.trim() === '') {
            // Try to get text from the element itself
            title = element.innerText || element.textContent;
            
            // If still no title, look for headings or other structured elements
            if (!title || title.trim() === '') {
                // Try various heading and title patterns
                const headingElement = 
                    element.querySelector('h3, h4') || 
                    element.closest('div').querySelector('h3, h4, div[role="heading"]') ||
                    element.closest('[role="heading"]');
                
                if (headingElement) {
                    title = headingElement.innerText || headingElement.textContent;
                }
            }
        }
        
        // Final fallback
        title = title || 'No Title';
        
        // Add the link with its category
        links.push({
            url: href,
            title: title.trim(),
            category: category
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    if (request.action === 'extractLinks') {
        console.log('Extracting links as requested');
        
        // Log inclusion preferences
        const preferences = request.includedCategories || { paa: false, places: false, sitelinks: false };
        console.log('Received inclusion preferences:', preferences);
        
        // Extract all links
        const allLinks = extractLinksFromPage();
        console.log('Initial category breakdown:');
        logCategoryBreakdown(allLinks);
        
        // Filter links based on inclusion preferences
        if (preferences) {
            const filteredLinks = allLinks.filter(link => {
                const category = link.category || 'organic';
                
                // Always include organic results
                if (category === 'organic') {
                    return true;
                }
                
                // Explicitly check each category by name to avoid any issues
                if (category === 'paa' && preferences.paa === true) {
                    return true;
                }
                
                if (category === 'places' && preferences.places === true) {
                    return true;
                }
                
                if (category === 'sitelinks' && preferences.sitelinks === true) {
                    return true;
                }
                
                // All other categories are excluded
                return false;
            });
            
            console.log(`Filtered links from ${allLinks.length} to ${filteredLinks.length} based on inclusion preferences`);
            console.log('Final category breakdown after filtering:');
            logCategoryBreakdown(filteredLinks);
            
            console.log(`Sending ${filteredLinks.length} links back to background script`);
            sendResponse({ links: filteredLinks });
        } else {
            // If no preferences, just return organic results
            const organicOnly = allLinks.filter(link => link.category === 'organic');
            console.log(`No preferences provided, returning only organic results (${organicOnly.length})`);
            sendResponse({ links: organicOnly });
        }
    }
    return true;
});

// Helper function to log category breakdown
function logCategoryBreakdown(links) {
    const categories = {};
    links.forEach(link => {
        const category = link.category || 'organic';
        categories[category] = (categories[category] || 0) + 1;
    });
    
    console.log('Category breakdown:', categories);
    
    // Log each category as a percentage
    const total = links.length;
    if (total > 0) {
        console.log('Category percentages:');
        for (const [category, count] of Object.entries(categories)) {
            const percentage = (count / total * 100).toFixed(1);
            console.log(`- ${category}: ${count} (${percentage}%)`);
        }
    }
}