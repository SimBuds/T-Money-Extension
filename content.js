// Log when content script is loaded
console.log('Content script loaded on: ' + window.location.href);

function extractLinksFromPage() {
    try {
        console.log('Extracting links from page...');
        const links = [];
        const processedUrls = new Set(); // Track processed URLs to avoid duplicates
        
        // Collect all sitelink containers first to check against later
        // This helps prevent sitelinks from being categorized as organic results
        const sitelinkContainers = new Set();
        document.querySelectorAll(
            'div.usJj9c, div.fl, table.AaVjTc, div.St3GK, div.KGu9hc, div.byrV5b, ' +
            '.hlcw0c div table, div.YkJ0Xd, div.FxLDp, div.v5jHUb, g-inner-card, ' +
            'div.oIk2Cb, .kno-kp:not(.ruhjFe), div[data-sncf], div.IThcWe div[data-mt]'
        ).forEach(container => sitelinkContainers.add(container));
        
        console.log(`Identified ${sitelinkContainers.size} potential sitelink containers`);
        
        // === People also ask section ===
        const peopleAlsoAskElements = document.querySelectorAll('div.related-question-pair a[href]');
        console.log(`Found ${peopleAlsoAskElements.length} 'People also ask' elements`);
        processCategoryElements(peopleAlsoAskElements, links, 'paa', processedUrls, sitelinkContainers);
        
        // === Places/Maps section ===
        // Updated selector for places elements to be more comprehensive
        const placesElements = document.querySelectorAll(
            'div.VkpGBb a[href], div.cXedhc a[href], div.rllt__details a[href], ' + 
            'div[data-local-attribute] a[href], div.dcuivd a[href], div.local-container a[href], ' +
            'div[data-hveid] div.rllt a[href], div.dbg0pd a[href], div[jscontroller="LdB9sd"] a[href]'
        );
        console.log(`Found ${placesElements.length} 'Places' elements`);
        processCategoryElements(placesElements, links, 'places', processedUrls, sitelinkContainers);
        
        // === Sitelinks ===
        // Updated selector to include more potential sitelink patterns
        const sitelinksElements = document.querySelectorAll(
            'div.usJj9c a[href], div.fl a[href], table.AaVjTc a[href], div.St3GK a[href], ' +
            'div.KGu9hc a[href], div.byrV5b a[href], .hlcw0c div table a[href], ' + 
            'div.YkJ0Xd a[href], div.FxLDp a[href], div.v5jHUb a[href], ' +
            'g-inner-card a[href], div.oIk2Cb a[href], .kno-kp a[href]:not(.ruhjFe), ' +
            'div[data-sncf] a[href], div.IThcWe div[data-mt] a[href]'
        );
        console.log(`Found ${sitelinksElements.length} sitelink elements`);
        processCategoryElements(sitelinksElements, links, 'sitelinks', processedUrls, sitelinkContainers);
        
        // === Featured snippets (now categorized as organic) ===
        const featuredElements = document.querySelectorAll('div.V3FYCf a[href], div.ruhjFe a[href], div[role="heading"] + div a[href], div.IThcWe a[href]:not([data-mt])');
        console.log(`Found ${featuredElements.length} featured snippet elements (categorized as organic)`);
        processCategoryElements(featuredElements, links, 'organic', processedUrls, sitelinkContainers);
        
        // === Main organic results ===
        // Use more specific selectors to avoid overlap with other categories
        // Added :not() exclusions to avoid picking up elements already categorized
        const organicSelectors = [
            'div#search div.g a[href]:not(.fl):not([data-local-attribute])',
            'div#search div.yuRUbf a[href]:not(.fl):not([data-local-attribute])',
            'div#rso div.jtfYYd a[href]:not(.fl):not([data-local-attribute])',
            'div#search div.tF2Cxc a[href]:not(.fl):not([data-local-attribute])'
        ].join(', ');
        const organicElements = document.querySelectorAll(organicSelectors);
        console.log(`Found ${organicElements.length} potential organic result elements`);
        
        // Filter out elements that are within sitelink containers
        const trueOrganicElements = Array.from(organicElements).filter(element => {
            // Check if this element is within any of our identified sitelink containers
            for (const container of sitelinkContainers) {
                if (container.contains(element)) {
                    return false; // This is actually a sitelink
                }
            }
            return true; // This is a true organic result
        });
        
        console.log(`After filtering, found ${trueOrganicElements.length} true organic result elements`);
        processCategoryElements(trueOrganicElements, links, 'organic', processedUrls, sitelinkContainers);
        
        // === Fallback for any missed links ===
        if (links.length === 0) {
            console.warn('No links found with standard selectors');
            // Last resort - try to get all external links
            const fallbackElements = document.querySelectorAll('a[href^="http"]:not([href*="google"])');
            console.log(`Found ${fallbackElements.length} elements with fallback selector`);
            processCategoryElements(fallbackElements, links, 'organic', processedUrls, sitelinkContainers);
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
function processCategoryElements(elements, links, category, processedUrls, sitelinkContainers) {
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
        
        // Additional category validation to ensure correct categorization
        let finalCategory = category;
        
        // Check if this is actually a sitelink (even if categorized as organic or another type)
        if (category !== 'sitelinks' && sitelinkContainers) {
            // Check if this element is contained within any of our sitelink containers
            for (const container of sitelinkContainers) {
                if (container.contains(element)) {
                    console.log(`Recategorizing link as sitelink: ${href}`);
                    finalCategory = 'sitelinks';
                    break;
                }
            }
        }
        
        // Check if this might be a place listing that was missed
        if (category !== 'places' && 
            (element.closest('.dbg0pd') || 
             element.closest('[data-local-attribute]') || 
             element.closest('div[jscontroller="LdB9sd"]') ||
             element.closest('div.local-container'))) {
            console.log(`Recategorizing link as place: ${href}`);
            finalCategory = 'places';
        }
        
        // Mark URL as processed
        processedUrls.add(href);
        
        // Try to find the title
        let title = '';
        
        // Handle specific category title extraction
        if (finalCategory === 'paa') {
            // For "People also ask" questions
            const questionParent = element.closest('.related-question-pair');
            if (questionParent) {
                const questionDiv = questionParent.querySelector('.wDYxhc');
                if (questionDiv) {
                    title = questionDiv.textContent || '';
                }
            }
        } else if (finalCategory === 'places') {
            // For places, try to get the business name
            const placeName = element.closest('.dbg0pd') || 
                             element.closest('[data-local-attribute="d3ph"]') ||
                             element.closest('[data-text-ad]') ||
                             element.closest('.rllt') ||
                             element.querySelector('.dbg0pd') ||
                             element.parentElement.querySelector('.dbg0pd');
            
            if (placeName) {
                title = placeName.innerText || placeName.textContent;
            }
        } else if (finalCategory === 'sitelinks') {
            // Improved sitelinks title extraction
            // First try to get the direct text from the element
            title = element.innerText || element.textContent;
            
            // If no title and element is within a specific sitelinks container, try parent
            if (!title || title.trim() === '') {
                const sitelinkParent = element.closest('div.YkJ0Xd, div.FxLDp, div.v5jHUb, g-inner-card, div.oIk2Cb, div[data-sncf], [data-mt]');
                if (sitelinkParent) {
                    title = sitelinkParent.innerText || sitelinkParent.textContent;
                }
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
            category: finalCategory
        });
        
        // Log for debugging specific categories
        if (finalCategory === 'sitelinks' || finalCategory === 'places') {
            console.log(`Added ${finalCategory} link: ${title.trim()} - ${href}`);
        }
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