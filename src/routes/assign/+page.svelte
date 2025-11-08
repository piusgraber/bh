<script lang="ts">
    import { onMount } from 'svelte';

    let unassignedDocs: any[] = [];
    let matchingBuchungen: any[] = [];
    let allBuchungen: any[] = [];
    let selectedDoc: any = null;
    let selectedBuchung: any = null;
    let loading = false;
    let assigning = false;

    async function loadUnassignedDocs() {
        loading = true;
        try {
            const response = await fetch('/api/docs');
            if (!response.ok) throw new Error('Failed to load documents');
            
            const result = await response.json();
            const allDocs = result.data?.files || [];
            
            unassignedDocs = allDocs
                .filter((doc: any) => doc.key.startsWith('uldocs/'))
                .sort((a: any, b: any) => a.fileName.localeCompare(b.fileName));
            
            console.log(`Loaded ${unassignedDocs.length} unassigned documents`);
            
            if (unassignedDocs.length > 0) {
                selectDocument(unassignedDocs[0]);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        } finally {
            loading = false;
        }
    }

    async function loadBuchungen() {
        try {
            const response = await fetch('/api/buchungen');
            if (!response.ok) throw new Error('Failed to load buchungen');
            
            const result = await response.json();
            allBuchungen = result.data || [];
            console.log(`Loaded ${allBuchungen.length} buchungen`);
        } catch (error) {
            console.error('Error loading buchungen:', error);
        }
    }

    function extractAmountFromFilename(fileName: string): number | null {
        const match = fileName.match(/_([\d.]+)\.pdf$/i);
        if (match) {
            return parseFloat(match[1]);
        }
        return null;
    }

    function selectDocument(doc: any) {
        selectedDoc = doc;
        selectedBuchung = null;
        
        const docAmount = extractAmountFromFilename(doc.fileName);
        console.log(`Selected document: ${doc.fileName}, extracted amount: ${docAmount}`);
        
        if (docAmount !== null) {
            matchingBuchungen = allBuchungen
                .filter((buchung: any) => 
                    Math.abs(Math.abs(buchung.betrag) - docAmount) < 0.01
                )
                .sort((a: any, b: any) => new Date(b.datum).getTime() - new Date(a.datum).getTime());
            
            console.log(`Found ${matchingBuchungen.length} matching buchungen`);
            
            if (matchingBuchungen.length > 0) {
                selectedBuchung = matchingBuchungen[0];
            }
        } else {
            matchingBuchungen = [];
        }
    }

    async function markDocAsIrrelevant(docKey: string, event: Event) {
        event.stopPropagation(); // Prevent selecting the document
        
        try {
            // Move document to irrelevant folder via API
            const response = await fetch('/api/docs', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: docKey,
                    action: 'move-to-irrelevant'
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`Moved document ${docKey} to irrelevant folder`);
                
                // Remove from unassigned docs list
                unassignedDocs = unassignedDocs.filter(doc => doc.key !== docKey);
                
                // If the marked doc was selected, select the next one
                if (selectedDoc && selectedDoc.key === docKey) {
                    if (unassignedDocs.length > 0) {
                        selectDocument(unassignedDocs[0]);
                    } else {
                        selectedDoc = null;
                        selectedBuchung = null;
                        matchingBuchungen = [];
                    }
                }
            } else {
                console.error('Failed to move document:', result.error);
                alert('Fehler beim Verschieben des Dokuments: ' + result.error);
            }
        } catch (error) {
            console.error('Error moving document:', error);
            alert('Fehler beim Verschieben des Dokuments');
        }
    }

    async function assignDocument() {
        if (!selectedDoc || !selectedBuchung) {
            alert('Bitte wählen Sie ein Dokument und eine Buchung aus.');
            return;
        }

        assigning = true;
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'assign',
                    fileKey: selectedDoc.key,
                    buchungId: selectedBuchung.id,
                    fileName: selectedDoc.fileName
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Assignment failed: ${error}`);
            }

            console.log('Document assigned successfully');
            
            await loadUnassignedDocs();
            
        } catch (error) {
            console.error('Error assigning document:', error);
            alert(`Fehler beim Zuordnen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        } finally {
            assigning = false;
        }
    }

    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    }

    function formatDate(dateStr: string): string {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('de-CH');
        } catch {
            return dateStr;
        }
    }

    onMount(() => {
        loadBuchungen();
        loadUnassignedDocs();
    });
</script>

