let extractedLinks = [];

// Log when popup script is loaded
console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup DOM content loaded');
    
    const extractButton = document.getElementById('extractButton');
    const copyButton = document.getElementById('copyButton');
    const downloadButton = document.getElementById('downloadButton');
    const pagesInput = document.getElementById('pages');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultsDiv = document.getElementById('results');
    const linksList = document.getElementById('linksList');
    const linkCount = document.getElementById('linkCount');

    // Log the DOM elements to ensure they're found
    console.log('Extract button found:', !!extractButton);
    console.log('Pages input found:', !!pagesInput);

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

                // Send message to background script to start extraction
                console.log('Sending startExtraction message to background script');
                chrome.runtime.sendMessage(
                    { 
                        action: 'startExtraction', 
                        pages: pages, 
                        query: query 
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

    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('Popup received message:', message);
        
        if (message.action === 'updateProgress') {
            const progress = message.progress;
            console.log('Updating progress bar to:', progress);
            progressBar.value = progress;
            progressText.textContent = Math.round(progress) + '%';
        } 
        else if (message.action === 'extractionComplete') {
            console.log('Extraction complete with', message.links?.length || 0, 'links');
            extractedLinks = message.links || [];
            linkCount.textContent = extractedLinks.length;
            
            // Display the links in the UI
            console.log('Populating links list');
            extractedLinks.forEach(function(link) {
                const linkElement = document.createElement('div');
                linkElement.classList.add('link-item');
                linkElement.textContent = link;
                linksList.appendChild(linkElement);
            });

            resultsDiv.classList.remove('hidden');
            extractButton.disabled = false;
            console.log('UI updated with extraction results');
        }
    });

    // Copy all links to clipboard
    copyButton.addEventListener('click', function() {
        console.log('Copy button clicked');
        if (extractedLinks.length === 0) {
            console.warn('No links to copy');
            return;
        }
        
        const text = extractedLinks.join('\n');
        navigator.clipboard.writeText(text)
            .then(() => {
                console.log('Links copied to clipboard');
                alert('Links copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy links: ', err);
            });
    });

    // Download links as CSV
    downloadButton.addEventListener('click', function() {
        console.log('Download button clicked');
        if (extractedLinks.length === 0) {
            console.warn('No links to download');
            return;
        }
        
        const csvContent = 'data:text/csv;charset=utf-8,' + 
            encodeURIComponent(extractedLinks.map(link => `"${link}"`).join('\n'));
        
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', 'search_links.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('Links downloaded as CSV');
    });
});
