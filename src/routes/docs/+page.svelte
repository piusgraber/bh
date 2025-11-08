<script lang="ts">
    import { onMount } from 'svelte';

    // File upload states
    let uploadFiles: File[] = [];
    let uploadedFiles: any[] = [];
    let uploading = false;
    let uploadProgress = 0;
    let loadingFiles = false;
    let dragOver = false;
    let currentDocument = null;
    let fileInDeleteMode = null;
    let renamePartner = '';
    let renameDate = '';
    let renameAmount = '';
    let renaming = false;
    let documentFilter = 'all'; // Filter: 'all', 'correct', 'incorrect', 'assigned', 'unassigned', 'irrelevant'
    let searchFilter = ''; // Search filter for filename
    
    // Irrelevant docs metadata
    let irrelevantDocsMetadata: any[] = [];
    let metadataPartner = '';
    let metadataDate = '';
    let metadataAmount = '';
    let savingMetadata = false;

    // Helper function to check if a document is assigned to a buchung
    function isAssignedDocument(file: any): boolean {
        // Documents in docs/ folder with ID prefix are assigned
        // Documents in uldocs/ folder are unassigned
        return file.key && file.key.startsWith('docs/');
    }

    // Filtered uploaded files based on format status and search
    $: filteredUploadedFiles = uploadedFiles.filter(file => {
        // First apply format filter
        let formatMatch = true;
        
        if (documentFilter === 'correct') {
            // Correct: correctly formatted, not assigned, not irrelevant
            formatMatch = isCorrectFormat(file.fileName) && !isAssignedDocument(file) && !file.isIrrelevant;
        } else if (documentFilter === 'incorrect') {
            // Incorrect: incorrectly formatted, not assigned, not irrelevant
            formatMatch = !isCorrectFormat(file.fileName) && !isAssignedDocument(file) && !file.isIrrelevant;
        } else if (documentFilter === 'assigned') {
            // Assigned: only assigned documents, not irrelevant
            formatMatch = isAssignedDocument(file) && !file.isIrrelevant;
        } else if (documentFilter === 'unassigned') {
            // Unassigned: not assigned, not irrelevant
            formatMatch = !isAssignedDocument(file) && !file.isIrrelevant;
        } else if (documentFilter === 'irrelevant') {
            // Irrelevant: only irrelevant documents
            formatMatch = file.isIrrelevant === true;
        }
        // 'all' shows everything (formatMatch stays true)
        
        // Then apply search filter
        let searchMatch = true;
        if (searchFilter.trim()) {
            searchMatch = file.fileName.toLowerCase().includes(searchFilter.toLowerCase());
        }
        
        return formatMatch && searchMatch;
    });

    // Helper function to select the first filtered document
    function selectFirstFilteredDocument() {
        // Recalculate filtered files to ensure we have the current filter state
        const currentFilteredFiles = uploadedFiles.filter(file => {
            // Apply format filter
            let formatMatch = true;
            
            if (documentFilter === 'correct') {
                // Correct: correctly formatted, not assigned, not irrelevant
                formatMatch = isCorrectFormat(file.fileName) && !isAssignedDocument(file) && !file.isIrrelevant;
            } else if (documentFilter === 'incorrect') {
                // Incorrect: incorrectly formatted, not assigned, not irrelevant
                formatMatch = !isCorrectFormat(file.fileName) && !isAssignedDocument(file) && !file.isIrrelevant;
            } else if (documentFilter === 'assigned') {
                // Assigned: only assigned documents, not irrelevant
                formatMatch = isAssignedDocument(file) && !file.isIrrelevant;
            } else if (documentFilter === 'unassigned') {
                // Unassigned: not assigned, not irrelevant
                formatMatch = !isAssignedDocument(file) && !file.isIrrelevant;
            } else if (documentFilter === 'irrelevant') {
                // Irrelevant: only irrelevant documents
                formatMatch = file.isIrrelevant === true;
            }
            // 'all' shows everything (formatMatch stays true)
            
            // Apply search filter
            let searchMatch = true;
            if (searchFilter.trim()) {
                searchMatch = file.fileName.toLowerCase().includes(searchFilter.toLowerCase());
            }
            
            return formatMatch && searchMatch;
        });
        
        if (currentFilteredFiles.length > 0) {
            currentDocument = currentFilteredFiles[0];
        } else {
            currentDocument = null;
        }
    }

    // Function to cycle through filter states
    function toggleDocumentFilter() {
        if (documentFilter === 'all') {
            documentFilter = 'correct';
        } else if (documentFilter === 'correct') {
            documentFilter = 'incorrect';
        } else if (documentFilter === 'incorrect') {
            documentFilter = 'assigned';
        } else if (documentFilter === 'assigned') {
            documentFilter = 'unassigned';
        } else if (documentFilter === 'unassigned') {
            documentFilter = 'irrelevant';
        } else {
            documentFilter = 'all';
        }
        // Always select the first filtered document after toggle
        selectFirstFilteredDocument();
    }

    // Reactive filter button content
    $: filterButtonContent = (() => {
        switch (documentFilter) {
            case 'all': return { icon: '📄', text: 'Alle', title: 'Alle Dokumente anzeigen' };
            case 'correct': return { icon: '✅', text: 'Korrekt', title: 'Korrekt formatierte, nicht zugeordnete Dokumente' };
            case 'incorrect': return { icon: '❌', text: 'Fehlerhaft', title: 'Fehlerhaft formatierte, nicht zugeordnete Dokumente' };
            case 'assigned': return { icon: '📎', text: 'Zugeordnet', title: 'Zugeordnete Dokumente' };
            case 'unassigned': return { icon: '📋', text: 'Nicht zugeordnet', title: 'Nicht zugeordnete Dokumente' };
            case 'irrelevant': return { icon: '🗑️', text: 'Irrelevant', title: 'Als irrelevant markierte Dokumente' };
            default: return { icon: '📄', text: 'Alle', title: 'Alle Dokumente anzeigen' };
        }
    })();

    // File handling functions
    function handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files) {
            const newFiles = Array.from(target.files);
            uploadFiles = [...uploadFiles, ...newFiles];
        }
    }

    function handleFileDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
        
        if (event.dataTransfer?.files) {
            const newFiles = Array.from(event.dataTransfer.files);
            uploadFiles = [...uploadFiles, ...newFiles];
        }
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        dragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
    }

    function removeFile(index: number) {
        uploadFiles = uploadFiles.filter((_, i) => i !== index);
    }

    // Upload files to S3
    async function uploadFilesToS3() {
        if (uploadFiles.length === 0) return;
        
        uploading = true;
        uploadProgress = 0;
        
        try {
            const totalFiles = uploadFiles.length;
            let completedFiles = 0;
            
            for (const file of uploadFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('folder', 'uldocs'); // Use uldocs folder
                
                const response = await fetch('/api/docs/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`Upload failed for ${file.name}: ${response.statusText}`);
                }
                
                completedFiles++;
                uploadProgress = Math.round((completedFiles / totalFiles) * 100);
            }
            
            // Clear uploaded files and refresh the list
            uploadFiles = [];
            await loadUploadedFiles();
            
            console.log('All files uploaded successfully');
            
        } catch (err) {
            console.error('Upload error:', err);
            alert(`Upload failed: ${err.message}`);
        } finally {
            uploading = false;
            uploadProgress = 0;
        }
    }

    // Load all uploaded documents
    async function loadUploadedFiles() {
        loadingFiles = true;
        currentDocument = null;
        fileInDeleteMode = null;
        
        try {
            const response = await fetch('/api/docs/upload');
            if (!response.ok) {
                throw new Error(`Failed to load files: ${response.statusText}`);
            }
            
            const result = await response.json();
            uploadedFiles = result.data?.files || [];
            console.log(`Loaded ${uploadedFiles.length} documents`);
            
            // Merge with irrelevant docs metadata
            mergeIrrelevantMetadata();
            
            // Auto-display first document if available
            if (uploadedFiles.length > 0) {
                currentDocument = uploadedFiles[0];
            }
            
        } catch (err) {
            console.error('Error loading uploaded files:', err);
            uploadedFiles = [];
        } finally {
            loadingFiles = false;
        }
    }
    
    // Load irrelevant docs metadata with sync
    async function loadIrrelevantDocsMetadata() {
        try {
            // Call with sync parameter to sync with S3
            const response = await fetch('/api/irrelevant-docs?sync=true');
            if (!response.ok) {
                throw new Error(`Failed to load metadata: ${response.statusText}`);
            }
            
            const result = await response.json();
            irrelevantDocsMetadata = result.data || [];
            
            if (result.synced && result.syncResult) {
                console.log(`Synced with S3: ${result.syncResult.added} added, ${result.syncResult.removed} removed`);
            }
            console.log(`Loaded ${irrelevantDocsMetadata.length} irrelevant docs metadata entries`);
            
            // Merge with uploaded files
            mergeIrrelevantMetadata();
            
        } catch (err) {
            console.error('Error loading irrelevant docs metadata:', err);
            irrelevantDocsMetadata = [];
        }
    }
    
    // Merge metadata with uploaded files
    function mergeIrrelevantMetadata() {
        uploadedFiles = uploadedFiles.map(file => {
            if (file.isIrrelevant) {
                const metadata = irrelevantDocsMetadata.find(m => m.docname === file.fileName);
                if (metadata) {
                    return {
                        ...file,
                        metadataPartner: metadata.partner || '',
                        metadataDate: metadata.datum || '',
                        metadataAmount: metadata.betrag || ''
                    };
                }
            }
            return file;
        });
    }
    
    // Save metadata for irrelevant document
    async function saveMetadata() {
        if (!currentDocument || !currentDocument.isIrrelevant) return;
        
        savingMetadata = true;
        
        try {
            const response = await fetch('/api/irrelevant-docs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    docname: currentDocument.fileName,
                    partner: metadataPartner,
                    datum: metadataDate,
                    betrag: metadataAmount
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save metadata: ${response.statusText}`);
            }
            
            console.log('Metadata saved successfully');
            
            // Update local metadata cache
            await loadIrrelevantDocsMetadata();
            
        } catch (err) {
            console.error('Error saving metadata:', err);
            alert(`Fehler beim Speichern der Metadaten: ${err.message}`);
        } finally {
            savingMetadata = false;
        }
    }
    
    // Reactive: populate metadata fields when currentDocument changes
    $: if (currentDocument && currentDocument.isIrrelevant) {
        metadataPartner = currentDocument.metadataPartner || '';
        metadataDate = currentDocument.metadataDate || '';
        metadataAmount = currentDocument.metadataAmount || '';
    }
    
    // Create buchung from document
    async function createBuchungFromDocument(file: any) {
        try {
            // Extract data from filename or metadata
            let buchungstext = '';
            let datum = '';
            let betrag = 0;
            
            if (file.isIrrelevant && file.metadataPartner) {
                // Use metadata if available
                buchungstext = file.metadataPartner;
                datum = file.metadataDate || new Date().toISOString().split('T')[0];
                betrag = parseFloat(file.metadataAmount) || 0;
            } else {
                // Parse from filename: Partner_YYYYMMDD_amount.ext
                const fileName = file.fileName.replace(/\.[^/.]+$/, ''); // Remove extension
                const parts = fileName.split('_');
                
                if (parts.length >= 3) {
                    buchungstext = parts[0];
                    
                    // Parse date
                    const dateStr = parts[1];
                    if (dateStr.length === 8) {
                        // Format YYYYMMDD
                        datum = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
                    } else {
                        datum = new Date().toISOString().split('T')[0];
                    }
                    
                    // Parse amount
                    betrag = parseFloat(parts[2]) || 0;
                } else {
                    // Fallback: use filename as text
                    buchungstext = fileName;
                    datum = new Date().toISOString().split('T')[0];
                    betrag = 0;
                }
            }
            
            // Get max ID from existing buchungen
            const buchungenResponse = await fetch('/api/buchungen');
            const buchungenData = await buchungenResponse.json();
            const maxId = Math.max(...buchungenData.data.map((b: any) => b.id || 0), 0);
            
            // Create new buchung
            const newBuchung = {
                id: maxId + 1,
                datum: datum,
                soll: '9999',
                haben: '2000',
                buchungstext: buchungstext,
                betrag: betrag,
                originaltext: null,
                sollkd: null,
                wer: null,
                was: null,
                classifier: null,
                testfield: null,
                subkonto: 0,
                class: null,
                sollSaldo: 0,
                habenSaldo: 0,
                kategorie: 'irrelevant',
                datestr: datum,
                subsoll: null,
                subhaben: null
            };
            
            // Save buchung
            const response = await fetch('/api/buchungen', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newBuchung)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create buchung: ${response.statusText}`);
            }
            
            console.log('Created buchung:', newBuchung);
            
            // If document is in irrelevant folder, move it to docs and assign it
            if (file.isIrrelevant) {
                try {
                    // Use the assignment API to move from irrelevant/ to docs/
                    const assignResponse = await fetch('/api/upload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            action: 'assign',
                            fileKey: file.key,
                            buchungId: newBuchung.id.toString(),
                            fileName: file.fileName
                        })
                    });
                    
                    if (!assignResponse.ok) {
                        throw new Error(`Failed to assign document: ${assignResponse.statusText}`);
                    }
                    
                    console.log('Document assigned to buchung');
                    
                    // Reload the uploaded files to reflect the changes
                    await loadUploadedFiles();
                    
                } catch (assignErr) {
                    console.error('Error assigning document:', assignErr);
                    alert(`Buchung erstellt, aber Fehler beim Zuordnen des Dokuments: ${assignErr.message}`);
                    return;
                }
            }
            
            alert(`Buchung erstellt und Dokument zugeordnet:\n${buchungstext}\nDatum: ${datum}\nBetrag: ${betrag}`);
            
        } catch (err) {
            console.error('Error creating buchung:', err);
            alert(`Fehler beim Erstellen der Buchung: ${err.message}`);
        }
    }

    // Document viewing functions
    function viewDocument(file: any) {
        currentDocument = file;
    }

    // Delete functions
    function startDeleteMode(file: any) {
        fileInDeleteMode = file.key;
    }

    function cancelDelete() {
        fileInDeleteMode = null;
    }

    async function confirmDeleteDocument(file: any) {
        try {
            const response = await fetch('/api/docs/upload', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fileKey: file.key })
            });

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.statusText}`);
            }

            // Remove from uploadedFiles array
            uploadedFiles = uploadedFiles.filter(f => f.key !== file.key);
            
            // Always select the first file in the filtered list after delete
            selectFirstFilteredDocument();

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
            const response = await fetch('/api/docs/upload/rename', {
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

            // Always select the first filtered document after rename
            selectFirstFilteredDocument();

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
        if (file) {
            const baseFileName = file.fileName.substring(0, file.fileName.lastIndexOf('.') || file.fileName.length);
            const decomposed = decomposeFilename(baseFileName);
            
            renamePartner = decomposed.partner;
            renameDate = decomposed.date;
            renameAmount = decomposed.amount;
        } else {
            renamePartner = '';
            renameDate = new Date().toISOString().split('T')[0]; // Today's date
            renameAmount = '';
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

        // Default date and empty amount for unrecognized patterns
        date = new Date().toISOString().split('T')[0]; // Today's date
        amount = '';

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

    // Utility functions
    function getFileIcon(fileType: string) {
        if (fileType.startsWith('image/')) return '🖼️';
        if (fileType === 'application/pdf') return '📄';
        if (fileType.includes('word')) return '📝';
        if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
        if (fileType.includes('text')) return '📃';
        return '📁';
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

    function formatFileSize(bytes: number) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Load files on component mount
    onMount(async () => {
        await loadIrrelevantDocsMetadata();
        await loadUploadedFiles();
    });
</script>

<svelte:head>
    <title>Dokumente - Document Management</title>
</svelte:head>

<div class="docs-container">
    <div class="docs-header">
        <h1>Dokumente</h1>
        <p>Verwalten Sie Ihre Dokumente zentral an einem Ort</p>
    </div>

    <div class="docs-content">
        <!-- Left Column: Upload and File List -->
        <div class="docs-left-column">
            <!-- Upload Section -->
            <div class="upload-section">
                <h2>Dateien hochladen</h2>
                
                <!-- Drop Zone -->
                <div 
                    class="file-drop-zone" 
                    class:drag-over={dragOver}
                    on:drop={handleFileDrop}
                    on:dragover={handleDragOver}
                    on:dragleave={handleDragLeave}
                >
                    <div class="drop-zone-content">
                        <span class="drop-icon">📁</span>
                        <p>Dateien hier hineinziehen oder klicken zum Auswählen</p>
                        <input 
                            type="file" 
                            multiple 
                            class="file-input"
                            on:change={handleFileSelect}
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                        />
                    </div>
                </div>

                <!-- Selected Files List -->
                {#if uploadFiles.length > 0}
                    <div class="selected-files">
                        <h3>Ausgewählte Dateien ({uploadFiles.length})</h3>
                        <div class="files-list">
                            {#each uploadFiles as file, index}
                                <div class="file-item">
                                    <span class="file-name">{file.name}</span>
                                    <span class="file-size">({Math.round(file.size / 1024)} KB)</span>
                                    <button 
                                        type="button"
                                        class="remove-file-btn"
                                        on:click={() => removeFile(index)}
                                        disabled={uploading}
                                    >
                                        ✕
                                    </button>
                                </div>
                            {/each}
                        </div>
                        
                        <!-- Upload Button and Progress -->
                        <div class="upload-controls">
                            <button 
                                type="button"
                                class="upload-btn"
                                on:click={uploadFilesToS3}
                                disabled={uploading || uploadFiles.length === 0}
                            >
                                {uploading ? 'Hochladen...' : 'Dateien hochladen'}
                            </button>
                            
                            {#if uploading}
                                <div class="upload-progress">
                                    <div class="progress-bar">
                                        <div 
                                            class="progress-fill" 
                                            style="width: {uploadProgress}%"
                                        ></div>
                                    </div>
                                    <span class="progress-text">{uploadProgress}%</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Uploaded Files List -->
            <div class="uploaded-files-section">
                <div class="section-header">
                    <!-- Filter and Search Controls -->
                    <div class="filter-controls">
                        <input 
                            type="text" 
                            bind:value={searchFilter}
                            placeholder="Dateiname suchen..."
                            class="search-input"
                            on:input={selectFirstFilteredDocument}
                        />
                        <button 
                            type="button"
                            class="filter-toggle-btn"
                            on:click={toggleDocumentFilter}
                            title={filterButtonContent.title}
                        >
                            {filterButtonContent.icon} {filterButtonContent.text}
                        </button>
                    </div>
                    <div class="documents-header">
                        <h2>Dokumente ({filteredUploadedFiles.length}/{uploadedFiles.length})</h2>
                    </div>
                </div>
                
                {#if loadingFiles}
                    <div class="loading-files">
                        <span>Lade Dokumente...</span>
                    </div>
                {:else if uploadedFiles.length > 0}
                    {#if filteredUploadedFiles.length > 0}
                        <div class="uploaded-files-list">
                            {#each filteredUploadedFiles as file}
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
                                        </div>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    {#if fileInDeleteMode === file.key}
                                        <!-- Delete confirmation buttons -->
                                        <button 
                                            type="button"
                                            class="cancel-delete-btn"
                                            on:click|stopPropagation={cancelDelete}
                                            title="Löschen abbrechen"
                                        >
                                            ✕
                                        </button>
                                        <button 
                                            type="button"
                                            class="confirm-delete-btn"
                                            on:click|stopPropagation={() => confirmDeleteDocument(file)}
                                            title="Löschen bestätigen"
                                        >
                                            ✓
                                        </button>
                                    {:else}
                                        <!-- Action buttons -->
                                        <button 
                                            type="button"
                                            class="create-buchung-btn"
                                            on:click|stopPropagation={() => createBuchungFromDocument(file)}
                                            title="Buchung erstellen"
                                        >
                                            📝
                                        </button>
                                        <button 
                                            type="button"
                                            class="delete-file-btn"
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
                    {:else}
                        <div class="no-files">
                            <span>Keine Dokumente entsprechen dem aktuellen Filter</span>
                        </div>
                    {/if}
                {:else}
                    <div class="no-files">
                        <span>Keine Dokumente vorhanden</span>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Right Column: Document Preview -->
        <div class="docs-right-column">
            <div class="document-display-area">
                {#if currentDocument}
                    <div class="document-preview">
                        <div class="document-preview-header">
                            <div class="document-title-section">
                                <h3>{currentDocument.fileName}</h3>
                                {#if currentDocument.isIrrelevant}
                                    <!-- Metadata fields for irrelevant documents -->
                                    <div class="metadata-section">
                                        <input 
                                            type="text" 
                                            class="metadata-input"
                                            bind:value={metadataPartner}
                                            placeholder="Partner"
                                            disabled={savingMetadata}
                                            on:blur={saveMetadata}
                                        />
                                        <input 
                                            type="date" 
                                            class="metadata-date-input"
                                            bind:value={metadataDate}
                                            disabled={savingMetadata}
                                            title="Datum"
                                            on:blur={saveMetadata}
                                        />
                                        <input 
                                            type="number" 
                                            class="metadata-amount-input"
                                            bind:value={metadataAmount}
                                            placeholder="Betrag"
                                            step="0.01"
                                            disabled={savingMetadata}
                                            title="Betrag"
                                            on:blur={saveMetadata}
                                        />
                                        <button 
                                            type="button"
                                            class="save-metadata-btn"
                                            on:click={saveMetadata}
                                            disabled={savingMetadata}
                                            title="Metadaten speichern"
                                        >
                                            {savingMetadata ? '⏳' : '💾'}
                                        </button>
                                    </div>
                                {:else}
                                    <!-- Rename section for regular documents -->
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
                                {/if}
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
                                <p>Es sind noch keine Dokumente hochgeladen.</p>
                                <p class="placeholder-hint">Laden Sie Dateien über den Bereich links hoch, um sie hier anzuzeigen.</p>
                            {:else}
                                <div class="placeholder-icon">📄</div>
                                <h3>Dokumentvorschau</h3>
                                <p>Wählen Sie ein Dokument aus der Liste aus, um es hier anzuzeigen.</p>
                                <p class="placeholder-hint">Klicken Sie auf ein Dokument in der Liste.</p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .docs-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem;
        max-height: calc(100vh - 170px);
    }

    .docs-header {
        text-align: center;
        margin-bottom: 3rem;
    }

    .docs-header h1 {
        font-size: 2.5rem;
        color: #1f2937;
        margin: 0 0 0.5rem 0;
    }

    .docs-header p {
        color: #6b7280;
        font-size: 1.125rem;
        margin: 0;
    }

    .docs-content {
        display: grid;
        grid-template-columns: 500px 1fr;
        gap: 2rem;
        min-height: 700px;
    }

    .docs-left-column {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .docs-right-column {
        border-left: 3px solid #3b82f6;
        padding-left: 2rem;
        background: #eff6ff;
        border-radius: 0.5rem;
    }

    /* Upload Section */
    .upload-section {
        background: white;
        border-radius: 0.5rem;
        padding: 1.5rem;
        border: 1px solid #e5e7eb;
    }

    .upload-section h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: #374151;
    }

    /* File Drop Zone */
    .file-drop-zone {
        border: 2px dashed #d1d5db;
        border-radius: 0.5rem;
        padding: 2rem;
        text-align: center;
        background: #fafafa;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
    }

    .file-drop-zone:hover,
    .file-drop-zone.drag-over {
        border-color: #3b82f6;
        background: #eff6ff;
    }

    .drop-zone-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .drop-icon {
        font-size: 2rem;
        opacity: 0.6;
    }

    .drop-zone-content p {
        margin: 0;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .file-input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
    }

    /* Selected Files */
    .selected-files {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    .selected-files h3 {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        color: #374151;
    }

    .files-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: #f9fafb;
        border-radius: 0.375rem;
        font-size: 0.875rem;
    }

    .file-name {
        flex: 1;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .file-size {
        color: #6b7280;
        font-size: 0.75rem;
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
    }

    .remove-file-btn:hover {
        background: #dc2626;
    }

    .remove-file-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Upload Controls */
    .upload-controls {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .upload-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 0.375rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .upload-btn:hover:not(:disabled) {
        background: #2563eb;
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
        height: 6px;
        background: #e5e7eb;
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: #3b82f6;
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: 0.75rem;
        font-weight: 500;
        color: #374151;
        min-width: 35px;
    }

    /* Uploaded Files Section */
    .uploaded-files-section {
        background: white;
        border-radius: 0.5rem;
        padding: 1.5rem;
        border: 1px solid #e5e7eb;
        flex: 1;
    }

    .section-header h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: #374151;
    }

    .documents-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .documents-header h2 {
        margin: 0;
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

    .filter-controls {
        display: flex;
        gap: 1rem;
        align-items: center;
        margin-bottom: 1rem;
    }

    .search-input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        background: white;
        transition: border-color 0.2s ease;
    }

    .search-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .loading-files {
        text-align: center;
        padding: 2rem;
        color: #6b7280;
    }

    .no-files {
        text-align: center;
        padding: 2rem;
        color: #6b7280;
    }

    .uploaded-files-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 380px;
        overflow-y: auto;
    }

    /* Uploaded File Item */
    .uploaded-file-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
        background: white;
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

    .uploaded-file-item .file-name {
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

    .create-buchung-btn {
        background: #3b82f6;
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

    .create-buchung-btn:hover {
        background: #2563eb;
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

    /* Document Display Area */
    .document-display-area {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: #eff6ff;
        padding: 1.5rem;
        border-radius: 0.5rem;
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

    .placeholder-hint {
        font-style: italic;
        color: #9ca3af !important;
    }

    /* Document Preview */
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

    .document-preview-header h3 {
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

    .rename-section,
    .metadata-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
        flex-wrap: wrap;
    }

    .rename-input,
    .metadata-input {
        flex: 2;
        min-width: 120px;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        background: white;
        transition: border-color 0.15s ease;
    }

    .rename-date-input,
    .metadata-date-input {
        flex: 1;
        min-width: 100px;
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        background: white;
        transition: border-color 0.15s ease;
    }

    .rename-amount-input,
    .metadata-amount-input {
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
    .rename-amount-input:focus,
    .metadata-input:focus,
    .metadata-date-input:focus,
    .metadata-amount-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 1px #3b82f6;
    }

    .rename-input:disabled,
    .rename-date-input:disabled,
    .rename-amount-input:disabled,
    .metadata-input:disabled,
    .metadata-date-input:disabled,
    .metadata-amount-input:disabled {
        background: #f3f4f6;
        color: #6b7280;
        cursor: not-allowed;
    }

    .save-rename-btn,
    .save-metadata-btn {
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

    .save-rename-btn:hover:not(:disabled),
    .save-metadata-btn:hover:not(:disabled) {
        background: #15803d;
    }

    .save-rename-btn:disabled,
    .save-metadata-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }
    
    .metadata-section {
        background: #fef3c7;
        padding: 0.5rem;
        border-radius: 0.375rem;
        border: 1px solid #fbbf24;
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

    .download-link {
        background: #3b82f6;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        text-decoration: none;
        font-weight: 500;
        transition: background-color 0.15s ease;
    }

    .download-link:hover {
        background: #2563eb;
        text-decoration: none;
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

    /* Responsive */
    @media (max-width: 1024px) {
        .docs-content {
            grid-template-columns: 1fr;
            gap: 1rem;
        }
        
        .docs-right-column {
            border-left: none;
            border-top: 3px solid #3b82f6;
            padding-left: 0;
            padding-top: 1rem;
        }
    }
</style>