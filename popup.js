let extractedLinks = [];
let includedCategories = {
    paa: false,
    places: false,
    sitelinks: false
};

// Log when popup script is loaded
console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup DOM content loaded');
    
    const extractButton = document.getElementById('extractButton');
    const copyButton = document.getElementById('copyButton');
    const downloadButton = document.getElementById('downloadButton');
    const clearButton = document.getElementById('clearButton');
    const pagesInput = document.getElementById('pages');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultsDiv = document.getElementById('results');
    const linksList = document.getElementById('linksList');
    const linkCount = document.getElementById('linkCount');
    
    // Inclusion checkboxes
    const includePAA = document.getElementById('includePAA');
    const includePlaces = document.getElementById('includePlaces');
    const includeSitelinks = document.getElementById('includeSitelinks');
    
    // Log the DOM elements to ensure they're found
    console.log('Extract button found:', !!extractButton);
    console.log('Pages input found:', !!pagesInput);
    console.log('Clear button found:', !!clearButton);
    console.log('Include checkboxes found:', 
        !!includePAA && !!includePlaces && !!includeSitelinks);

    // Load saved data and update UI
    loadSavedData();
    
    // Set up checkbox event handlers with immediate UI update
    includePAA.addEventListener('change', function() {
        includedCategories.paa = this.checked;
        saveInclusionPreferences();
        updateLinksUI(); // Update UI immediately when checkbox changes
    });
    
    includePlaces.addEventListener('change', function() {
        includedCategories.places = this.checked;
        saveInclusionPreferences();
        updateLinksUI(); // Update UI immediately when checkbox changes
    });
    
    includeSitelinks.addEventListener('change', function() {
        includedCategories.sitelinks = this.checked;
        saveInclusionPreferences();
        updateLinksUI(); // Update UI immediately when checkbox changes
    });

    // Initialize with saved preferences if available
    chrome.storage.local.get(['pagesCount'], function(data) {
        console.log('Loaded saved pages count:', data.pagesCount);
        if (data.pagesCount) {
            pagesInput.value = data.pagesCount;
        }
    });

    // Save preferences when changed
    pagesInput.addEventListener('change', function() {
        console.log('Pages input changed to:', pagesInput.value);
        const pages = parseInt(pagesInput.value);
        if (isNaN(pages)) {
            alert('Please enter a valid number');
            return;
        }
        if (pages >= 1 && pages <= 10) {
            chrome.storage.local.set({ pagesCount: pages });
            console.log('Saved pages count:', pages);
        }
    });

    function loadSavedData() {
        console.log('Loading saved extraction data');
        chrome.storage.local.get([
            'extractedLinks', 
            'lastQuery', 
            'extractionProgress',
            'includedCategories'
        ], function(data) {
            // Load inclusion preferences if available
            if (data.includedCategories) {
                console.log('Restoring inclusion preferences:', data.includedCategories);
                // Ensure we only set valid categories
                if (typeof data.includedCategories === 'object') {
                    // Initialize with defaults first
                    includedCategories = {
                        paa: false,
                        places: false,
                        sitelinks: false
                    };
                    
                    // Then apply saved values for our existing categories only
                    if ('paa' in data.includedCategories) includedCategories.paa = !!data.includedCategories.paa;
                    if ('places' in data.includedCategories) includedCategories.places = !!data.includedCategories.places;
                    if ('sitelinks' in data.includedCategories) includedCategories.sitelinks = !!data.includedCategories.sitelinks;
                }
                
                // Update checkboxes to match saved preferences
                includePAA.checked = includedCategories.paa;
                includePlaces.checked = includedCategories.places;
                includeSitelinks.checked = includedCategories.sitelinks;
            }
            
            if (data.extractedLinks && data.extractedLinks.length > 0) {
                console.log('Found saved links:', data.extractedLinks.length);
                extractedLinks = data.extractedLinks;
                updateLinksUI();
                
                if (data.lastQuery) {
                    console.log('Last query was:', data.lastQuery);
                }
                
                // Restore progress if extraction was in progress
                if (data.extractionProgress) {
                    console.log('Restoring progress:', data.extractionProgress);
                    progressBar.value = data.extractionProgress;
                    progressText.textContent = Math.round(data.extractionProgress) + '%';
                }
            } else {
                console.log('No saved links found');
            }
        });
    }
    
    function updateLinksUI() {
        if (extractedLinks.length === 0) {
            console.log('No links to display');
            return;
        }
        
        // Filter links based on included categories
        const filteredLinks = filterByIncludedCategories(extractedLinks);
        
        // Update count display
        linkCount.textContent = filteredLinks.length;
        linksList.innerHTML = '';
        
        // Display the links in the UI
        console.log('Populating links list with ' + filteredLinks.length + ' links');
        filteredLinks.forEach(function(link) {
            const linkElement = document.createElement('div');
            linkElement.classList.add('link-item');
            linkElement.setAttribute('data-category', link.category || 'organic');
            
            // Create and add title element
            const titleElement = document.createElement('div');
            titleElement.classList.add('link-title');
            titleElement.textContent = link.title;
            
            // Create and add URL element
            const urlElement = document.createElement('div');
            urlElement.classList.add('link-url');
            urlElement.textContent = link.url;
            
            // Create category label
            const categoryElement = document.createElement('span');
            categoryElement.classList.add('link-category', `category-${link.category || 'organic'}`);
            categoryElement.textContent = getCategoryLabel(link.category || 'organic');
            
            // Add all elements to the link item
            linkElement.appendChild(titleElement);
            linkElement.appendChild(urlElement);
            linkElement.appendChild(categoryElement);
            
            // Make the entire item clickable to open the link
            linkElement.addEventListener('click', function() {
                window.open(link.url, '_blank');
            });
            
            linksList.appendChild(linkElement);
        });

        resultsDiv.classList.remove('hidden');
    }
    
    // Function to get readable category label
    function getCategoryLabel(category) {
        switch (category) {
            case 'organic': return 'Organic';
            case 'paa': return 'People also ask';
            case 'places': return 'Places';
            case 'sitelinks': return 'Sitelink';
            default: return 'Other';
        }
    }
    
    // Function to extract domain from URL
    function extractDomain(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname;
        } catch (e) {
            console.error('Error parsing URL:', url, e);
            return url;
        }
    }
    
    // Function to filter links based on included categories
    function filterByIncludedCategories(links) {
        const filteredLinks = links.filter(link => {
            const category = link.category || 'organic';
            
            // Always include organic results
            if (category === 'organic') {
                return true;
            }
            
            // Explicitly check each category by name
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
        
        // Log detailed information for debugging
        console.log(`Filtered from ${links.length} to ${filteredLinks.length} links based on inclusion preferences`);
        console.log('Current inclusion preferences:', includedCategories);
        
        const categoryCounts = {};
        links.forEach(link => {
            const cat = link.category || 'organic';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
        console.log('Before filtering counts:', categoryCounts);
        
        const filteredCounts = {};
        filteredLinks.forEach(link => {
            const cat = link.category || 'organic';
            filteredCounts[cat] = (filteredCounts[cat] || 0) + 1;
        });
        console.log('After filtering counts:', filteredCounts);
        
        return filteredLinks;
    }

    // Modify the extract button click handler to properly handle responses
    extractButton.addEventListener('click', function() {
        console.log('Extract button clicked');
        
        // Get the active tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            // Make sure we have a tab and it's a Google search page
            if (tabs.length === 0) {
                console.error('No active tab found');
                alert('No active tab found. Please try again.');
                return;
            }
            
            const activeTab = tabs[0];
            const tabUrl = activeTab.url;
            
            if (!tabUrl.includes('google.com/search')) {
                alert('Please navigate to a Google search page first.');
                return;
            }
            
            // Get the search query from the URL
            const url = new URL(tabUrl);
            const query = url.searchParams.get('q');
            
            if (!query) {
                alert('No search query found. Please perform a search on Google first.');
                return;
            }
            
            console.log('Found search query:', query);
            
            // Clear previous results
            extractedLinks = [];
            resultsDiv.classList.add('hidden');
            
            // Show progress
            progressBar.value = 0;
            progressText.textContent = '0%';
            
            // Get number of pages to extract
            const pagesToExtract = parseInt(pagesInput.value);
            if (isNaN(pagesToExtract) || pagesToExtract < 1 || pagesToExtract > 10) {
                alert('Please enter a valid number of pages (1-10).');
                return;
            }
            
            // Disable the button during extraction
            extractButton.disabled = true;
            
            // Save the query and pages count
            chrome.storage.local.set({
                lastQuery: query,
                pagesCount: pagesToExtract
            });
            
            // Start the extraction process
            console.log('Sending startExtraction message to background script');
            chrome.runtime.sendMessage({
                action: 'startExtraction',
                query: query,
                pages: pagesToExtract,
                includedCategories: includedCategories
            }, function(response) {
                // This callback may or may not be called depending on how extraction proceeds
                if (chrome.runtime.lastError) {
                    console.log('Error starting extraction:', chrome.runtime.lastError);
                    // Don't treat this as a fatal error - the background script might still be working
                } else {
                    console.log('Extraction started successfully:', response);
                }
            });
        });
    });

    // Add proper error handling to chrome.runtime.onMessage listener
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('Popup received message:', request);
        
        if (request.action === 'updateProgress') {
            console.log('Updating progress:', request.progress);
            progressBar.value = request.progress;
            progressText.textContent = Math.round(request.progress) + '%';
            
            // Save progress in case popup is closed
            chrome.storage.local.set({
                extractionProgress: request.progress
            });
            
            // Send response to close the message channel
            sendResponse({received: true});
        }
        else if (request.action === 'extractionComplete') {
            console.log('Extraction complete. Received', request.links.length, 'links');
            
            // Enable the extract button again
            extractButton.disabled = false;
            
            // Clear progress
            progressBar.value = 100;
            progressText.textContent = '100%';
            
            // Save extracted links
            extractedLinks = request.links;
            chrome.storage.local.set({
                extractedLinks: extractedLinks,
                extractionProgress: 100
            });
            
            // Update UI
            updateLinksUI();
            
            // Send response to close the message channel
            sendResponse({received: true});
        }
        
        // Return false since we're sending response synchronously
        // (Only return true if we're going to call sendResponse asynchronously)
        return false;
    });

    // Copy all links to clipboard (filtered by inclusion settings)
    copyButton.addEventListener('click', function() {
        console.log('Copy button clicked');
        if (extractedLinks.length === 0) {
            console.warn('No links to copy');
            return;
        }
        
        // Use filtered links based on inclusion settings
        const filteredLinks = filterByIncludedCategories(extractedLinks);
        const text = filteredLinks.map(link => {
            const category = getCategoryLabel(link.category || 'organic');
            return `[${category}] ${link.title}\n${link.url}`;
        }).join('\n\n');
        
        navigator.clipboard.writeText(text)
            .then(() => {
                console.log('Links copied to clipboard');
                alert('Links copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy links: ', err);
            });
    });

    // Download links as CSV (filtered by inclusion settings)
    downloadButton.addEventListener('click', function() {
        console.log('Download button clicked');
        if (extractedLinks.length === 0) {
            console.warn('No links to download');
            return;
        }
        
        // Use filtered links based on inclusion settings
        const filteredLinks = filterByIncludedCategories(extractedLinks);
        
        // Create CSV with title, URL, domain and category columns
        const csvContent = 'data:text/csv;charset=utf-8,' + 
            encodeURIComponent('Title,URL,Domain,Category\n' + 
            filteredLinks.map(link => {
                const domain = extractDomain(link.url);
                const category = getCategoryLabel(link.category || 'organic');
                return `"${link.title.replace(/"/g, '""')}","${link.url.replace(/"/g, '""')}","${domain.replace(/"/g, '""')}","${category}"`;
            }).join('\n'));
        
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', 'search_links.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('Links downloaded as CSV');
    });

    // Add clear data functionality (update to include inclusion preferences)
    clearButton.addEventListener('click', function() {
        console.log('Clear button clicked');
        
        if (confirm('Are you sure you want to clear all extracted links?')) {
            console.log('Clearing all saved data');
            chrome.storage.local.remove([
                'extractedLinks', 
                'lastQuery', 
                'extractionProgress',
                'extractionInProgress',
                'extractionQuery',
                'extractionTotalPages',
                'extractionCurrentPage',
                'includedCategories'
            ], function() {
                console.log('Data cleared successfully');
                extractedLinks = [];
                
                // Reset inclusion preferences to defaults
                includedCategories = {
                    paa: false,
                    places: false,
                    sitelinks: false
                };
                
                // Update UI checkboxes
                includePAA.checked = false;
                includePlaces.checked = false;
                includeSitelinks.checked = false;
                
                linksList.innerHTML = '';
                linkCount.textContent = '0';
                progressBar.value = 0;
                progressText.textContent = '0%';
                resultsDiv.classList.add('hidden');
                alert('All data has been cleared');
            });
        }
    });

    function saveInclusionPreferences() {
        chrome.storage.local.set({ includedCategories: includedCategories }, function() {
            console.log('Inclusion preferences saved:', includedCategories);
        });
    }
});
