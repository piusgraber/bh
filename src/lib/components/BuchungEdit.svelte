<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let buchung: {
        id: number;
        datum: string;
        soll: number;
        haben: number;
        buchungstext: string;
        betrag: number;
        kategorie?: string;
        bereich?: string;
        subsoll?: number;
        subhaben?: number;
        originaltext?: string | null;
        assignedDocuments?: Array<{
            newKey: string;
            fileName: string;
            fileType?: string;
        }>;
    };
    export let kontoNames: Array<{
        id: number;
        name: string;
        kategorie: string;
        klasse: string;
    }>;
    export let uniqueSoll: number[];
    export let uniqueHaben: number[];
    export let showGegenbuchung: boolean = false;
    export let saving: boolean = false;

    let editData: any = {};
    let selectedDocIndex: number = 0;
    let documentUrl: string | null = null;

    // Format date for input field (YYYY-MM-DD)
    function formatDateForInput(dateStr: string): string {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Initialize edit data when component mounts or buchung changes
    $: {
        editData = {
            datum: formatDateForInput(buchung.datum),
            buchungstext: buchung.buchungstext,
            betrag: buchung.betrag.toString(),
            soll: buchung.soll.toString(),
            haben: buchung.haben.toString(),
            kategorie: buchung.kategorie || '',
            bereich: buchung.bereich || '',
            subsoll: buchung.subsoll?.toString() || '',
            subhaben: buchung.subhaben?.toString() || ''
        };
    }

    // Function to get account name by id
    function getAccountName(accountId: number): string {
        const konto = kontoNames.find(k => k.id === accountId);
        return konto ? konto.name : '';
    }

    // Check if the Soll account is Verbindlichkeiten
    $: isVerbindlichkeiten = editData.soll ? 
        kontoNames.find(k => k.id === parseInt(editData.soll))?.kategorie === 'Verbindlichkeiten' : 
        false;

    // Clear subsoll when soll is not 2000 or 1100
    $: if (editData.soll && editData.soll !== '2000' && editData.soll !== '1100' && editData.subsoll) {
        editData.subsoll = undefined;
    }

    // Clear subhaben when haben is not 2000 or 1100
    $: if (editData.haben && editData.haben !== '2000' && editData.haben !== '1100' && editData.subhaben) {
        editData.subhaben = undefined;
    }

    function handleCancel() {
        dispatch('cancel');
    }

    function handleSave() {
        dispatch('save', {
            id: buchung.id,
            datum: editData.datum,
            buchungstext: editData.buchungstext,
            betrag: parseFloat(editData.betrag),
            soll: parseInt(editData.soll),
            haben: parseInt(editData.haben),
            kategorie: editData.kategorie || undefined,
            bereich: editData.bereich || undefined,
            subsoll: editData.subsoll ? parseInt(editData.subsoll) : undefined,
            subhaben: editData.subhaben ? parseInt(editData.subhaben) : undefined
        });
    }

    function handleGegenbuchung() {
        dispatch('gegenbuchung');
    }

    function handleOverlayClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleCancel();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleCancel();
        }
    }

    // Load document URL when a document is selected
    async function loadDocumentUrl(docKey: string) {
        try {
            // Fetch all documents and find the one with matching key
            const response = await fetch('/api/docs');
            if (!response.ok) {
                throw new Error('Failed to load documents');
            }
            const data = await response.json();
            const doc = data.data.files.find((f: any) => f.key === docKey);
            if (doc) {
                documentUrl = doc.signedUrl;
            } else {
                console.error('Document not found:', docKey);
                documentUrl = null;
            }
        } catch (error) {
            console.error('Error loading document:', error);
            documentUrl = null;
        }
    }

    // Load first document when component mounts
    $: if (buchung.assignedDocuments && buchung.assignedDocuments.length > 0) {
        loadDocumentUrl(buchung.assignedDocuments[selectedDocIndex].newKey);
    }

    // Reload when selected document changes
    $: if (buchung.assignedDocuments && buchung.assignedDocuments[selectedDocIndex]) {
        loadDocumentUrl(buchung.assignedDocuments[selectedDocIndex].newKey);
    }

    function getFileIcon(fileType: string): string {
        if (fileType?.startsWith('image/')) return '🖼️';
        if (fileType === 'application/pdf') return '📄';
        return '📎';
    }
</script>

