<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import BuchungEditForm from '$lib/components/BuchungEditForm.svelte';

    export let data: {
        buchungen: Array<{
            id: number;
            datum: string;
            soll: number;
            haben: number;
            buchungstext: string;
            betrag: number;
            kategorie?: string;
            bereich?: string;
            originaltext?: string;
        }>;
        kontos: Array<{
            id: number;
            name: string;
            kategorie: string;
        }>;
    };

    let textFilter = '';
    let sollFilter = '';
    let habenFilter = '';
    let betragFrom = '';
    let betragTo = '';
    let showEditModal = false; // Track if edit modal is open
    let editingBuchung: any = null; // Track which buchung is being edited
    let saving = false; // Track saving state
    let savedRecordId = null; // Track recently saved record for visual feedback
    let selectedBuchungen = new Set(); // Track selected checkboxes
    let bulkKategorie = ''; // Input field for bulk category update
    let bulkBereich = ''; // Input field for bulk bereich update
    let bulkSoll = ''; // Input field for bulk soll update
    let bulkHaben = ''; // Input field for bulk haben update
    let bulkSubsoll = ''; // Input field for bulk subsoll update
    let bulkSubhaben = ''; // Input field for bulk subhaben update
    let bulkUpdating = false; // Track bulk update state
    let onlyEmptyKategorie = false; // Filter for empty categories
    let onlyEmptyBereich = false; // Filter for empty bereich
    let cookiesLoaded = false; // Track if cookies have been loaded to prevent overwrite
    let uniqueSoll: number[] = []; // Unique soll values for dropdown
    let uniqueHaben: number[] = []; // Unique haben values for dropdown
    let textFilterTimeout: ReturnType<typeof setTimeout> | null = null; // Timeout for text filter auto-select
    
    // Filtered data system
    let filteredBuchungen: any[] = []; // The filtered data displayed in the UI
    
    // File upload system
    let uploadFiles: File[] = []; // Files to upload
    let uploading = false; // Track upload state
    let uploadProgress = 0; // Upload progress percentage
    let dragOver = false; // Track drag over state
    let uploadedFiles: any[] = []; // List of already uploaded files
    let loadingFiles = false; // Loading uploaded files
    let showDocumentViewer = false; // Document viewer popup
    let currentDocument = null; // Currently viewed document
    let fileInDeleteMode = null; // Track which file is in delete confirmation mode
    let renamePartner = ''; // Partner field for rename
    let renameDate = ''; // Date field for rename
    let renameAmount = ''; // Amount field for rename
    let renaming = false; // Track if rename is in progress
    let documentFilter = 'all'; // Filter: 'all', 'correct', 'incorrect'
    let matchingDocuments = []; // Documents that match the current buchung's amount
    let showAllUnassigned = false; // Toggle to show all unassigned documents instead of only matching

    // Filtered uploaded files based on format status
    $: filteredUploadedFiles = uploadedFiles.filter(file => {
        if (documentFilter === 'all') return true;
        if (documentFilter === 'correct') return isCorrectFormat(file.fileName);
        if (documentFilter === 'incorrect') return !isCorrectFormat(file.fileName);
        return true;
    });

    // Function to cycle through filter states
    function toggleDocumentFilter() {
        if (documentFilter === 'all') {
            documentFilter = 'correct';
        } else if (documentFilter === 'correct') {
            documentFilter = 'incorrect';
        } else {
            documentFilter = 'all';
        }
    }

    // Get filter button text and icon
    function getFilterButtonContent() {
        switch (documentFilter) {
            case 'all': return { icon: '📄', text: 'Alle', title: 'Alle Dokumente anzeigen' };
            case 'correct': return { icon: '✅', text: 'Korrekt', title: 'Nur korrekt formatierte Dokumente' };
            case 'incorrect': return { icon: '❌', text: 'Fehlerhaft', title: 'Nur fehlerhaft formatierte Dokumente' };
            default: return { icon: '📄', text: 'Alle', title: 'Alle Dokumente anzeigen' };
        }
    }

    // Clear bulkSubsoll when bulkSoll is not 2000 or 1100
    $: if (bulkSoll && bulkSoll !== '2000' && bulkSoll !== '1100') {
        bulkSubsoll = '';
    }

    // Clear bulkSubhaben when bulkHaben is not 2000 or 1100
    $: if (bulkHaben && bulkHaben !== '2000' && bulkHaben !== '1100') {
        bulkSubhaben = '';
    }

    // Text filter handlers
    function handleTextFilterClick(event: Event) {
        const input = event.target as HTMLInputElement;
        input.select();
    }

    function handleTextFilterInput(event: Event) {
        const input = event.target as HTMLInputElement;
        
        // Clear existing timeout
        if (textFilterTimeout) {
            clearTimeout(textFilterTimeout);
        }
        
        // Set new timeout to select all text after 700ms of no typing
        textFilterTimeout = setTimeout(() => {
            input.select();
        }, 700);
        
        // Save filters to cookie
        if (cookiesLoaded) saveFiltersToCookie();
    }

    // Cookie helper functions
    function setCookie(name: string, value: string, days: number = 365) {
        if (!browser) return;
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        // More robust cookie setting with explicit path and SameSite
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
        console.log(`Cookie saved: ${name}`, value); // Debug log
    }

    function getCookie(name: string): string | null {
        if (!browser) return null;
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
        return null;
    }

    // Save filter settings to cookies (individual cookies)
    function saveFiltersToCookie() {
        if (!browser) return;
        setCookie('buchungen-textFilter', textFilter, 365);
        setCookie('buchungen-sollFilter', sollFilter, 365);
        setCookie('buchungen-habenFilter', habenFilter, 365);
        setCookie('buchungen-betragFrom', betragFrom, 365);
        setCookie('buchungen-betragTo', betragTo, 365);
        setCookie('buchungen-onlyEmptyKategorie', onlyEmptyKategorie.toString(), 365);
        setCookie('buchungen-onlyEmptyBereich', onlyEmptyBereich.toString(), 365);
        console.log('Individual cookies saved:', {
            textFilter,
            sollFilter,
            habenFilter,
            betragFrom,
            betragTo,
            onlyEmptyKategorie,
            onlyEmptyBereich
        });
    }

    // Load filter settings from cookies (individual cookies)
    function loadFiltersFromCookie() {
        if (!browser) return;
        
        console.log('Loading individual cookies...');
        
        const loadedTextFilter = getCookie('buchungen-textFilter');
        const loadedSollFilter = getCookie('buchungen-sollFilter'); 
        const loadedHabenFilter = getCookie('buchungen-habenFilter');
        const loadedBetragFrom = getCookie('buchungen-betragFrom');
        const loadedBetragTo = getCookie('buchungen-betragTo');
        const loadedEmptyKat = getCookie('buchungen-onlyEmptyKategorie');
        const loadedEmptyBer = getCookie('buchungen-onlyEmptyBereich');
        
        // Apply loaded values
        textFilter = loadedTextFilter || '';
        sollFilter = loadedSollFilter || '';
        habenFilter = loadedHabenFilter || '';
        betragFrom = loadedBetragFrom || '';
        betragTo = loadedBetragTo || '';
        onlyEmptyKategorie = loadedEmptyKat === 'true';
        onlyEmptyBereich = loadedEmptyBer === 'true';
        
        console.log('Individual filters loaded:', {
            textFilter: textFilter,
            sollFilter: sollFilter,
            habenFilter: habenFilter,
            betragFrom: betragFrom,
            betragTo: betragTo,
            onlyEmptyKategorie: onlyEmptyKategorie,
            onlyEmptyBereich: onlyEmptyBereich
        });
        
        console.log('Raw cookie values:', {
            loadedTextFilter,
            loadedSollFilter,
            loadedHabenFilter,
            loadedBetragFrom,
            loadedBetragTo,
            loadedEmptyKat
        });
        
        // Mark cookies as loaded to prevent reactive save from overwriting
        cookiesLoaded = true;
    }

    // Load filter settings on mount
    onMount(async () => {
        // Wait a tick to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Load filters from cookies
        loadFiltersFromCookie();
        
        console.log('Mount complete - filters loaded');
        
        // Add window load event as backup
        const handleWindowLoad = () => {
            console.log('Window loaded - reloading filters as backup');
            loadFiltersFromCookie();
        };
        
        if (document.readyState === 'complete') {
            handleWindowLoad();
        } else {
            window.addEventListener('load', handleWindowLoad);
        }
        
        return () => {
            window.removeEventListener('load', handleWindowLoad);
        };
    });



    // Get unique soll and haben values for select options - optimized recalculation (skip during saves)
    $: if (!saving) {
        const newUniqueSoll = [...new Set(data.buchungen.map(b => b.soll))].sort((a, b) => a - b);
        const newUniqueHaben = [...new Set(data.buchungen.map(b => b.haben))].sort((a, b) => a - b);
        
        // Only update if the arrays actually changed (avoid unnecessary updates)
        if (JSON.stringify(newUniqueSoll) !== JSON.stringify(uniqueSoll)) {
            uniqueSoll = newUniqueSoll;
            console.log('Updated uniqueSoll values');
        }
        if (JSON.stringify(newUniqueHaben) !== JSON.stringify(uniqueHaben)) {
            uniqueHaben = newUniqueHaben;
            console.log('Updated uniqueHaben values');
        }
    }

    function getAccountName(accountId: number): string {
        const konto = data.kontos.find(k => k.id === accountId);
        return konto ? `${accountId} - ${konto.name}` : accountId.toString();
    }

    // Generate filter state signature to detect when filters change
    function getFilterStateSignature(): string {
        return JSON.stringify({
            textFilter,
            sollFilter,
            habenFilter,
            betragFrom,
            betragTo,
            onlyEmptyKategorie,
            onlyEmptyBereich
        });
    }

    // Apply filters to buchungen data
    function applyFiltersToData(buchungen: any[]): any[] {
        return buchungen.filter(buchung => {
            const textMatch = textFilter === '' || 
                buchung.buchungstext.toLowerCase().includes(textFilter.toLowerCase()) ||
                (buchung.originaltext && buchung.originaltext.toLowerCase().includes(textFilter.toLowerCase())) ||
                (buchung.kategorie && buchung.kategorie.toLowerCase().includes(textFilter.toLowerCase()));
            const sollMatch = sollFilter === '' || buchung.soll.toString() === sollFilter;
            const habenMatch = habenFilter === '' || buchung.haben.toString() === habenFilter;
            
            // Betrag range filtering
            const fromValue = betragFrom === '' ? null : parseFloat(betragFrom);
            const toValue = betragTo === '' ? null : parseFloat(betragTo);
            const betragMatch = (fromValue === null || buchung.betrag >= fromValue) && 
                               (toValue === null || buchung.betrag <= toValue);
            
            // Empty kategorie filtering
            const kategorieMatch = !onlyEmptyKategorie || !buchung.kategorie || buchung.kategorie.trim() === '';
            
            // Empty bereich filtering
            const bereichMatch = !onlyEmptyBereich || !buchung.bereich || buchung.bereich.trim() === '';
            
            return textMatch && sollMatch && habenMatch && betragMatch && kategorieMatch && bereichMatch;
        });
    }

    // Reactive filtering system - explicitly depends on all filter variables
    $: if (cookiesLoaded && !saving) {
        // Explicitly reference all filter variables to ensure reactivity triggers
        const filterInputs = {
            textFilter,
            sollFilter,
            habenFilter,
            betragFrom,
            betragTo,
            onlyEmptyKategorie,
            onlyEmptyBereich,
            dataLength: data.buchungen.length
        };
        
        console.log('Applying filters with inputs:', filterInputs);
        filteredBuchungen = applyFiltersToData(data.buchungen)
            .sort((a, b) => {
                // Primary sort: datum ascending
                const dateA = a.datum || '';
                const dateB = b.datum || '';
                const dateComparison = dateA.localeCompare(dateB);
                
                if (dateComparison !== 0) {
                    return dateComparison;
                }
                
                // Secondary sort: id ascending
                return (a.id || 0) - (b.id || 0);
            });
        console.log(`Filtered ${data.buchungen.length} to ${filteredBuchungen.length} records`);
    }

    // Track the last editingBuchung to avoid reloading when only assignedDocuments change
    let lastEditingBuchungId: number | null = null;
    let lastShowAllUnassigned: boolean = false;
    
    // Load matching documents when a buchung is being edited or checkbox changes
    $: {
        console.log('🔍 Reactive statement triggered:', { 
            editingBuchungId: editingBuchung?.id, 
            lastEditingBuchungId, 
            hasEditingBuchung: !!editingBuchung,
            showAllUnassigned,
            lastShowAllUnassigned,
            buchungChanged: editingBuchung !== null && editingBuchung.id !== lastEditingBuchungId,
            checkboxChanged: showAllUnassigned !== lastShowAllUnassigned
        });
        
        // Reload if buchung changed OR checkbox changed (while editing)
        if (editingBuchung !== null) {
            const buchungChanged = editingBuchung.id !== lastEditingBuchungId;
            const checkboxChanged = showAllUnassigned !== lastShowAllUnassigned;
            
            if (buchungChanged || checkboxChanged) {
                console.log('🚀 Loading matching documents for buchung:', editingBuchung, 
                    buchungChanged ? '(buchung changed)' : '(checkbox changed)');
                lastEditingBuchungId = editingBuchung.id;
                lastShowAllUnassigned = showAllUnassigned;
                loadMatchingDocuments(editingBuchung.betrag);
            }
        }
    }

    // Async function to load matching documents
    async function loadMatchingDocuments(betrag: number) {
        console.log('📡 loadMatchingDocuments called with betrag:', betrag);
        console.trace('📍 Call stack for loadMatchingDocuments');
        try {
            const docs = await getMatchingDocuments(betrag);
            matchingDocuments = docs;
            
            // Auto-select first matching document only if no uploaded documents are available
            if (uploadedFiles.length === 0) {
                if (docs.length > 0) {
                    currentDocument = docs[0];
                    console.log(`📌 Auto-selected first matching document: ${docs[0].fileName}`);
                } else {
                    currentDocument = null;
                    console.log(`📌 No documents available, cleared selection`);
                }
            } else {
                console.log(`📌 Uploaded documents present, keeping uploaded document selection`);
            }
            
            console.log(`✅ Found ${docs.length} matching documents for betrag ${betrag}`);
        } catch (error) {
            console.error('❌ Error loading matching documents:', error);
            matchingDocuments = [];
            currentDocument = null;
        }
    }

    // Format currency as CHF
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    }

    // Format date
    function formatDate(dateString: string): string {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    // Format date for input field (YYYY-MM-DD)
    function formatDateForInput(dateString: string): string {
        return new Date(dateString).toISOString().split('T')[0];
    }

    // Start editing a row - opens modal
    function startEdit(buchung: any) {
        console.log('Edit button clicked! Starting edit for buchung:', buchung);
        editingBuchung = buchung;
        showEditModal = true;
        console.log('Set showEditModal to true, editingBuchung:', editingBuchung);
        
        // Load uploaded files for this buchung
        loadUploadedFiles(buchung.id);
    }

    // Cancel editing
    function handleCancelEdit() {
        console.log('Canceling edit without page reload');
        showEditModal = false;
        editingBuchung = null;
        uploadFiles = [];
        uploadedFiles = [];
        fileInDeleteMode = null; // Reset delete mode
        currentDocument = null; // Reset current document
        showAllUnassigned = false; // Reset checkbox
        lastShowAllUnassigned = false; // Reset tracking variable
        // Ensure filters are maintained after cancel
        saveFiltersToCookie();
    }

    // Clear selections without affecting filters
    function clearSelections() {
        selectedBuchungen.clear();
        selectedBuchungen = new Set(selectedBuchungen);
        bulkKategorie = '';
    }

    // Reset all filters (optional function for future use)
    function resetFilters() {
        textFilter = '';
        sollFilter = '';
        habenFilter = '';
        betragFrom = '';
        betragTo = '';
        onlyEmptyKategorie = false;
        onlyEmptyBereich = false;
        clearSelections();
        // Explicitly save the cleared state
        saveFiltersToCookie();
    }

    // Save edit (updates the JSON file)
    async function handleSaveEdit(event: CustomEvent) {
        if (saving) return; // Prevent double-clicking
        
        saving = true;
        
        try {
            const response = await fetch('/api/buchungen', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event.detail)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to save: ${errorText}`);
            }

            const result = await response.json();
            
            // Update local data directly without triggering list reload
            const buchungIndex = data.buchungen.findIndex(b => b.id === event.detail.id);
            if (buchungIndex !== -1) {
                // Update the local data with the new values
                data.buchungen[buchungIndex] = {
                    ...data.buchungen[buchungIndex],
                    ...event.detail,
                    kategorie: event.detail.kategorie || '',
                    bereich: event.detail.bereich || ''
                };
                
                // Trigger minimal reactivity to update the filtered list
                data.buchungen = [...data.buchungen];
            }
            
            // Close modal and exit edit mode
            showEditModal = false;
            editingBuchung = null;
            showAllUnassigned = false; // Reset checkbox
            lastShowAllUnassigned = false; // Reset tracking variable
            
            // Show success message
            console.log('Buchung saved successfully - local data updated without list reload');
            
        } catch (err) {
            console.error('Error saving buchung:', err);
            alert(`Error saving changes: ${err.message}`);
        } finally {
            saving = false;
        }
    }

    // Copy a buchung (create duplicate with new ID)
    async function copyBuchung(buchung: any) {
        if (saving) return; // Prevent issues while saving
        
        saving = true;
        
        try {
            // Find the highest ID to generate a new unique ID
            const maxId = Math.max(...data.buchungen.map(b => b.id));
            const newId = maxId + 1;
            
            // Create copy with new ID and modified buchungstext
            const newBuchung = {
                id: newId,
                datum: buchung.datum,
                soll: buchung.soll,
                haben: buchung.haben,
                buchungstext: `${buchung.buchungstext} (Kopie)`,
                betrag: buchung.betrag,
                kategorie: buchung.kategorie || '',
                bereich: buchung.bereich || ''
            };
            
            const response = await fetch('/api/buchungen', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newBuchung)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to copy: ${errorText}`);
            }

            const result = await response.json();
            
            // Add the new buchung to local data
            data.buchungen = [...data.buchungen, newBuchung];
            
            // Show success feedback
            savedRecordId = newId;
            setTimeout(() => {
                savedRecordId = null;
            }, 2000);
            
            console.log('Buchung copied successfully with ID:', newId);
            
        } catch (err) {
            console.error('Error copying buchung:', err);
            alert(`Error copying buchung: ${err.message}`);
        } finally {
            saving = false;
        }
    }

    // Toggle checkbox selection
    function toggleSelection(buchungId: number) {
        if (selectedBuchungen.has(buchungId)) {
            selectedBuchungen.delete(buchungId);
        } else {
            selectedBuchungen.add(buchungId);
        }
        selectedBuchungen = new Set(selectedBuchungen); // Trigger reactivity
    }

    // Toggle all checkboxes
    function toggleAll() {
        if (selectedBuchungen.size === filteredBuchungen.length) {
            selectedBuchungen.clear();
        } else {
            selectedBuchungen = new Set(filteredBuchungen.map(b => b.id));
        }
        selectedBuchungen = new Set(selectedBuchungen); // Trigger reactivity
    }

    // Bulk update fields (kategorie, soll, haben)
    async function bulkUpdateFields() {
        if (bulkUpdating || selectedBuchungen.size === 0) {
            return;
        }

        // Check if at least one field has a value
        const hasKategorie = bulkKategorie.trim() !== '';
        const hasBereich = bulkBereich.trim() !== '';
        const hasSoll = bulkSoll !== '';
        const hasHaben = bulkHaben !== '';
        const hasSubsoll = bulkSubsoll !== '';
        const hasSubhaben = bulkSubhaben !== '';
        
        if (!hasKategorie && !hasBereich && !hasSoll && !hasHaben && !hasSubsoll && !hasSubhaben) {
            return;
        }

        bulkUpdating = true;
        try {
            const promises = Array.from(selectedBuchungen).map(id => {
                // Build update object with only selected fields
                const updateData: any = { id };
                
                if (hasKategorie) {
                    updateData.kategorie = bulkKategorie.trim();
                }
                if (hasBereich) {
                    updateData.bereich = bulkBereich.trim();
                }
                if (hasSoll) {
                    updateData.soll = parseInt(bulkSoll);
                }
                if (hasHaben) {
                    updateData.haben = parseInt(bulkHaben);
                }
                if (hasSubsoll) {
                    updateData.subsoll = parseInt(bulkSubsoll);
                }
                if (hasSubhaben) {
                    updateData.subhaben = parseInt(bulkSubhaben);
                }
                
                return fetch('/api/buchungen', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                });
            });

            const responses = await Promise.all(promises);
            
            // Check if all requests were successful
            for (const response of responses) {
                if (!response.ok) {
                    throw new Error(`Failed to update some buchungen`);
                }
            }

            // Update local data
            for (const id of selectedBuchungen) {
                const buchungIndex = data.buchungen.findIndex(b => b.id === id);
                if (buchungIndex !== -1) {
                    if (hasKategorie) {
                        data.buchungen[buchungIndex].kategorie = bulkKategorie.trim();
                    }
                    if (hasBereich) {
                        data.buchungen[buchungIndex].bereich = bulkBereich.trim();
                    }
                    if (hasSoll) {
                        data.buchungen[buchungIndex].soll = parseInt(bulkSoll);
                    }
                    if (hasHaben) {
                        data.buchungen[buchungIndex].haben = parseInt(bulkHaben);
                    }
                    if (hasSubsoll) {
                        data.buchungen[buchungIndex].subsoll = parseInt(bulkSubsoll);
                    }
                    if (hasSubhaben) {
                        data.buchungen[buchungIndex].subhaben = parseInt(bulkSubhaben);
                    }
                }
            }
            
            // Trigger minimal reactivity
            data.buchungen = [...data.buchungen];
            
            // Clear selections and inputs but preserve filters
            clearSelections();
            bulkKategorie = '';
            bulkBereich = '';
            bulkSoll = '';
            bulkHaben = '';
            bulkSubsoll = '';
            bulkSubhaben = '';
            
            // Ensure filters are maintained after bulk update
            saveFiltersToCookie();
            
            console.log('Bulk update successful!');
            
        } catch (err) {
            console.error('Error bulk updating fields:', err);
            alert(`Error updating fields: ${err.message}`);
        } finally {
            bulkUpdating = false;
        }
    }

    // File upload functions
    function handleFileDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
        
        const files = Array.from(event.dataTransfer?.files || []);
        uploadFiles = [...uploadFiles, ...files];
        console.log('Files dropped:', files.map(f => f.name));
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        dragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
    }

    function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files || []);
        uploadFiles = [...uploadFiles, ...files];
        console.log('Files selected:', files.map(f => f.name));
    }

    function removeFile(index: number) {
        uploadFiles = uploadFiles.filter((_, i) => i !== index);
    }

    async function uploadFilesToS3() {
        if (uploadFiles.length === 0 || uploading) return;
        
        uploading = true;
        uploadProgress = 0;

        try {
            for (let i = 0; i < uploadFiles.length; i++) {
                const file = uploadFiles[i];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('buchungId', editingId?.toString() || '');

                console.log(`Uploading file ${i + 1}/${uploadFiles.length}: ${file.name}`);

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Upload fehlgeschlagen für ${file.name}: ${errorText}`);
                }

                const result = await response.json();
                console.log(`Upload successful for ${file.name}:`, result);
                
                // Update progress
                uploadProgress = Math.round(((i + 1) / uploadFiles.length) * 100);
            }

            // Clear uploaded files
            uploadFiles = [];
            uploadProgress = 0;
            console.log('All files uploaded successfully!');
            
            // Reload the uploaded files list
            if (editingId) {
                await loadUploadedFiles(editingId);
            }
            
        } catch (err) {
            console.error('Error uploading files:', err);
            alert(`Error uploading files: ${err.message}`);
        } finally {
            uploading = false;
        }
    }

    // Load uploaded files for the current buchung
    async function loadUploadedFiles(buchungId: number) {
        if (!buchungId || loadingFiles) return;
        
        loadingFiles = true;
        // Don't reset currentDocument here as it might be a matching document selection
        fileInDeleteMode = null; // Reset delete mode
        
        try {
            const response = await fetch(`/api/upload?buchungId=${buchungId}`);
            if (!response.ok) {
                throw new Error(`Failed to load files: ${response.statusText}`);
            }
            
            const result = await response.json();
            uploadedFiles = result.data?.files || [];
            console.log(`Loaded ${uploadedFiles.length} files for buchung ${buchungId}`);
            
            // Always auto-select the first uploaded document if available (priority over matching docs)
            if (uploadedFiles.length > 0) {
                currentDocument = uploadedFiles[0];
                console.log(`📌 Auto-selected first uploaded document: ${currentDocument.fileName}`);
            }
            
        } catch (err) {
            console.error('Error loading uploaded files:', err);
            uploadedFiles = [];
        } finally {
            loadingFiles = false;
        }
    }

    // Extract amount from filename (for matching documents)
    function extractAmountFromFilename(fileName: string): number | null {
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const parts = nameWithoutExt.split('_');
        
        console.log(`Extracting amount from: ${fileName} -> parts: [${parts.join(', ')}]`);
        
        if (parts.length >= 3) {
            const amountStr = parts[parts.length - 1];
            const amount = parseFloat(amountStr);
            const result = isNaN(amount) ? null : amount;
            console.log(`Amount string: "${amountStr}" -> parsed: ${amount} -> result: ${result}`);
            return result;
        }
        
        console.log(`Not enough parts (${parts.length}), returning null`);
        return null;
    }

    // Load all documents from S3
    async function loadAllDocuments() {
        try {
            const response = await fetch('/api/docs');
            if (!response.ok) {
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result.data?.files || [];
        } catch (err) {
            console.error('Error loading all documents:', err);
            return [];
        }
    }

    // Get documents that match the buchung amount
    async function getMatchingDocuments(buchungBetrag: number): Promise<any[]> {
        console.log(`Looking for documents ${showAllUnassigned ? '(all unassigned)' : `matching betrag: ${buchungBetrag}`}`);
        const allDocuments = await loadAllDocuments();
        console.log(`Found ${allDocuments.length} total documents:`, allDocuments.map(d => d.fileName));
        
        // Get list of all assigned document keys from all buchungen
        const assignedKeys = new Set();
        data.buchungen.forEach(buchung => {
            if (buchung.assignedDocuments) {
                buchung.assignedDocuments.forEach(doc => {
                    assignedKeys.add(doc.originalKey);
                });
            }
        });
        
        console.log(`Found ${assignedKeys.size} already assigned documents:`, [...assignedKeys]);
        
        const matchingDocs = allDocuments.filter(doc => {
            // Only include documents from uldocs/ folder (unassigned documents)
            if (!doc.key.startsWith('uldocs/')) {
                console.log(`Skipping non-uldocs document: ${doc.fileName} (${doc.key})`);
                return false;
            }
            
            // Skip documents that are already assigned (check buchungen data)
            if (assignedKeys.has(doc.key)) {
                console.log(`Skipping assigned document: ${doc.fileName}`);
                return false;
            }
            
            // If showAllUnassigned is true, include all unassigned documents
            if (showAllUnassigned) {
                console.log(`Including unassigned document: ${doc.fileName}`);
                return true;
            }
            
            // Otherwise, filter by matching betrag
            const docAmount = extractAmountFromFilename(doc.fileName);
            const matches = docAmount !== null && Math.abs(docAmount - Math.abs(buchungBetrag)) < 0.01;
            console.log(`Document: ${doc.fileName}, extracted amount: ${docAmount}, matches: ${matches}`);
            return matches;
        });
        
        // Sort matching documents by filename in ascending order
        matchingDocs.sort((a, b) => a.fileName.localeCompare(b.fileName));
        
        console.log(`Found ${matchingDocs.length} ${showAllUnassigned ? 'unassigned' : 'matching'} documents:`, matchingDocs.map(d => d.fileName));
        return matchingDocs;
    }

    // Show document in preview area
    function viewDocument(file: any) {
        console.log('ViewDocument called with:', file.fileName);
        currentDocument = file;
        // Don't show the popup anymore, use inline preview
        showDocumentViewer = false;
        console.log('Current document set to:', currentDocument?.fileName);
        console.log('Full currentDocument object:', currentDocument);
    }

    // Assign selected document to the current buchung
    async function assignDocumentToBuchung() {
        console.log('Assign function called');
        console.log('currentDocument:', currentDocument);
        console.log('editingBuchung:', editingBuchung);
        
        if (!currentDocument || !editingBuchung) {
            console.error('No document or buchung selected for assignment');
            console.error('currentDocument is:', currentDocument);
            console.error('editingBuchung is:', editingBuchung);
            return;
        }

        try {
            console.log(`Assigning document ${currentDocument.fileName} to buchung ${editingBuchung.id}`);
            console.log('Current document object:', currentDocument);
            console.log('Editing buchung object:', editingBuchung);
            
            // Call the existing upload API with buchungId to associate the document
            console.log('Making fetch request with:', {
                action: 'assign',
                fileKey: currentDocument.key,
                buchungId: editingBuchung.id,
                fileName: currentDocument.fileName
            });
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'assign',
                    fileKey: currentDocument.key,
                    buchungId: editingBuchung.id,
                    fileName: currentDocument.fileName
                })
            });

            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`Failed to assign document: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            console.log('Document assigned successfully:', result);

            // Add the assignment to the current buchung data immediately for UI update
            if (!editingBuchung.assignedDocuments) {
                editingBuchung.assignedDocuments = [];
            }
            editingBuchung.assignedDocuments.push(result.data);

            // Update the main data array as well
            const buchungIndex = data.buchungen.findIndex(b => b.id === editingBuchung.id);
            if (buchungIndex !== -1) {
                if (!data.buchungen[buchungIndex].assignedDocuments) {
                    data.buchungen[buchungIndex].assignedDocuments = [];
                }
                data.buchungen[buchungIndex].assignedDocuments.push(result.data);
            }

            // Remove the document from matching documents list since it's now assigned
            matchingDocuments = matchingDocuments.filter(doc => doc.key !== currentDocument.key);
            
            // Refresh both assigned documents and matching documents lists from server
            await loadUploadedFiles(editingBuchung.id);
            await loadMatchingDocuments(editingBuchung.betrag);
            
            // Keep the popup open - don't clear currentDocument
            // Success - document assigned successfully (no alert needed)

        } catch (error) {
            console.error('Error assigning document:', error);
            alert(`Fehler beim Zuordnen des Dokuments: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        }
    }

    // Start delete mode for a file
    function startDeleteMode(file: any) {
        fileInDeleteMode = file.key;
    }

    // Cancel delete mode
    function cancelDelete() {
        fileInDeleteMode = null;
    }

    // Confirm and delete the document
    async function confirmDeleteDocument(file: any) {
        console.log('🗑️ Starting delete for file:', file.fileName);
        console.log('📊 Before delete - editingBuchung:', editingBuchung?.id, 'assignedDocs:', editingBuchung?.assignedDocuments?.length);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    fileKey: file.key,
                    buchungId: editingBuchung?.id // Include buchungId for assigned documents
                })
            });

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.statusText}`);
            }
            
            console.log('✅ Delete API call successful');

            // Remove from uploadedFiles array
            uploadedFiles = uploadedFiles.filter(f => f.key !== file.key);
            console.log('🔄 Updated uploadedFiles, new length:', uploadedFiles.length);
            
            // Also remove from the buchung's assignedDocuments in local data
            if (editingBuchung && editingBuchung.assignedDocuments) {
                console.log('🔄 Before updating assignedDocuments:', editingBuchung.assignedDocuments.length);
                editingBuchung.assignedDocuments = editingBuchung.assignedDocuments.filter(
                    doc => doc.newKey !== file.key && doc.originalKey !== file.key
                );
                if (editingBuchung.assignedDocuments.length === 0) {
                    delete editingBuchung.assignedDocuments;
                }
                console.log('🔄 After updating assignedDocuments:', editingBuchung.assignedDocuments?.length || 0);
            }
            
            // Update the main data array as well
            const buchungIndex = data.buchungen.findIndex(b => b.id === editingBuchung?.id);
            if (buchungIndex !== -1 && data.buchungen[buchungIndex].assignedDocuments) {
                data.buchungen[buchungIndex].assignedDocuments = data.buchungen[buchungIndex].assignedDocuments.filter(
                    doc => doc.newKey !== file.key && doc.originalKey !== file.key
                );
                if (data.buchungen[buchungIndex].assignedDocuments.length === 0) {
                    delete data.buchungen[buchungIndex].assignedDocuments;
                }
            }
            
            // Refresh both assigned documents and matching documents lists from server
            await loadUploadedFiles(editingBuchung.id);
            await loadMatchingDocuments(editingBuchung.betrag);
            
            // If the deleted document was the one being displayed, try to keep a document selected
            if (currentDocument && currentDocument.key === file.key) {
                // Try to select the first available uploaded document, or first matching document
                if (uploadedFiles.length > 0) {
                    currentDocument = uploadedFiles[0];
                } else if (matchingDocuments.length > 0) {
                    currentDocument = matchingDocuments[0];
                } else {
                    // Only clear if no documents available
                    currentDocument = null;
                }
            }

            // Reset delete mode
            fileInDeleteMode = null;

            console.log(`Document deleted successfully: ${file.fileName}`);
            
        } catch (err) {
            console.error('Error deleting document:', err);
            alert(`Fehler beim Löschen der Datei: ${err.message}`);
            fileInDeleteMode = null;
        }
    }

    // Rename document
    async function renameDocument() {
        if (!currentDocument || !renamePartner.trim() || renaming) return;
        
        // Build the new filename: partner_date_amount
        const partnerName = renamePartner.trim();
        const dateString = renameDate ? renameDate.replace(/-/g, '') : ''; // Remove dashes from date
        
        // Format amount with 2 decimal places
        let amountString = '';
        if (renameAmount) {
            const cleanAmount = renameAmount.toString().replace(/[^\d.,]/g, '').replace(/,/g, '.');
            const numericAmount = parseFloat(cleanAmount);
            if (!isNaN(numericAmount)) {
                amountString = numericAmount.toFixed(2);
            }
        }
        
        let newFileName = partnerName;
        if (dateString) {
            newFileName += '_' + dateString;
        }
        if (amountString) {
            newFileName += '_' + amountString;
        }
        
        if (newFileName === currentDocument.fileName) return; // No change
        
        renaming = true;
        try {
            const response = await fetch('/api/upload/rename', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    oldKey: currentDocument.key,
                    newFileName: newFileName
                })
            });

            if (!response.ok) {
                throw new Error(`Rename failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            // Update the current document with new key, filename and signed URL
            currentDocument = { 
                ...currentDocument, 
                fileName: result.data.newFileName, 
                key: result.data.newKey,
                signedUrl: result.data.signedUrl
            };
            
            // Update the file in uploadedFiles array
            uploadedFiles = uploadedFiles.map(file => 
                file.key === result.data.oldKey 
                    ? { 
                        ...file, 
                        fileName: result.data.newFileName, 
                        key: result.data.newKey,
                        signedUrl: result.data.signedUrl
                    }
                    : file
            );

            console.log(`Document renamed successfully: ${newFileName}`);
            
        } catch (err) {
            console.error('Error renaming document:', err);
            alert(`Fehler beim Umbenennen der Datei: ${err.message}`);
        } finally {
            renaming = false;
        }
    }

    // Initialize rename fields when document is selected
    function initializeRename(file: any) {
        // Initialize partner field - could be empty or extracted from existing filename
        if (file) {
            const baseFileName = file.fileName.substring(0, file.fileName.lastIndexOf('.') || file.fileName.length);
            const decomposed = decomposeFilename(baseFileName);
            
            renamePartner = decomposed.partner;
            renameDate = decomposed.date;
            renameAmount = decomposed.amount;
        } else {
            renamePartner = '';
            // Initialize with current booking data if available
            if (editingBuchung && editingBuchung.datum) {
                renameDate = editingBuchung.datum;
            } else {
                renameDate = new Date().toISOString().split('T')[0]; // Today's date
            }
            
            if (editingBuchung && editingBuchung.betrag) {
                renameAmount = editingBuchung.betrag.toString();
            } else {
                renameAmount = '';
            }
        }
    }

    // Function to decompose filenames into partner, date, and amount
    function decomposeFilename(baseFileName: string): { partner: string; date: string; amount: string } {
        let partner = '';
        let date = '';
        let amount = '';

        // Pattern 1: migrol_20251029_14.00 (partner_yyyymmdd_amount)
        const pattern1 = /^([^_]+)_(\d{8})_(\d+\.?\d*)$/;
        const match1 = baseFileName.match(pattern1);
        
        if (match1) {
            partner = match1[1];
            // Convert yyyymmdd to yyyy-mm-dd
            const dateStr = match1[2];
            date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            amount = match1[3];
            return { partner, date, amount };
        }

        // Pattern 2: Wagner_-_18.10.2025_-_12-17 (partner_-_dd.mm.yyyy_-_more-info)
        const pattern2 = /^([^_]+)_-_(\d{1,2})\.(\d{1,2})\.(\d{4})(_-_.+)?$/;
        const match2 = baseFileName.match(pattern2);
        
        if (match2) {
            partner = match2[1];
            // Convert dd.mm.yyyy to yyyy-mm-dd
            const day = match2[2].padStart(2, '0');
            const month = match2[3].padStart(2, '0');
            const year = match2[4];
            date = `${year}-${month}-${day}`;
            amount = ''; // No amount in this pattern
            return { partner, date, amount };
        }

        // Pattern 3: Partner - dd.mm.yyyy - amount (with spaces and dashes)
        // Examples: "Wagner - 18.10.2025 - 12.50", "Wagner - 18.10.2025 - 12-17"
        const pattern3 = /^([^-]+?)\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(.+)$/;
        const match3 = baseFileName.match(pattern3);
        
        if (match3) {
            partner = match3[1].trim();
            // Convert dd.mm.yyyy to yyyy-mm-dd
            const day = match3[2].padStart(2, '0');
            const month = match3[3].padStart(2, '0');
            const year = match3[4];
            date = `${year}-${month}-${day}`;
            
            // Check if the last part looks like a decimal amount (e.g., "12.50")
            const lastPart = match3[5].trim();
            const amountMatch = lastPart.match(/^\d+[.,]\d{2}$/);
            if (amountMatch) {
                amount = lastPart.replace(',', '.');
            } else {
                amount = ''; // Not a decimal amount format
            }
            return { partner, date, amount };
        }

        // Pattern 4: Partner - dd.mm.yyyy (without amount)
        // Examples: "Wagner - 18.10.2025"
        const pattern4 = /^([^-]+?)\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
        const match4 = baseFileName.match(pattern4);
        
        if (match4) {
            partner = match4[1].trim();
            // Convert dd.mm.yyyy to yyyy-mm-dd
            const day = match4[2].padStart(2, '0');
            const month = match4[3].padStart(2, '0');
            const year = match4[4];
            date = `${year}-${month}-${day}`;
            amount = '';
            return { partner, date, amount };
        }

        // Pattern 5: General date extraction - look for any dd.mm.yyyy pattern
        const generalDateMatch = baseFileName.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (generalDateMatch) {
            const day = generalDateMatch[1].padStart(2, '0');
            const month = generalDateMatch[2].padStart(2, '0');
            const year = generalDateMatch[3];
            date = `${year}-${month}-${day}`;
            
            // Extract partner from beginning of filename (before date)
            const beforeDate = baseFileName.substring(0, baseFileName.indexOf(generalDateMatch[0])).trim();
            partner = beforeDate.replace(/[-_\s]+$/, '').trim() || 'Unknown';
            
            // Look for decimal amount pattern anywhere in filename
            const amountMatch = baseFileName.match(/\b(\d+[.,]\d{2})\b/);
            if (amountMatch) {
                amount = amountMatch[1].replace(',', '.');
            }
            return { partner, date, amount };
        }

        // Fallback: Try to extract partner from existing filename (before first underscore or dash)
        const separatorMatch = baseFileName.match(/^([^_-]+)/);
        if (separatorMatch) {
            partner = separatorMatch[1].trim();
        } else {
            partner = baseFileName;
        }

        // If no date found, use current booking data or defaults
        if (editingBuchung && editingBuchung.datum) {
            date = editingBuchung.datum;
        } else {
            date = new Date().toISOString().split('T')[0]; // Today's date
        }
        
        if (editingBuchung && editingBuchung.betrag) {
            amount = editingBuchung.betrag.toString();
        }

        return { partner, date, amount };
    }

    // Check if filename follows correct format (partner_yyyymmdd_amount.extension)
    function isCorrectFormat(fileName: string): boolean {
        const baseFileName = fileName.substring(0, fileName.lastIndexOf('.') || fileName.length);
        
        // Check for correct format: partner_yyyymmdd_amount
        const correctFormatPattern = /^[^_]+_\d{8}_\d+(\.\d{2})?$/;
        return correctFormatPattern.test(baseFileName);
    }

    // Update rename field when currentDocument changes
    $: if (currentDocument) {
        initializeRename(currentDocument);
    }

    // Handle Enter key press in rename inputs
    function handleRenameKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !renaming && renamePartner.trim()) {
            renameDocument();
        }
    }

    // Close document viewer popup
    function closeDocumentViewer() {
        showDocumentViewer = false;
        currentDocument = null;
    }

    // Get file icon based on file type
    function getFileIcon(fileType: string): string {
        if (fileType.startsWith('image/')) return '🖼️';
        if (fileType === 'application/pdf') return '📄';
        if (fileType.includes('word')) return '📝';
        if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
        return '📎';
    }

    // Get file icon with format status indicator
    function getFileIconWithStatus(fileType: string, fileName: string): string {
        if (isCorrectFormat(fileName)) {
            // Correctly formatted - show normal file icon
            return getFileIcon(fileType);
        } else {
            // Incorrectly formatted - show red X
            return '❌';
        }
    }

    // Format file size
    function formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
</script>

<div class="page-container">
    <div class="header">
        <h1>Buchungen Übersicht</h1>
        <div class="controls">
            <!-- Bulk Update Controls - Always visible, moved to left -->
            <div class="bulk-update-controls">
                <span class="bulk-info-compact">
                    {selectedBuchungen.size > 0 ? `${selectedBuchungen.size} ausgewählt:` : 'Bulk Update:'}
                </span>
                
                <div class="bulk-inputs">
                    <!-- Kategorie Input -->
                    <input 
                        type="text" 
                        bind:value={bulkKategorie} 
                        placeholder="Kategorie setzen" 
                        class="bulk-input-compact"
                        disabled={bulkUpdating || selectedBuchungen.size === 0}
                    />
                    
                    <!-- Bereich Input -->
                    <input 
                        type="text" 
                        bind:value={bulkBereich} 
                        placeholder="Bereich setzen" 
                        class="bulk-input-compact"
                        disabled={bulkUpdating || selectedBuchungen.size === 0}
                    />
                    
                    <!-- Soll Select -->
                    <select 
                        bind:value={bulkSoll} 
                        class="bulk-select-compact"
                        disabled={bulkUpdating || selectedBuchungen.size === 0}
                    >
                        <option value="">Soll setzen</option>
                        {#each uniqueSoll as soll}
                            <option value={soll.toString()}>{soll} - {getAccountName(soll)}</option>
                        {/each}
                    </select>
                    
                    <!-- Haben Select -->
                    <select 
                        bind:value={bulkHaben} 
                        class="bulk-select-compact"
                        disabled={bulkUpdating || selectedBuchungen.size === 0}
                    >
                        <option value="">Haben setzen</option>
                        {#each uniqueHaben as haben}
                            <option value={haben.toString()}>{haben} - {getAccountName(haben)}</option>
                        {/each}
                    </select>
                    
                    <!-- SubSoll Select (shown when Soll is 2000 or 1100) -->
                    {#if bulkSoll === '2000'}
                        <select 
                            bind:value={bulkSubsoll} 
                            class="bulk-select-compact"
                            disabled={bulkUpdating || selectedBuchungen.size === 0}
                        >
                            <option value="">SubSoll (Kreditor)</option>
                            {#each data.kontos.filter(k => k.id >= 2001 && k.id <= 2099) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                    
                    {#if bulkSoll === '1100'}
                        <select 
                            bind:value={bulkSubsoll} 
                            class="bulk-select-compact"
                            disabled={bulkUpdating || selectedBuchungen.size === 0}
                        >
                            <option value="">SubSoll (Debitor)</option>
                            {#each data.kontos.filter(k => k.id >= 1101 && k.id <= 1199) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                    
                    <!-- SubHaben Select (shown when Haben is 2000 or 1100) -->
                    {#if bulkHaben === '2000'}
                        <select 
                            bind:value={bulkSubhaben} 
                            class="bulk-select-compact"
                            disabled={bulkUpdating || selectedBuchungen.size === 0}
                        >
                            <option value="">SubHaben (Kreditor)</option>
                            {#each data.kontos.filter(k => k.id >= 2001 && k.id <= 2099) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                    
                    {#if bulkHaben === '1100'}
                        <select 
                            bind:value={bulkSubhaben} 
                            class="bulk-select-compact"
                            disabled={bulkUpdating || selectedBuchungen.size === 0}
                        >
                            <option value="">SubHaben (Debitor)</option>
                            {#each data.kontos.filter(k => k.id >= 1101 && k.id <= 1199) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                </div>
                
                <button 
                    class="bulk-update-btn-compact" 
                    on:click={bulkUpdateFields}
                    disabled={bulkUpdating || (bulkKategorie.trim() === '' && bulkBereich.trim() === '' && bulkSoll === '' && bulkHaben === '' && bulkSubsoll === '' && bulkSubhaben === '') || selectedBuchungen.size === 0}
                    title={selectedBuchungen.size === 0 ? 'Wählen Sie Buchungen aus' : 'Felder für ausgewählte Buchungen setzen'}
                >
                    {bulkUpdating ? '⏳' : '✓'}
                </button>
            </div>

            <div class="filters">
                <input 
                    type="text" 
                    bind:value={textFilter} 
                    placeholder="Text filtern (Buchungstext, Originaltext & Kategorie)..." 
                    class="filter-input"
                    on:click={handleTextFilterClick}
                    on:input={handleTextFilterInput}
                />
                <div class="kategorie-filter">
                    <label class="checkbox-label">
                        <input 
                            type="checkbox" 
                            bind:checked={onlyEmptyKategorie}
                            class="filter-checkbox"
                            on:change={() => {
                                if (cookiesLoaded) saveFiltersToCookie();
                            }}
                        />
                        <span class="checkbox-text">Nur leere Kategorie</span>
                    </label>
                    
                    <label class="checkbox-label">
                        <input 
                            type="checkbox" 
                            bind:checked={onlyEmptyBereich}
                            class="filter-checkbox"
                            on:change={() => {
                                if (cookiesLoaded) saveFiltersToCookie();
                            }}
                        />
                        <span class="checkbox-text">Nur leerer Bereich</span>
                    </label>
                </div>
                
                <!-- Clear filters button (only show when filters are active) -->
                {#if textFilter || sollFilter || habenFilter || betragFrom || betragTo || onlyEmptyKategorie || onlyEmptyBereich}
                    <button 
                        class="clear-filters-btn" 
                        on:click={resetFilters}
                        title="Alle Filter zurücksetzen"
                    >
                        ✕
                    </button>
                {/if}

                <select bind:value={sollFilter} class="filter-select" on:change={() => {
                    if (cookiesLoaded) saveFiltersToCookie();
                }}>
                    <option value="">Alle Soll</option>
                    {#each uniqueSoll as soll}
                        <option value={soll.toString()}>{getAccountName(soll)}</option>
                    {/each}
                </select>
                <select bind:value={habenFilter} class="filter-select" on:change={() => {
                    if (cookiesLoaded) saveFiltersToCookie();
                }}>
                    <option value="">Alle Haben</option>
                    {#each uniqueHaben as haben}
                        <option value={haben.toString()}>{getAccountName(haben)}</option>
                    {/each}
                </select>
                <div class="betrag-filter">
                    <span class="filter-label">Betrag:</span>
                    <input 
                        type="number" 
                        bind:value={betragFrom} 
                        placeholder="von" 
                        class="filter-input betrag-input"
                        step="0.01"
                        on:input={() => {
                            if (cookiesLoaded) saveFiltersToCookie();
                        }}
                    />
                    <span class="filter-separator">bis</span>
                    <input 
                        type="number" 
                        bind:value={betragTo} 
                        placeholder="bis" 
                        class="filter-input betrag-input"
                        step="0.01"
                        on:input={() => {
                            if (cookiesLoaded) saveFiltersToCookie();
                        }}
                    />
                </div>
            </div>
        </div>
    </div>
    
    <div class="table-container">
        <table class="buchungen-table">
            <thead>
                <tr>
                    <th>
                        <input 
                            type="checkbox" 
                            checked={selectedBuchungen.size === filteredBuchungen.length && filteredBuchungen.length > 0}
                            on:change={toggleAll}
                            class="select-all-checkbox"
                        />
                    </th>
                    <th>Aktionen</th>
                    <th>Datum</th>
                    <th>Soll</th>
                    <th>Haben</th>
                    <th>Buchungstext</th>
                    <th>Kategorie</th>
                    <th>Bereich</th>
                    <th>Betrag</th>
                </tr>
            </thead>
            <tbody>
                {#each filteredBuchungen as buchung}
                    <tr class:recently-saved={savedRecordId === buchung.id}>
                        <td class="checkbox-cell">
                            <input 
                                type="checkbox" 
                                checked={selectedBuchungen.has(buchung.id)}
                                on:change={() => toggleSelection(buchung.id)}
                                class="row-checkbox"
                            />
                        </td>
                        <td class="actions">
                            <button class="edit-btn" on:click={() => startEdit(buchung)}>✏️</button>
                            <button class="copy-btn" on:click={() => copyBuchung(buchung)} title="Kopie erstellen">📋</button>
                        </td>
                        
                        <!-- Always in view mode now -->
                        <td>
                            {formatDate(buchung.datum)}
                            {#if buchung.assignedDocuments && buchung.assignedDocuments.length > 0}
                                <span class="document-indicator" title="{buchung.assignedDocuments.length} Dokument(e) zugeordnet">📎</span>
                            {/if}
                        </td>
                        <td>{buchung.soll}</td>
                        <td>{buchung.haben}</td>
                        <td class="buchungstext">{buchung.buchungstext}</td>
                        <td class="kategorie">{buchung.kategorie || '-'}</td>
                        <td class="bereich">{buchung.bereich || '-'}</td>
                        <td class="betrag">{formatCurrency(buchung.betrag)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        
        {#if filteredBuchungen.length === 0}
            <div class="no-results">
                Keine Buchungen gefunden, die den Filterkriterien entsprechen.
            </div>
        {/if}
    </div>
</div>

<!-- Edit Modal -->
{#if showEditModal && editingBuchung}
    <div class="modal-overlay" on:click={handleCancelEdit} role="button" tabindex="-1" on:keydown={(e) => e.key === 'Escape' && handleCancelEdit()}>
        <div class="modal-content" on:click|stopPropagation role="dialog" tabindex="-1">
            <div class="modal-header">
                <h3>Buchung bearbeiten</h3>
                <button class="modal-close" on:click={handleCancelEdit}>✕</button>
            </div>
            
            <div class="modal-body-grid">
                <!-- Left Column: Edit Form with BuchungEditForm Component -->
                <div class="edit-form-section">
                    <BuchungEditForm 
                        buchung={editingBuchung}
                        kontoNames={data.kontos}
                        {uniqueSoll}
                        {uniqueHaben}
                        {saving}
                        on:cancel={handleCancelEdit}
                        on:save={handleSaveEdit}
                    />
                        
                        <!-- Uploaded/Assigned Documents Section -->
                        {#if uploadedFiles.length > 0}
                        <div class="file-upload-section">
                            <div class="upload-header">
                                <div class="documents-header">
                                    <h4>Hochgeladene Dokumente ({uploadedFiles.length})</h4>
                                </div>
                            </div>
                            
                            <div class="upload-content">
                                <div class="uploaded-files-area">
                                    <div class="uploaded-files-list">
                                        {#each uploadedFiles as file}
                                        <div 
                                            class="uploaded-file-item assigned" 
                                            class:selected={currentDocument && currentDocument.key === file.key}
                                            on:click={() => viewDocument(file)}
                                            role="button"
                                            tabindex="0"
                                            on:keydown={(e) => e.key === 'Enter' && viewDocument(file)}
                                        >
                                            <div class="file-info">
                                                <span class="file-icon">✅ {getFileIcon(file.fileType)}</span>
                                                <div class="file-details">
                                                    <div class="file-name" title={file.fileName}>
                                                        {file.fileName}
                                                        <span class="assigned-badge">zugeordnet</span>
                                                        {#if currentDocument && currentDocument.key === file.key}
                                                            <span class="selected-indicator">●</span>
                                                        {/if}
                                                    </div>
                                                    <div class="file-meta">
                                                        {formatFileSize(file.size)} • {new Date(file.lastModified).toLocaleDateString('de-DE')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="file-actions">
                                                <button 
                                                    type="button" 
                                                    class="view-btn" 
                                                    on:click|stopPropagation={() => viewDocument(file)}
                                                    title="Dokument anzeigen"
                                                >
                                                    👁️
                                                </button>
                                                {#if fileInDeleteMode === file.key}
                                                    <div class="delete-confirm-buttons">
                                                        <button 
                                                            type="button" 
                                                            class="delete-cancel-btn" 
                                                            on:click|stopPropagation={cancelDelete}
                                                        >
                                                            ✕
                                                        </button>
                                                        <button 
                                                            type="button" 
                                                            class="delete-confirm-btn" 
                                                            on:click|stopPropagation={() => confirmDeleteDocument(file)}
                                                        >
                                                            ✓
                                                        </button>
                                                    </div>
                                                {:else}
                                                    <button 
                                                        type="button" 
                                                        class="delete-btn" 
                                                        on:click|stopPropagation={() => startDeleteMode(file)}
                                                        title="Dokument löschen"
                                                    >
                                                        🗑️
                                                    </button>
                                                {/if}
                                            </div>
                                        </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/if}
                        
                        <!-- Matching Documents Section -->
                        <div class="file-upload-section">
                            <div class="upload-header">
                                <div class="documents-header">
                                    <div class="documents-title-row">
                                        <h4>Passende Dokumente ({matchingDocuments.length})</h4>
                                        <label class="checkbox-label">
                                            <input 
                                                type="checkbox" 
                                                bind:checked={showAllUnassigned}
                                                class="show-all-checkbox"
                                            />
                                            <span>Alle nicht zugeordneten anzeigen</span>
                                        </label>
                                    </div>
                                    <div class="documents-header-actions">
                                        <span class="match-info">
                                            Betrag: {formatCurrency(editingBuchung?.betrag || 0)}
                                        </span>
                                        {#if currentDocument && matchingDocuments.length > 0 && matchingDocuments.some(doc => doc.key === currentDocument.key)}
                                            <button 
                                                type="button"
                                                class="assign-btn"
                                                on:click={assignDocumentToBuchung}
                                                title="Gewähltes Dokument der Buchung zuordnen"
                                            >
                                                📎 Zuordnen
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="upload-content">
                                <div class="uploaded-files-area">
                                    {#if matchingDocuments.length > 0}
                                        <div class="uploaded-files-list">
                                            {#each matchingDocuments as file}
                                            <div 
                                                class="uploaded-file-item" 
                                                class:selected={currentDocument && currentDocument.key === file.key}
                                                on:click={() => viewDocument(file)}
                                                role="button"
                                                tabindex="0"
                                                on:keydown={(e) => e.key === 'Enter' && viewDocument(file)}
                                            >
                                                <div class="file-info">
                                                    <span class="file-icon">{getFileIconWithStatus(file.fileType, file.fileName)}</span>
                                                    <div class="file-details">
                                                        <div class="file-name" title={file.fileName}>
                                                            {file.fileName}
                                                            {#if currentDocument && currentDocument.key === file.key}
                                                                <span class="selected-indicator">●</span>
                                                            {/if}
                                                        </div>
                                                        <div class="file-meta">
                                                            {formatFileSize(file.size)} • {new Date(file.lastModified).toLocaleDateString('de-DE')}
                                                            <!-- Show extracted amount -->
                                                            {#if extractAmountFromFilename(file.fileName)}
                                                                • {formatCurrency(extractAmountFromFilename(file.fileName))}
                                                            {/if}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {/each}
                                        </div>
                                    {:else}
                                        <div class="no-files">
                                            <span>Keine passenden Dokumente gefunden</span>
                                            <div class="no-files-hint">
                                                Dokumente müssen den Betrag {formatCurrency(editingBuchung?.betrag || 0)} im Dateinamen enthalten
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right Column: Document Display -->
                    <div class="document-display-area">
                        {#if currentDocument}
                            <div class="document-preview">
                                <div class="document-preview-header">
                                    <div class="document-title-section">
                                        <h4>{currentDocument.fileName}</h4>
                                        <div class="rename-section">
                                            <input 
                                                type="text" 
                                                class="rename-input"
                                                bind:value={renamePartner}
                                                placeholder="Partner"
                                                disabled={renaming}
                                                on:keydown={handleRenameKeydown}
                                            />
                                            <input 
                                                type="date" 
                                                class="rename-date-input"
                                                bind:value={renameDate}
                                                disabled={renaming}
                                                title="Datum"
                                                on:keydown={handleRenameKeydown}
                                            />
                                            <input 
                                                type="number" 
                                                class="rename-amount-input"
                                                bind:value={renameAmount}
                                                placeholder="Betrag"
                                                step="0.01"
                                                disabled={renaming}
                                                title="Betrag"
                                                on:keydown={handleRenameKeydown}
                                            />
                                            <button 
                                                type="button"
                                                class="save-rename-btn"
                                                on:click={renameDocument}
                                                disabled={renaming || !renamePartner.trim()}
                                                title="Dateiname speichern"
                                            >
                                                {renaming ? '⏳' : '💾'}
                                            </button>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        class="close-document-btn"
                                        on:click={() => currentDocument = null}
                                        title="Dokument schließen"
                                    >
                                        ✕
                                    </button>
                                </div>
                                
                                <div class="document-preview-body">
                                    {#if currentDocument.fileType.startsWith('image/')}
                                        <img 
                                            src={currentDocument.signedUrl} 
                                            alt={currentDocument.fileName}
                                            class="preview-image"
                                        />
                                    {:else if currentDocument.fileType === 'application/pdf'}
                                        <iframe 
                                            src={currentDocument.signedUrl}
                                            class="preview-iframe"
                                            title={currentDocument.fileName}
                                        ></iframe>
                                    {:else}
                                        <div class="document-download-preview">
                                            <div class="download-info">
                                                <span class="file-icon-large">{getFileIconWithStatus(currentDocument.fileType, currentDocument.fileName)}</span>
                                                <p>Dieser Dateityp kann nicht in der Vorschau angezeigt werden.</p>
                                                <a 
                                                    href={currentDocument.signedUrl}
                                                    target="_blank"
                                                    class="download-link"
                                                >
                                                    Datei herunterladen
                                                </a>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                                
                                <div class="document-preview-footer">
                                    <div class="document-info">
                                        <span>Größe: {formatFileSize(currentDocument.size)}</span>
                                        <span>Hochgeladen: {new Date(currentDocument.lastModified).toLocaleString('de-DE')}</span>
                                    </div>
                                    <a 
                                        href={currentDocument.signedUrl}
                                        target="_blank"
                                        class="open-new-tab-btn"
                                    >
                                        In neuem Tab öffnen
                                    </a>
                                </div>
                            </div>
                        {:else}
                            <div class="document-placeholder">
                                <div class="placeholder-content">
                                    {#if loadingFiles}
                                        <div class="placeholder-icon">⏳</div>
                                        <h3>Laden...</h3>
                                        <p>Dokumente werden geladen...</p>
                                    {:else if uploadedFiles.length === 0}
                                        <div class="placeholder-icon">📄</div>
                                        <h3>Keine Dokumente</h3>
                                        <p>Für diese Buchung sind noch keine Dokumente hochgeladen.</p>
                                        <p class="placeholder-hint">Laden Sie Dateien über den Bereich links hoch, um sie hier anzuzeigen.</p>
                                    {:else}
                                        <div class="placeholder-icon">📄</div>
                                        <h3>Dokumentvorschau</h3>
                                        <p>Wählen Sie ein Dokument aus der Liste aus, um es hier anzuzeigen.</p>
                                        <p class="placeholder-hint">Klicken Sie auf das Augen-Symbol 👁️ neben einem Dokument in der Liste.</p>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
        </div>
    </div>
{/if}

<!-- Document Viewer Popup -->
{#if showDocumentViewer && currentDocument}
    <div class="document-viewer-overlay" on:click={closeDocumentViewer}>
        <div class="document-viewer-content" on:click|stopPropagation>
            <div class="document-viewer-header">
                <h3>{currentDocument.fileName}</h3>
                <button class="viewer-close" on:click={closeDocumentViewer}>✕</button>
            </div>
            
            <div class="document-viewer-body">
                {#if currentDocument.fileType.startsWith('image/')}
                    <img 
                        src={currentDocument.signedUrl} 
                        alt={currentDocument.fileName}
                        class="document-image"
                    />
                {:else if currentDocument.fileType === 'application/pdf'}
                    <iframe 
                        src={currentDocument.signedUrl}
                        class="document-iframe"
                        title={currentDocument.fileName}
                    ></iframe>
                {:else}
                    <div class="document-download">
                        <div class="download-info">
                            <span class="file-icon-large">{getFileIconWithStatus(currentDocument.fileType, currentDocument.fileName)}</span>
                            <p>Dieser Dateityp kann nicht in der Vorschau angezeigt werden.</p>
                            <a 
                                href={currentDocument.signedUrl}
                                target="_blank"
                                class="download-link"
                            >
                                Datei herunterladen
                            </a>
                        </div>
                    </div>
                {/if}
            </div>
            
            <div class="document-viewer-footer">
                <div class="document-info">
                    <span>Größe: {formatFileSize(currentDocument.size)}</span>
                    <span>Hochgeladen: {new Date(currentDocument.lastModified).toLocaleString('de-DE')}</span>
                </div>
                <a 
                    href={currentDocument.signedUrl}
                    target="_blank"
                    class="open-new-tab-btn"
                >
                    In neuem Tab öffnen
                </a>
            </div>
        </div>
    </div>
{/if}

<style>
    .page-container {
        height: calc(100vh - 1rem);
        max-height: calc(100vh - 170px);
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        box-sizing: border-box;
        overflow: hidden;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.25rem;
        flex-shrink: 0;
        gap: 0.5rem;
        max-height: 15vh; /* Make header even more compact */
        overflow: visible;
    }

    h1 {
        color: #1f2937;
        margin: 0;
        flex-shrink: 0;
    }

    .controls {
        display: flex;
        gap: 1rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .filters {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .bulk-update-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        background: #f0f9ff;
        border: 1px solid #0ea5e9;
        border-radius: 0.375rem;
        padding: 0.5rem;
        font-size: 0.875rem;
        order: -1; /* Move to the left */
        flex-wrap: wrap;
    }

    .bulk-inputs {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .bulk-input-compact {
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        min-width: 120px;
        background: white;
        transition: all 0.2s;
    }

    .bulk-input-compact:focus:not(:disabled) {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .bulk-input-compact:disabled {
        background: #f9fafb;
        color: #9ca3af;
        cursor: not-allowed;
    }

    .bulk-select-compact {
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        min-width: 140px;
        background: white;
        transition: all 0.2s;
        cursor: pointer;
    }

    .bulk-select-compact:focus:not(:disabled) {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .bulk-select-compact:disabled {
        background: #f9fafb;
        color: #9ca3af;
        cursor: not-allowed;
    }

    .bulk-info-compact {
        font-weight: 500;
        color: #0c4a6e;
        white-space: nowrap;
    }

    .bulk-update-btn-compact {
        background: #0ea5e9;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
        transition: background-color 0.2s;
        min-width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .bulk-update-btn-compact:hover:not(:disabled) {
        background: #0284c7;
    }

    .bulk-update-btn-compact:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .filter-input {
        padding: 0.375rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        min-width: 180px;
        background: white;
    }

    .filter-input:focus {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .filter-select {
        padding: 0.375rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        background: white;
        min-width: 110px;
    }

    .filter-select:focus {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .betrag-filter {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        background: #f9fafb;
        padding: 0.375rem;
        border-radius: 0.25rem;
        border: 1px solid #e5e7eb;
    }

    .filter-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
    }

    .filter-separator {
        font-size: 0.875rem;
        color: #6b7280;
        white-space: nowrap;
    }

    .betrag-input {
        min-width: 80px;
        width: 80px;
    }

    .table-container {
        flex: 1;
        min-height: 0; /* Allow flex item to shrink */
        max-height: 85vh; /* More space for table since filters are smaller */
        overflow: auto;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        background: white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .buchungen-table {
        width: 100%;
        border-collapse: collapse;
        font-family: system-ui, -apple-system, sans-serif;
    }

    .buchungen-table th,
    .buchungen-table td {
        padding: 0.5rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }

    .buchungen-table th {
        background-color: #f9fafb;
        font-weight: 600;
        color: #374151;
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .buchungen-table tr:hover {
        background-color: #f9fafb;
    }

    .buchungstext {
        max-width: 600px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .betrag {
        text-align: right;
        font-weight: 500;
    }

    .checkbox-cell {
        width: 35px;
        text-align: center;
        padding: 0.25rem;
    }

    .select-all-checkbox,
    .row-checkbox {
        cursor: pointer;
        transform: scale(1.1);
    }



    .actions {
        width: 80px;
        text-align: center;
    }

    .edit-btn, .copy-btn {
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        transition: background-color 0.2s;
    }

    .edit-btn:hover {
        background: #2563eb;
    }

    .copy-btn {
        background: #8b5cf6;
        margin-left: 0.25rem;
    }

    .copy-btn:hover {
        background: #7c3aed;
    }

    .edit-actions {
        display: flex;
        gap: 0.25rem;
        justify-content: center;
    }

    .save-btn {
        background: #10b981;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: bold;
        transition: background-color 0.2s;
    }

    .save-btn:hover {
        background: #059669;
    }

    .save-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .cancel-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .cancel-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: bold;
        transition: background-color 0.2s;
    }

    .cancel-btn:hover {
        background: #dc2626;
    }

    .edit-input {
        width: 100%;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        background: white;
    }

    .edit-input:focus {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .edit-select {
        width: 100%;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        background: white;
    }

    .edit-select:focus {
        outline: none;
        box-shadow: 0 0 0 2px #3b82f6;
        border-color: #3b82f6;
    }

    .date-input {
        min-width: 120px;
    }

    .text-input {
        min-width: 200px;
    }

    .kategorie-input {
        min-width: 120px;
    }

    .kategorie {
        max-width: 120px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #6b7280;
        font-style: italic;
    }

    .betrag-edit-input {
        min-width: 100px;
        text-align: right;
    }

    .buchungen-table tr.editing {
        background-color: #fef3c7;
    }

    .buchungen-table tr.editing:hover {
        background-color: #fef3c7;
    }

    .buchungen-table tr.recently-saved {
        background-color: #d1fae5;
        animation: fadeToNormal 2s ease-out;
    }

    @keyframes fadeToNormal {
        0% {
            background-color: #10b981;
            color: white;
        }
        25% {
            background-color: #34d399;
        }
        100% {
            background-color: #d1fae5;
        }
    }

    .no-results {
        padding: 2rem;
        text-align: center;
        color: #6b7280;
        font-style: italic;
    }

    @media (max-width: 768px) {
        .header {
            flex-direction: column;
            align-items: stretch;
        }

        .controls {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }

        .bulk-category-controls {
            order: 0; /* Reset order on mobile */
            justify-content: center;
        }

        .filters {
            justify-content: center;
            flex-wrap: wrap;
        }

        .filter-input {
            min-width: auto;
            flex: 1;
        }

        .betrag-filter {
            flex-wrap: wrap;
        }

        .betrag-input {
            min-width: 60px;
            width: 60px;
        }

        .kategorie-filter {
            justify-content: center;
        }

        .bulk-category-input-compact {
            flex: 1;
            min-width: 120px;
        }
    }

    .kategorie-filter {
        display: flex;
        align-items: center;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        padding: 0.375rem;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        cursor: pointer;
        margin: 0;
        font-size: 0.8rem;
    }

    .filter-checkbox {
        cursor: pointer;
        transform: scale(1.1);
    }

    .checkbox-text {
        color: #374151;
        font-weight: 500;
        white-space: nowrap;
        user-select: none;
    }

    .clear-filters-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        padding: 0.25rem;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: bold;
        transition: background-color 0.2s;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .clear-filters-btn:hover {
        background: #dc2626;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
    }

    .modal-content {
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        width: 95vw;
        max-width: 1600px;
        height: 90vh;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 1.5rem 0 1.5rem;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 1.5rem;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    }

    .modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
        padding: 0.25rem;
        line-height: 1;
        border-radius: 0.25rem;
    }

    .modal-close:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .modal-form {
        padding: 0 1.5rem 1.5rem 1.5rem;
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    .form-group.full-width {
        grid-column: 1 / -1;
    }

    .form-group label {
        font-weight: 500;
        color: #374151;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
    }

    .modal-input,
    .modal-select {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: white;
    }

    .modal-input:focus,
    .modal-select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    .modal-actions .cancel-btn {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .modal-actions .cancel-btn:hover:not(:disabled) {
        background: #e5e7eb;
    }

    .modal-actions .save-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
        font-weight: 500;
    }

    .modal-actions .save-btn:hover:not(:disabled) {
        background: #2563eb;
    }

    .modal-actions .save-btn:disabled,
    .modal-actions .cancel-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    @media (max-width: 768px) {
        .form-grid {
            grid-template-columns: 1fr;
        }
        
        .modal-content {
            margin: 0.5rem;
        }
        
        .modal-header {
            padding: 1rem 1rem 0 1rem;
            margin-bottom: 1rem;
        }
        
        .modal-form {
            padding: 0 1rem 1rem 1rem;
        }
    }




    /* Modal Body Grid Layout */
    .modal-body-grid {
        display: grid;
        grid-template-columns: 770px 1fr;
        gap: 2rem;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }

    .edit-form-section {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding-left: 1rem;
        padding-right: 0.5rem;
        max-width: 100%;
    }

    .edit-upload-section {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding-right: 0.5rem;
        max-width: 100%;
    }

    /* A4 Document Display Area */
    .document-display-area {
        border-left: 3px solid #3b82f6;
        padding-left: 1rem;
        padding-right: 0.5rem;
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: #eff6ff;
    }

    .document-placeholder {
        flex: 1;
        border: 3px solid #ef4444;
        border-radius: 0.5rem;
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        background: #fef2f2;
        padding: 2rem;
        /* A4 aspect ratio: width 210mm x height 297mm ≈ 1:1.414 */
        min-height: calc(70vh * 1.414);
        max-height: 85vh;
    }

    .placeholder-content {
        text-align: left;
        color: #374151;
        width: 100%;
    }

    .placeholder-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
        opacity: 0.6;
    }

    .placeholder-content p {
        margin: 0.25rem 0;
        font-size: 1rem;
        font-weight: 500;
    }

    .placeholder-subtitle {
        font-size: 0.875rem !important;
        font-weight: 400 !important;
        color: #6b7280 !important;
    }

    .placeholder-hint {
        font-style: italic;
        color: #9ca3af !important;
    }

    /* Document Preview Styles */
    .document-preview {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        background: white;
        border-radius: 0.5rem;
        overflow: hidden;
        border: 1px solid #e5e7eb;
    }

    .document-preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #f8fafc;
        border-bottom: 1px solid #e5e7eb;
    }

    .document-preview-header h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .document-title-section {
        flex: 1;
        min-width: 0;
    }

    .rename-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
        flex-wrap: wrap;
    }

    .rename-input {
        flex: 2;
        min-width: 120px;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        background: white;
        transition: border-color 0.15s ease;
    }

    .rename-date-input {
        flex: 1;
        min-width: 100px;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        background: white;
        transition: border-color 0.15s ease;
    }

    .rename-amount-input {
        flex: 1;
        min-width: 80px;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        background: white;
        transition: border-color 0.15s ease;
    }

    .rename-input:focus,
    .rename-date-input:focus,
    .rename-amount-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 1px #3b82f6;
    }

    .rename-input:disabled,
    .rename-date-input:disabled,
    .rename-amount-input:disabled {
        background: #f3f4f6;
        color: #6b7280;
        cursor: not-allowed;
    }

    .save-rename-btn {
        background: #16a34a;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        cursor: pointer;
        transition: background-color 0.15s ease;
        min-width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .save-rename-btn:hover:not(:disabled) {
        background: #15803d;
    }

    .save-rename-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .close-document-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: #6b7280;
        font-size: 1rem;
        line-height: 1;
        border-radius: 0.25rem;
        transition: all 0.15s ease;
    }

    .close-document-btn:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .document-preview-body {
        flex: 1;
        overflow: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafafa;
    }

    .preview-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 0.25rem;
    }

    .preview-iframe {
        width: 100%;
        height: 100%;
        border: none;
        min-height: 500px;
    }

    .document-download-preview {
        text-align: center;
        padding: 2rem;
    }

    .document-download-preview .file-icon-large {
        font-size: 3rem;
        margin-bottom: 1rem;
        display: block;
    }

    .document-download-preview p {
        margin: 0 0 1rem 0;
        color: #6b7280;
    }

    .document-preview-footer {
        padding: 0.75rem 1rem;
        background: #f8fafc;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .document-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .open-new-tab-btn {
        background: #3b82f6;
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 0.375rem;
        text-decoration: none;
        font-size: 0.75rem;
        font-weight: 500;
        transition: background-color 0.15s ease;
    }

    .open-new-tab-btn:hover {
        background: #2563eb;
        text-decoration: none;
    }

    /* File Upload Styles */
    .file-upload-section {
        margin-top: 1.5rem;
        padding: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    .file-upload-section h4 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: #374151;
        font-weight: 600;
    }

    .match-info {
        font-size: 0.875rem;
        color: #6b7280;
        font-weight: normal;
    }

    .no-files-hint {
        font-size: 0.8rem;
        color: #9ca3af;
        margin-top: 0.5rem;
        font-style: italic;
    }

    .file-drop-zone {
        border: 2px dashed #d1d5db;
        border-radius: 0.5rem;
        padding: 2rem;
        text-align: center;
        transition: all 0.3s ease;
        cursor: pointer;
        position: relative;
        background: #f9fafb;
    }

    .file-drop-zone:hover,
    .file-drop-zone.drag-over {
        border-color: #3b82f6;
        background: #eff6ff;
    }

    .drop-zone-content {
        pointer-events: none;
    }

    .drop-icon {
        font-size: 2rem;
        display: block;
        margin-bottom: 0.5rem;
    }

    .drop-zone-content p {
        margin: 0;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .file-input {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        pointer-events: all;
    }

    .selected-files {
        margin-top: 1rem;
    }

    .selected-files h5 {
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        color: #374151;
        font-weight: 600;
    }

    .files-list {
        max-height: 150px;
        overflow-y: auto;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
        background: white;
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #f3f4f6;
    }

    .file-item:last-child {
        border-bottom: none;
    }

    .file-name {
        flex: 1;
        font-size: 0.875rem;
        color: #374151;
        word-break: break-all;
    }

    .file-size {
        font-size: 0.75rem;
        color: #9ca3af;
        white-space: nowrap;
    }

    .remove-file-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 0.75rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
    }

    .remove-file-btn:hover:not(:disabled) {
        background: #dc2626;
    }

    .remove-file-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .upload-controls {
        margin-top: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .upload-btn {
        background: #059669;
        color: white;
        border: none;
        border-radius: 0.375rem;
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
        font-weight: 500;
    }

    .upload-btn:hover:not(:disabled) {
        background: #047857;
    }

    .upload-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .upload-progress {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .progress-bar {
        flex: 1;
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: #059669;
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: 0.75rem;
        color: #6b7280;
        font-weight: 500;
        white-space: nowrap;
    }

    /* Upload Section Layout */
    .upload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .upload-header h4 {
        margin: 0;
        font-size: 1rem;
        color: #374151;
        font-weight: 600;
    }

    .documents-header {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
    }

    .documents-title-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .documents-title-row h4 {
        margin: 0;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: #4b5563;
        cursor: pointer;
        user-select: none;
    }

    .show-all-checkbox {
        cursor: pointer;
        width: 16px;
        height: 16px;
    }

    .documents-header-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .assign-btn {
        background: #059669;
        color: white;
        border: none;
        border-radius: 0.375rem;
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .assign-btn:hover {
        background: #047857;
    }

    .assign-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .filter-toggle-btn {
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        color: #374151;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .filter-toggle-btn:hover {
        background: #e5e7eb;
        border-color: #9ca3af;
    }

    .upload-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .upload-zone-area {
        /* Existing upload styles apply here */
    }

    .uploaded-files-area {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.75rem;
        background: #f9fafb;
        max-height: 350px;
        overflow-y: auto;
    }

    .loading-files {
        text-align: center;
        color: #6b7280;
        font-style: italic;
        padding: 2rem;
    }

    .no-files {
        text-align: center;
        color: #9ca3af;
        font-style: italic;
        padding: 2rem;
    }

    .uploaded-files-list {
        max-height: 300px;
        overflow-y: auto;
    }

    .uploaded-file-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
        background: white;
        margin-bottom: 0.5rem;
        transition: all 0.2s;
        cursor: pointer;
        user-select: none;
    }

    .uploaded-file-item:hover {
        border-color: #3b82f6;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        background-color: #f8fafc;
    }

    .uploaded-file-item.selected {
        background-color: #dbeafe;
        border-color: #3b82f6;
        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
    }

    .uploaded-file-item.selected:hover {
        background-color: #bfdbfe;
    }

    .uploaded-file-item.selected .file-name {
        color: #1d4ed8;
        font-weight: 600;
    }

    .uploaded-file-item.selected .file-meta {
        color: #3730a3;
    }

    .uploaded-file-item.assigned {
        background-color: #f0f9ff;
        border-left: 4px solid #06b6d4;
    }

    .uploaded-file-item.assigned:hover {
        background-color: #e0f7fa;
    }

    .assigned-badge {
        background-color: #06b6d4;
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: 0.75rem;
        font-size: 0.75rem;
        font-weight: 500;
        margin-left: 0.5rem;
    }

    .file-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
        min-width: 0;
    }

    .file-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .file-details {
        flex: 1;
        min-width: 0;
    }

    .file-name {
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .selected-indicator {
        color: #3b82f6;
        font-size: 0.75rem;
        flex-shrink: 0;
    }

    .format-check-icon {
        margin-right: 0.25rem;
        font-size: 0.75rem;
        flex-shrink: 0;
    }

    .file-meta {
        font-size: 0.75rem;
        color: #6b7280;
        margin-top: 0.25rem;
    }

    .file-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .delete-file-btn {
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 0.875rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        flex-shrink: 0;
    }

    .delete-file-btn:hover {
        background: #b91c1c;
    }

    .confirm-delete-btn {
        background: #16a34a;
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        flex-shrink: 0;
    }

    .confirm-delete-btn:hover {
        background: #15803d;
    }

    .cancel-delete-btn {
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        flex-shrink: 0;
    }

    .cancel-delete-btn:hover {
        background: #4b5563;
    }

    /* Document Viewer Styles */
    .document-viewer-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        padding: 1rem;
    }

    .document-viewer-content {
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        width: 90vw;
        height: 90vh;
        max-width: 1200px;
        display: flex;
        flex-direction: column;
    }

    .document-viewer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #e5e7eb;
        flex-shrink: 0;
    }

    .document-viewer-header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: #1f2937;
        word-break: break-all;
    }

    .viewer-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
        padding: 0.25rem;
        line-height: 1;
        border-radius: 0.25rem;
    }

    .viewer-close:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .document-viewer-body {
        flex: 1;
        padding: 1rem;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .document-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 0.375rem;
    }

    .document-iframe {
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 0.375rem;
    }

    .document-download {
        text-align: center;
        padding: 2rem;
    }

    .download-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .file-icon-large {
        font-size: 4rem;
    }

    .download-info p {
        margin: 0;
        color: #6b7280;
    }

    .download-link {
        background: #3b82f6;
        color: white;
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 0.375rem;
        font-weight: 500;
        transition: background-color 0.2s;
    }

    .download-link:hover {
        background: #2563eb;
    }

    .document-viewer-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-top: 1px solid #e5e7eb;
        flex-shrink: 0;
        background: #f9fafb;
    }

    .document-info {
        display: flex;
        gap: 1rem;
        font-size: 0.875rem;
        color: #6b7280;
    }

    .open-new-tab-btn {
        background: #059669;
        color: white;
        text-decoration: none;
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        transition: background-color 0.2s;
    }

    .open-new-tab-btn:hover {
        background: #047857;
    }

    @media (max-width: 1200px) {
        .modal-body-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
        }
        
        .document-display-area {
            border-left: none;
            border-top: 1px solid #e5e7eb;
            padding-left: 0;
            padding-top: 1rem;
            margin-top: 1rem;
        }
        
        .document-placeholder {
            min-height: 400px;
            max-height: 500px;
        }
    }

    @media (max-width: 768px) {
        .modal-content {
            width: 98vw;
            height: 95vh;
        }
        
        .document-viewer-content {
            width: 95vw;
            height: 95vh;
        }
        
        .document-viewer-footer {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }
        
        .document-info {
            justify-content: center;
        }
        

    }

    /* Document indicator icon */
    .document-indicator {
        margin-left: 0.5rem;
        color: #28a745;
        font-size: 0.9em;
        cursor: help;
    }
</style>