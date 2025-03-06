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
            
            // For non-organic categories, only include if specifically enabled
            return includedCategories[category] === true;
        });
        
        // Log for debugging
        console.log(`Filtered from ${links.length} to ${filteredLinks.length} links based on inclusion preferences`);
        console.log('Current inclusion preferences:', includedCategories);
        
        return filteredLinks;
    }

    // Modify the extraction process to send inclusion preferences to background script
    extractButton.addEventListener('click', function() {
        console.log('Extract button clicked');
        
        const pages = parseInt(pagesInput.value);
        console.log('Pages to extract:', pages);
        
        if (isNaN(pages)) {
            alert('Please enter a valid number');
            return;
        }
        
        if (pages < 1 || pages > 10) {
            alert('Please enter a number between 1 and 10');
            return;
        }

        // Reset UI
        extractedLinks = [];
        linksList.innerHTML = '';
        resultsDiv.classList.add('hidden');
        progressBar.value = 0;
        progressText.textContent = '0%';
        extractButton.disabled = true;
        console.log('UI reset for extraction');

        // Start extraction process
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            console.log('Got active tab:', tabs[0]?.url);
            const currentTab = tabs[0];
            
            try {
                const url = new URL(currentTab.url);
                console.log('Parsed URL:', url.toString());
                
                // Check if the current tab is a Google search page
                if (!url.hostname.includes('google.com') || !url.pathname.includes('/search')) {
                    console.warn('Not on a Google search page');
                    alert('Please navigate to a Google search page before extracting links');
                    extractButton.disabled = false;
                    return;
                }

                const query = url.searchParams.get('q');
                console.log('Detected search query:', query);
                
                if (!query) {
                    console.warn('No search query found in URL');
                    alert('No search query detected on this page');
                    extractButton.disabled = false;
                    return;
                }

                // Save the current query
                chrome.storage.local.set({ lastQuery: query });

                // Send message to background script to start extraction
                console.log('Sending startExtraction message to background script');
                chrome.runtime.sendMessage(
                    { 
                        action: 'startExtraction', 
                        pages: pages, 
                        query: query,
                        includedCategories: includedCategories
                    },
                    function(response) {
                        if (chrome.runtime.lastError) {
                            console.error('Error sending message to background script:', chrome.runtime.lastError);
                            alert('Error starting extraction. Please try again.');
                            extractButton.disabled = false;
                        } else {
                            console.log('Message sent successfully to background script');
                        }
                    }
                );
            } catch (error) {
                console.error('Error processing tab URL:', error);
                alert('Error processing page URL. Please make sure you are on a valid Google search page.');
                extractButton.disabled = false;
            }
        });
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

    // Listen for progress updates and extraction completion
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('Popup received message:', message);
        
        if (message.action === 'updateProgress') {
            const progress = message.progress;
            console.log('Updating progress bar to:', progress);
            progressBar.value = progress;
            progressText.textContent = Math.round(progress) + '%';
            
            // Save progress for persistence
            chrome.storage.local.set({ extractionProgress: progress });
        } 
        else if (message.action === 'extractionComplete') {
            console.log('Extraction complete with', message.links?.length || 0, 'links');
            extractedLinks = message.links || [];
            
            // Save the extracted links for persistence
            chrome.storage.local.set({ 
                extractedLinks: extractedLinks,
                extractionProgress: 100 
            });
            
            updateLinksUI();
            extractButton.disabled = false;
            console.log('UI updated with extraction results');
        }
    });
});