<div class="assign-container">
    <h1>Dokumente zuordnen</h1>
    
    <div class="layout">
        <div class="left-panel">
            <div class="unassigned-docs">
                <h2>Nicht zugeordnete Dokumente ({unassignedDocs.length})</h2>
                {#if loading}
                    <div class="loading">Laden...</div>
                {:else if unassignedDocs.length === 0}
                    <div class="empty">Keine nicht zugeordneten Dokumente gefunden.</div>
                {:else}
                    <div class="doc-list">
                        {#each unassignedDocs as doc}
                            <div 
                                class="doc-item"
                                class:selected={selectedDoc && selectedDoc.key === doc.key}
                                role="button"
                                tabindex="0"
                                on:click={() => selectDocument(doc)}
                                on:keypress={(e) => e.key === 'Enter' && selectDocument(doc)}
                            >
                                <button 
                                    class="irrelevant-btn"
                                    on:click={(e) => markDocAsIrrelevant(doc.key, e)}
                                    title="Als nicht relevant markieren"
                                    type="button"
                                >
                                    ✕
                                </button>
                                <span class="doc-icon">📄</span>
                                <span class="doc-name">{doc.fileName}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <div class="matching-buchungen">
                <h2>
                    Passende Buchungen 
                    {#if selectedDoc}
                        ({matchingBuchungen.length})
                    {/if}
                </h2>
                {#if !selectedDoc}
                    <div class="empty">Wählen Sie ein Dokument aus.</div>
                {:else if matchingBuchungen.length === 0}
                    <div class="empty">Keine passenden Buchungen gefunden.</div>
                {:else}
                    <div class="buchung-list">
                        {#each matchingBuchungen as buchung}
                            <div 
                                class="buchung-item"
                                class:selected={selectedBuchung && selectedBuchung.id === buchung.id}
                                class:has-documents={buchung.assignedDocuments && buchung.assignedDocuments.length > 0}
                                role="button"
                                tabindex="0"
                                on:click={() => selectedBuchung = buchung}
                                on:keypress={(e) => e.key === 'Enter' && (selectedBuchung = buchung)}
                            >
                                <div class="buchung-header">
                                    <span class="buchung-date">{formatDate(buchung.datum)}</span>
                                    <span class="buchung-amount">
                                        {formatCurrency(buchung.betrag)}
                                        {#if buchung.assignedDocuments && buchung.assignedDocuments.length > 0}
                                            <span class="doc-indicator" title="{buchung.assignedDocuments.length} Dokument(e) zugeordnet">📎</span>
                                        {/if}
                                    </span>
                                </div>
                                <div class="buchung-text">{buchung.buchungstext}</div>
                                <div class="buchung-accounts">
                                    <span>Soll: {buchung.soll}</span>
                                    <span>Haben: {buchung.haben}</span>
                                </div>
                            </div>
                        {/each}
                    </div>
                    
                    {#if selectedBuchung}
                        <div class="action-bar">
                            <button 
                                class="assign-btn"
                                on:click={assignDocument}
                                disabled={assigning}
                            >
                                {#if assigning}
                                    Zuordne...
                                {:else}
                                     Dokument zuordnen
                                {/if}
                            </button>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>

        <!-- Middle Panel: Buchung Details -->
        <div class="middle-panel">
            <h2>Ausgewählte Buchung</h2>
            {#if selectedBuchung}
                <div class="buchung-details">
                    <div class="detail-row">
                        <span class="detail-label">Datum:</span>
                        <span class="detail-value">{formatDate(selectedBuchung.datum)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Betrag:</span>
                        <span class="detail-value amount-value">{formatCurrency(selectedBuchung.betrag)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Buchungstext:</span>
                        <span class="detail-value">{selectedBuchung.buchungstext}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Soll:</span>
                        <span class="detail-value">{selectedBuchung.soll}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Haben:</span>
                        <span class="detail-value">{selectedBuchung.haben}</span>
                    </div>
                    {#if selectedBuchung.kategorie}
                        <div class="detail-row">
                            <span class="detail-label">Kategorie:</span>
                            <span class="detail-value">{selectedBuchung.kategorie}</span>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="empty">Wählen Sie eine Buchung aus.</div>
            {/if}
        </div>

        <!-- Right Panel: Document Preview -->
        <div class="right-panel">
            <h2>Dokument-Vorschau</h2>
            {#if selectedDoc}
                <div class="preview-container">
                    <div class="preview-header">
                        <h3>{selectedDoc.fileName}</h3>
                    </div>
                    <iframe
                        src={selectedDoc.signedUrl}
                        title="Document Preview"
                        class="document-iframe"
                    ></iframe>
                </div>
            {:else}
                <div class="empty-preview">
                    <p>Wählen Sie ein Dokument aus, um es anzuzeigen.</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .assign-container {
        padding: 1rem;
        height: calc(100vh - 17rem);
        display: flex;
        flex-direction: column;
    }

    h1 {
        margin: 0 0 1rem 0;
        color: #333;
    }

    .layout {
        display: grid;
        grid-template-columns: 400px 600px 1fr;
        gap: 1rem;
        flex: 1;
        overflow: hidden;
    }

    .left-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow: hidden;
    }

    .middle-panel {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }

    .unassigned-docs,
    .matching-buchungen {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .unassigned-docs {
        flex: 1;
        min-height: 0;
    }

    .matching-buchungen {
        flex: 1;
        min-height: 0;
    }

    h2 {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        color: #555;
        border-bottom: 2px solid #007acc;
        padding-bottom: 0.5rem;
    }

    .loading,
    .empty {
        color: #999;
        text-align: center;
        padding: 2rem;
        font-style: italic;
    }

    .doc-list,
    .buchung-list {
        padding: 0;
        margin: 0;
        overflow-y: auto;
        flex: 1;
    }

    .doc-item,
    .buchung-item {
        padding: 0.75rem;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        border: 1px solid #eee;
        transition: all 0.2s;
    }

    .doc-item {
        position: relative;
    }

    .buchung-item {
        position: relative;
    }

    .doc-item:hover,
    .buchung-item:hover {
        background: #f5f5f5;
        border-color: #007acc;
    }

    .doc-item.selected,
    .buchung-item.selected {
        background: #e3f2fd;
        border-color: #007acc;
    }

    .buchung-item.has-documents {
        border-left: 3px solid #28a745;
    }

    .doc-indicator {
        margin-left: 0.5rem;
        font-size: 0.9rem;
        color: #28a745;
    }

    .irrelevant-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: bold;
        transition: all 0.2s;
        opacity: 0;
        z-index: 10;
    }

    .doc-item:hover .irrelevant-btn {
        opacity: 1;
    }

    .irrelevant-btn:hover {
        background: #c82333;
        transform: scale(1.1);
    }

    .irrelevant-btn:active {
        transform: scale(0.95);
    }

    .doc-icon {
        margin-right: 0.5rem;
    }

    .doc-name {
        font-size: 0.9rem;
        word-break: break-all;
    }

    .buchung-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.25rem;
        font-weight: 600;
    }

    .buchung-date {
        color: #666;
        font-size: 0.85rem;
    }

    .buchung-amount {
        color: #007acc;
        font-size: 0.9rem;
    }

    .buchung-text {
        font-size: 0.85rem;
        color: #333;
        margin-bottom: 0.25rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .buchung-accounts {
        font-size: 0.75rem;
        color: #999;
        display: flex;
        gap: 1rem;
    }

    .action-bar {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #eee;
    }

    .assign-btn {
        width: 100%;
        padding: 0.75rem;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 600;
        transition: background 0.2s;
    }

    .assign-btn:hover:not(:disabled) {
        background: #005fa3;
    }

    .assign-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .right-panel {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .preview-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .preview-header {
        margin-bottom: 0.75rem;
    }

    .preview-header h3 {
        margin: 0;
        font-size: 0.95rem;
        color: #333;
        word-break: break-all;
    }

    .document-iframe {
        width: 100%;
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    .empty-preview {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-style: italic;
    }

    .buchung-details {
        background: #f8f9fa;
        border-radius: 6px;
        padding: 1rem;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #e0e0e0;
    }

    .detail-row:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
    }

    .detail-label {
        font-weight: 600;
        color: #666;
        font-size: 0.9rem;
    }

    .detail-value {
        color: #333;
        font-size: 0.9rem;
        text-align: right;
        flex: 1;
        margin-left: 1rem;
    }

    .amount-value {
        color: #007acc;
        font-weight: 600;
        font-size: 1rem;
    }

    @media (max-width: 1600px) {
        .layout {
            grid-template-columns: 350px 500px 1fr;
        }
    }

    @media (max-width: 1200px) {
        .layout {
            grid-template-columns: 300px 400px 1fr;
        }
    }

    @media (max-width: 1024px) {
        .layout {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto 1fr;
        }
        
        .middle-panel {
            max-height: 400px;
        }
    }
</style>