<div class="modal-overlay" on:click={handleOverlayClick} role="button" tabindex="-1" on:keydown={handleKeydown}>
    <div class="modal-content" on:click|stopPropagation role="dialog" tabindex="-1">
        <div class="modal-header">
            <h3>Buchung bearbeiten</h3>
            <button class="modal-close" on:click={handleCancel}>✕</button>
        </div>
        
        <div class="modal-body">
            <form class="modal-form" on:submit|preventDefault={handleSave}>
            <div class="form-grid">
                <div class="form-group">
                    <label for="edit-datum">Datum</label>
                    <input 
                        id="edit-datum"
                        type="date" 
                        bind:value={editData.datum} 
                        class="modal-input"
                        required
                    />
                </div>
                
                <div class="form-group">
                    <label for="edit-betrag">Betrag</label>
                    <input 
                        id="edit-betrag"
                        type="number" 
                        bind:value={editData.betrag} 
                        class="modal-input"
                        step="0.01"
                        required
                    />
                </div>
                
                <div class="form-group">
                    <label for="edit-soll">Soll</label>
                    <select 
                        id="edit-soll"
                        bind:value={editData.soll} 
                        class="modal-select"
                        required
                    >
                        {#each uniqueSoll as soll}
                            <option value={soll.toString()}>{soll} - {getAccountName(soll)}</option>
                        {/each}
                    </select>
                    
                    {#if editData.soll === '2000'}
                        <select 
                            id="edit-subsoll"
                            bind:value={editData.subsoll} 
                            class="modal-select"
                            style="margin-top: 0.5rem;"
                        >
                            <option value="">-- Kein SubSoll --</option>
                            {#each kontoNames.filter(k => k.id >= 2001 && k.id <= 2099) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                    
                    {#if editData.soll === '1100'}
                        <select 
                            id="edit-subsoll"
                            bind:value={editData.subsoll} 
                            class="modal-select"
                            style="margin-top: 0.5rem;"
                        >
                            <option value="">-- Kein SubSoll --</option>
                            {#each kontoNames.filter(k => k.id >= 1101 && k.id <= 1199) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                </div>
                
                <div class="form-group">
                    <label for="edit-haben">Haben</label>
                    <select 
                        id="edit-haben"
                        bind:value={editData.haben} 
                        class="modal-select"
                        required
                    >
                        {#each uniqueHaben as haben}
                            <option value={haben.toString()}>{haben} - {getAccountName(haben)}</option>
                        {/each}
                    </select>
                    
                    {#if editData.haben === '2000'}
                        <select 
                            id="edit-subhaben"
                            bind:value={editData.subhaben} 
                            class="modal-select"
                            style="margin-top: 0.5rem;"
                        >
                            <option value="">-- Kein SubHaben --</option>
                            {#each kontoNames.filter(k => k.id >= 2001 && k.id <= 2099) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                    
                    {#if editData.haben === '1100'}
                        <select 
                            id="edit-subhaben"
                            bind:value={editData.subhaben} 
                            class="modal-select"
                            style="margin-top: 0.5rem;"
                        >
                            <option value="">-- Kein SubHaben --</option>
                            {#each kontoNames.filter(k => k.id >= 1101 && k.id <= 1199) as konto}
                                <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                            {/each}
                        </select>
                    {/if}
                </div>
                
                <div class="form-group full-width">
                    <label for="edit-buchungstext">Buchungstext</label>
                    <input 
                        id="edit-buchungstext"
                        type="text" 
                        bind:value={editData.buchungstext} 
                        class="modal-input"
                        required
                    />
                </div>
                
                {#if buchung.originaltext && buchung.originaltext !== buchung.buchungstext}
                <div class="form-group full-width">
                    <label for="edit-originaltext">Originaltext</label>
                    <textarea 
                        id="edit-originaltext"
                        bind:value={buchung.originaltext} 
                        class="modal-textarea"
                        disabled
                        rows="3"
                    ></textarea>
                </div>
                {/if}
                
                <div class="form-group">
                    <label for="edit-kategorie">Kategorie</label>
                    <input 
                        id="edit-kategorie"
                        type="text" 
                        bind:value={editData.kategorie} 
                        class="modal-input"
                        placeholder="Kategorie"
                    />
                </div>
                
                <div class="form-group">
                    <label for="edit-bereich">Bereich</label>
                    <input 
                        id="edit-bereich"
                        type="text" 
                        bind:value={editData.bereich} 
                        class="modal-input"
                        placeholder="Bereich"
                    />
                </div>
            </div>
            
            <div class="modal-actions">
                {#if showGegenbuchung && isVerbindlichkeiten}
                    <button 
                        type="button" 
                        class="gegenbuchung-btn" 
                        on:click={handleGegenbuchung} 
                        disabled={saving}
                        title="Gegenbuchung erstellen (Soll: 9999, Haben: {editData.soll})"
                    >
                        🔄
                    </button>
                {/if}
                <button type="button" class="cancel-btn" on:click={handleCancel} disabled={saving}>
                    Abbrechen
                </button>
                <button type="submit" class="save-btn" disabled={saving}>
                    {saving ? 'Speichern...' : 'Speichern'}
                </button>
            </div>
        </form>

        <!-- Document Preview Section -->
        <div class="document-preview-section">
            {#if buchung.assignedDocuments && buchung.assignedDocuments.length > 0}
                <div class="document-preview-header">
                    <h4>Zugeordnete Dokumente ({buchung.assignedDocuments.length})</h4>
                    {#if buchung.assignedDocuments.length > 1}
                    <div class="document-selector">
                        {#each buchung.assignedDocuments as doc, index}
                        <button 
                            type="button"
                            class="doc-selector-btn"
                            class:active={selectedDocIndex === index}
                            on:click={() => selectedDocIndex = index}
                            title={doc.fileName}
                        >
                            {getFileIcon(doc.fileType)} {index + 1}
                        </button>
                        {/each}
                    </div>
                    {/if}
                </div>
                
                <div class="document-preview-body">
                    {#if documentUrl}
                        {#if buchung.assignedDocuments[selectedDocIndex].fileType?.startsWith('image/')}
                            <img 
                                src={documentUrl} 
                                alt={buchung.assignedDocuments[selectedDocIndex].fileName}
                                class="preview-image"
                            />
                        {:else if buchung.assignedDocuments[selectedDocIndex].fileType === 'application/pdf'}
                            <iframe 
                                src={documentUrl}
                                class="preview-iframe"
                                title={buchung.assignedDocuments[selectedDocIndex].fileName}
                            ></iframe>
                        {:else}
                            <div class="preview-placeholder">
                                <div class="file-icon-large">{getFileIcon(buchung.assignedDocuments[selectedDocIndex].fileType)}</div>
                                <p>{buchung.assignedDocuments[selectedDocIndex].fileName}</p>
                                <a 
                                    href={documentUrl}
                                    target="_blank"
                                    class="download-link"
                                >
                                    Datei öffnen
                                </a>
                            </div>
                        {/if}
                    {:else}
                        <div class="preview-placeholder">
                            <p>Dokument wird geladen...</p>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="document-preview-header">
                    <h4>Dokumente</h4>
                </div>
                <div class="document-preview-body">
                    <div class="preview-placeholder">
                        <div class="file-icon-large">📄</div>
                        <p>Keine Dokumente zugeordnet</p>
                        <p style="font-size: 0.875rem; color: #999;">Ordnen Sie dieser Buchung Dokumente zu, um sie hier anzuzeigen.</p>
                    </div>
                </div>
            {/if}
        </div>
        </div>
    </div>
</div>

<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: 1rem;
    }

    .modal-content {
        background: white;
        border-radius: 8px;
        width: 100%;
        max-width: 1600px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h3 {
        margin: 0;
        color: #333;
        font-size: 1.5rem;
    }

    .modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s;
    }

    .modal-close:hover {
        background-color: #f0f0f0;
    }

    .modal-body {
        display: flex;
        gap: 1.5rem;
        overflow: hidden;
        flex: 1;
    }

    .modal-form {
        padding: 1rem;
        flex: 1;
        overflow-y: auto;
        min-width: 450px;
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
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: #333;
        font-size: 0.9rem;
    }

    .modal-input,
    .modal-select,
    .modal-textarea {
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1rem;
        font-family: inherit;
    }

    .modal-textarea {
        resize: vertical;
        min-height: 60px;
    }

    .modal-textarea:disabled {
        background-color: #f5f5f5;
        color: #666;
        cursor: not-allowed;
    }

    .modal-input:focus,
    .modal-select:focus,
    .modal-textarea:focus {
        outline: none;
        border-color: #007acc;
        box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.1);
    }

    .modal-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding-top: 1rem;
        border-top: 1px solid #e0e0e0;
    }

    .gegenbuchung-btn {
        padding: 0.75rem 1rem;
        border: none;
        border-radius: 4px;
        font-size: 1.2rem;
        cursor: pointer;
        transition: all 0.2s;
        background: #28a745;
        color: white;
        font-weight: 500;
        margin-right: auto;
    }

    .gegenbuchung-btn:hover:not(:disabled) {
        background: #218838;
        transform: scale(1.05);
    }

    .gegenbuchung-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .cancel-btn,
    .save-btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
        font-weight: 500;
    }

    .cancel-btn {
        background: #f0f0f0;
        color: #333;
    }

    .cancel-btn:hover:not(:disabled) {
        background: #e0e0e0;
    }

    .save-btn {
        background: #007acc;
        color: white;
    }

    .save-btn:hover:not(:disabled) {
        background: #005a9e;
    }

    .cancel-btn:disabled,
    .save-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* Document Preview Section */
    .document-preview-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-left: 1px solid #e0e0e0;
        overflow: hidden;
    }

    .document-preview-header {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #e0e0e0;
        background: #f9f9f9;
    }

    .document-preview-header h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #333;
    }

    .document-selector {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .doc-selector-btn {
        padding: 0.25rem 0.75rem;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
    }

    .doc-selector-btn:hover {
        background: #f0f0f0;
    }

    .doc-selector-btn.active {
        background: #007acc;
        color: white;
        border-color: #007acc;
    }

    .document-preview-body {
        padding: 1rem;
        flex: 1;
        overflow: auto;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .preview-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }

    .preview-iframe {
        width: 100%;
        height: 100%;
        border: none;
    }

    .preview-placeholder {
        text-align: center;
        padding: 2rem;
        color: #666;
    }

    .file-icon-large {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .download-link {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #007acc;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        transition: background-color 0.2s;
    }

    .download-link:hover {
        background: #005a9e;
    }
</style>
