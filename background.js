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
    
    return new Promise((resolve, reject) => {
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
            if (chrome.runtime.lastError) {
                console.error('Error updating tab:', chrome.runtime.lastError);
                clearTimeout(timeout);
                reject(chrome.runtime.lastError);
                return;
            }
            
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
        
        // Start the extraction process asynchronously
        extractLinks(request.query)
            .then(() => {
                // Ensure we send a response even if the extraction completes
                sendResponse({ status: 'success' });
            })
            .catch((error) => {
                console.error('Extraction error:', error);
                sendResponse({ status: 'error', message: error.message });
            });
        
        // This keeps the channel open for async operations
        return true;
    }

    // For other message types, return false to close the channel immediately
    return false;
});

async function extractLinks(query, startPage = 1) {
    try {
        isExtractionRunning = true;
        console.log('Getting active tab for extraction');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.error('No active tab found');
            isExtractionRunning = false;
            throw new Error('No active tab found');
        }
        
        console.log(`Active tab found: ${tab.id} (${tab.url})`);
        
        for (currentPage = startPage; currentPage <= totalPages; currentPage++) {
            // Update progress
            console.log(`Processing page ${currentPage} of ${totalPages}`);
            
            // Update extraction state
            chrome.storage.local.set({
                extractionCurrentPage: currentPage
            });
            
            try {
                chrome.runtime.sendMessage({ 
                    action: 'updateProgress', 
                    progress: (currentPage / totalPages) * 100 
                });
            } catch (err) {
                console.log('Error sending progress update, popup may be closed:', err);
                // Continue anyway - the popup might be closed
            }
            
            // Scrape the current page
            console.log(`Scraping page ${currentPage}`);
            const links = await scrapePage(tab.id, query, currentPage);
            console.log(`Found ${links.length} links on page ${currentPage}`);
            
            // Filter links based on inclusion preferences
            const filteredLinks = links.filter(link => {
                const category = link.category || 'organic';
                
                // Always include organic results
                if (category === 'organic' || category === 'featured') {
                    return true;
                }
                
                // Handle sitelinks based on preference (strict check)
                if (category === 'sitelinks') {
                    return includedCategories.sitelinks === true;
                }
                
                // Handle Places based on preference (strict check)
                if (category === 'places') {
                    return includedCategories.places === true;
                }
                
                // Handle PAA based on preference (strict check)
                if (category === 'paa') {
                    return includedCategories.paa === true;
                }
                
                // Exclude any other categories by default
                return false;
            });
            
            console.log(`Keeping ${filteredLinks.length} links out of ${links.length} after applying inclusion preferences`);
            console.log('Current inclusion settings:', includedCategories);
            
            // Log detailed category breakdown for debugging
            const beforeCategories = {};
            links.forEach(link => {
                const cat = link.category || 'organic';
                beforeCategories[cat] = (beforeCategories[cat] || 0) + 1;
            });
            console.log('Before filtering categories:', beforeCategories);
            
            const afterCategories = {};
            filteredLinks.forEach(link => {
                const cat = link.category || 'organic';
                afterCategories[cat] = (afterCategories[cat] || 0) + 1;
            });
            console.log('After filtering categories:', afterCategories);
            
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
        
        // Try to send the message safely
        try {
            // Extraction complete, send all links back to popup
            console.log('Sending extractionComplete message to popup');
            chrome.runtime.sendMessage({ 
                action: 'extractionComplete', 
                links: uniqueLinks
            }, (response) => {
                // Handle the case where popup is closed
                if (chrome.runtime.lastError) {
                    console.log('Error sending extractionComplete, popup may be closed:', chrome.runtime.lastError.message);
                    // This is ok - the popup might be closed when extraction completes
                } else {
                    console.log('Popup acknowledged extraction completion:', response);
                }
            });
        } catch (msgError) {
            console.error('Failed to send extractionComplete message:', msgError);
            // Store the results for when popup reopens
            chrome.storage.local.set({
                extractedLinks: uniqueLinks,
                extractionProgress: 100
            });
        }
        
        // Return to the first results page if possible
        try {
            if (tab && tab.id) {
                const firstPageUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                chrome.tabs.update(tab.id, { url: firstPageUrl });
            }
        } catch (navError) {
            console.error('Error returning to first page:', navError);
        }
        
        // Return successful extraction
        return uniqueLinks;
    } catch (finalError) {
        console.error('Critical error in extraction completion:', finalError);
        // Try to reset state in case of critical error
        resetExtractionState();
        isExtractionRunning = false;
    }
}