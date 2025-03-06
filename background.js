let allLinks = [];
let totalPages = 0;
let currentPage = 0;
let tabUpdateListener = null;
let isExtractionRunning = false;
let includedCategories = {
    paa: false,
    places: false,
    sitelinks: false
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Add debugging logs
console.log('Background script loaded');

// Check for any in-progress extraction when the script loads
chrome.storage.local.get(['extractionInProgress', 'extractionQuery', 'extractionTotalPages', 'extractionCurrentPage'], function(data) {
    if (data.extractionInProgress) {
        console.log('Found in-progress extraction. Resuming from page', data.extractionCurrentPage);
        totalPages = data.extractionTotalPages || 0;
        currentPage = data.extractionCurrentPage || 0;
        
        if (data.extractionQuery && totalPages > 0 && currentPage < totalPages) {
            // Resume extraction
            extractLinks(data.extractionQuery, currentPage);
        } else {
            // Reset incomplete extraction
            console.log('Cannot resume extraction with incomplete data, resetting state');
            resetExtractionState();
        }
    }
});

function resetExtractionState() {
    chrome.storage.local.remove(['extractionInProgress', 'extractionQuery', 'extractionTotalPages', 'extractionCurrentPage']);
}

async function scrapePage(tabId, query, pageNum) {
    console.log(`Starting to scrape page ${pageNum} for query "${query}" on tab ${tabId}`);
    
    return new Promise((resolve) => {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${(pageNum - 1) * 10}`;
        let timeout;

        // Create a timeout promise that will reject after 30 seconds
        const timeoutPromise = new Promise((_, reject) => {
            timeout = setTimeout(() => {
                if (tabUpdateListener) {
                    chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                    tabUpdateListener = null;
                }
                console.log('Page load timed out after 30 seconds');
                reject(new Error('Page load timeout'));
            }, 30000);
        });
        
        console.log(`Updating tab with URL: ${searchUrl}`);
        chrome.tabs.update(tabId, { url: searchUrl }, async () => {
            try {
                // Check if page is already complete
                const tab = await chrome.tabs.get(tabId);
                console.log(`Tab status: ${tab.status}`);
                
                if (tab.status === 'complete') {
                    console.log('Page already complete, clearing timeout');
                    clearTimeout(timeout);
                    await sleep(500); // Small delay to ensure DOM is ready
                } else {
                    // Wait for page to fully load
                    console.log('Waiting for page to load completely...');
                    await Promise.race([
                        new Promise((resolveLoad) => {
                            tabUpdateListener = function(updatedTabId, info) {
                                console.log(`Tab ${updatedTabId} update: ${info.status}`);
                                if (updatedTabId === tabId && info.status === 'complete') {
                                    console.log('Page load complete, removing listener');
                                    chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                                    tabUpdateListener = null;
                                    clearTimeout(timeout);
                                    resolveLoad();
                                }
                            };
                            chrome.tabs.onUpdated.addListener(tabUpdateListener);
                        }),
                        timeoutPromise
                    ]);
                }

                // Random delay (2–4 seconds)
                const loadDelay = 2000 + Math.floor(Math.random() * 2000);
                console.log(`Waiting ${loadDelay}ms before extracting links`);
                await sleep(loadDelay);

                // Send message to content script
                console.log('Sending extractLinks message to content script');
                chrome.tabs.sendMessage(tabId, { 
                    action: 'extractLinks',
                    includedCategories: includedCategories 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message:", chrome.runtime.lastError);
                        resolve([]);
                    } else {
                        console.log(`Received ${response?.links?.length || 0} links from content script`);
                        resolve(response?.links || []);
                    }
                });
            } catch (error) {
                console.error('Error in scrapePage:', error);
                resolve([]);
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background script received message:', request);
    
    if (request.action === 'startExtraction') {
        console.log(`Starting extraction for ${request.pages} pages with query "${request.query}"`);
        
        // Reset variables
        allLinks = [];
        totalPages = request.pages;
        currentPage = 0;
        isExtractionRunning = true;
        
        // Save inclusion preferences
        if (request.includedCategories) {
            // Clone the object to avoid reference issues
            includedCategories = {
                paa: !!request.includedCategories.paa,
                places: !!request.includedCategories.places, 
                sitelinks: !!request.includedCategories.sitelinks
            };
            console.log('Using inclusion preferences:', includedCategories);
        }
        
        // Save extraction state
        chrome.storage.local.set({
            extractionInProgress: true,
            extractionQuery: request.query,
            extractionTotalPages: totalPages,
            extractionCurrentPage: currentPage,
            includedCategories: includedCategories
        });
        
        // Start the extraction process
        extractLinks(request.query);
        
        // This keeps the channel open for async operations
        return true;
    }
});

async function extractLinks(query, startPage = 1) {
    try {
        isExtractionRunning = true;
        console.log('Getting active tab for extraction');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log(`Active tab found: ${tab.id} (${tab.url})`);
        
        for (currentPage = startPage; currentPage <= totalPages; currentPage++) {
            // Update progress
            console.log(`Processing page ${currentPage} of ${totalPages}`);
            
            // Update extraction state
            chrome.storage.local.set({
                extractionCurrentPage: currentPage
            });
            
            chrome.runtime.sendMessage({ 
                action: 'updateProgress', 
                progress: (currentPage / totalPages) * 100 
            });
            
            // Scrape the current page
            console.log(`Scraping page ${currentPage}`);
            const links = await scrapePage(tab.id, query, currentPage);
            console.log(`Found ${links.length} links on page ${currentPage}`);
            
            // Filter links based on inclusion preferences
            const filteredLinks = links.filter(link => {
                const category = link.category || 'organic';
                
                // Always include organic results
                if (category === 'organic') {
                    return true;
                }
                
                // Explicitly check each category by name to avoid any issues
                if (category === 'paa' && includedCategories.paa === true) {
                    return true;
                }
                
                if (category === 'places' && includedCategories.places === true) {
                    return true;
                }
                
                if (category === 'sitelinks' && includedCategories.sitelinks === true) {
                    return true;
                }
                
                // All other categories are excluded
                return false;
            });
            
            console.log(`Keeping ${filteredLinks.length} links out of ${links.length} after applying inclusion preferences`);
            console.log('Current inclusion settings:', includedCategories);
            allLinks = allLinks.concat(filteredLinks);
            
            // Add a random delay between page navigations to avoid detection
            // Between 3-7 seconds
            if (currentPage < totalPages) {
                const navigationDelay = 3000 + Math.floor(Math.random() * 4000);
                console.log(`Waiting ${navigationDelay}ms before next page`);
                await sleep(navigationDelay);
            }
        }
        
        console.log(`Extraction complete. Total links found: ${allLinks.length}`);
        
        // Remove duplicates by URL
        const uniqueLinks = [];
        const urlSet = new Set();
        
        for (const link of allLinks) {
            if (!urlSet.has(link.url)) {
                urlSet.add(link.url);
                uniqueLinks.push(link);
            }
        }
        
        console.log(`Unique links: ${uniqueLinks.length}`);
        
        // Clear extraction state
        resetExtractionState();
        isExtractionRunning = false;
        
        // Extraction complete, send all links back to popup
        console.log('Sending extractionComplete message to popup');
        chrome.runtime.sendMessage({ 
            action: 'extractionComplete', 
            links: uniqueLinks
        });
        
        // Return to the first results page
        console.log('Returning to first results page');
        chrome.tabs.update(tab.id, { 
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}` 
        });
        
    } catch (error) {
        console.error("Error during extraction:", error);
        
        // If we have links collected, deduplicate them
        let uniqueLinks = [];
        if (allLinks.length > 0) {
            const urlSet = new Set();
            
            for (const link of allLinks) {
                if (!urlSet.has(link.url)) {
                    urlSet.add(link.url);
                    uniqueLinks.push(link);
                }
            }
        }
        
        resetExtractionState();
        isExtractionRunning = false;
        
        chrome.runtime.sendMessage({ 
            action: 'extractionComplete', 
            links: uniqueLinks // Return what we have so far
        });
    }
}