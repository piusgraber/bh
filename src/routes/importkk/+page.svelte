<script lang="ts">
    import { onMount } from 'svelte';

    // State variables
    let dragOver = false;
    let csvData: any[] = [];
    let fileName = '';
    let processing = false;
    let importing = false;
    let error = '';
    let importSuccess = false;

    // Handle file drag and drop
    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        dragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
        
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                processCSVFile(file);
            } else {
                error = 'Bitte nur CSV-Dateien hochladen.';
            }
        }
    }

    // Handle file input change
    function handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const files = target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                processCSVFile(file);
            } else {
                error = 'Bitte nur CSV-Dateien hochladen.';
            }
        }
    }

    // Process the CSV file
    async function processCSVFile(file: File) {
        processing = true;
        error = '';
        fileName = file.name;
        
        try {
            const formData = new FormData();
            formData.append('csvFile', file);

            const response = await fetch('/api/importkk', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                csvData = result.data;
                console.log('Parsed credit card data:', csvData);
            } else {
                error = result.message || 'Fehler beim Verarbeiten der CSV-Datei.';
            }
        } catch (err) {
            console.error('Error processing CSV:', err);
            error = 'Fehler beim Verarbeiten der CSV-Datei.';
        } finally {
            processing = false;
        }
    }

    // Import the processed data
    async function importData() {
        if (csvData.length === 0) {
            error = 'Keine Daten zum Importieren verfügbar.';
            return;
        }

        importing = true;
        error = '';

        try {
            const response = await fetch('/api/importkk', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: csvData
                })
            });

            const result = await response.json();
            
            if (result.success) {
                importSuccess = true;
                console.log('Import successful:', result);
                // Clear the data after successful import
                csvData = [];
                fileName = '';
            } else {
                error = result.message || 'Fehler beim Importieren der Daten.';
            }
        } catch (err) {
            console.error('Error importing data:', err);
            error = 'Fehler beim Importieren der Daten.';
        } finally {
            importing = false;
        }
    }

    // Clear data and start over
    function clearData() {
        csvData = [];
        fileName = '';
        error = '';
        importSuccess = false;
    }

    // Format currency
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    }

    // Format date
    function formatDate(dateStr: string): string {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('de-CH');
        } catch {
            return dateStr;
        }
    }
</script>

<div class="import-container">
    <h1>Kreditkarten CSV Import</h1>
    <p class="description">
        Importieren Sie PostFinance Kreditkarten-CSV-Dateien (Kartenkonto-Format). 
        Die Datei sollte Buchungsdatum, Buchungsdetails, Gutschrift und Lastschrift enthalten.
    </p>

    {#if importSuccess}
        <div class="success-message">
            ✅ Import erfolgreich! Die Daten wurden zur Datenbank hinzugefügt.
            <button on:click={clearData} class="btn-secondary">Neuen Import starten</button>
        </div>
    {:else}
        <!-- File Upload Area -->
        <div 
            class="upload-area"
            class:drag-over={dragOver}
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
        >
            <div class="upload-content">
                <div class="upload-icon">💳</div>
                <p>CSV-Datei hier hinziehen oder klicken zum Auswählen</p>
                <input 
                    type="file" 
                    accept=".csv" 
                    on:change={handleFileSelect}
                    class="file-input"
                />
            </div>
        </div>

        {#if processing}
            <div class="processing">
                <div class="spinner"></div>
                <p>CSV-Datei wird verarbeitet...</p>
            </div>
        {/if}

        {#if error}
            <div class="error-message">
                ❌ {error}
            </div>
        {/if}

        {#if csvData.length > 0 && !processing}
            <div class="preview-section">
                <h2>Vorschau ({csvData.length} Einträge)</h2>
                <p class="file-name">Datei: {fileName}</p>
                
                <!-- Data Preview Table -->
                <div class="table-container">
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Buchungstext</th>
                                <th>Betrag</th>
                                <th>Soll</th>
                                <th>Haben</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each csvData.slice(0, 10) as row}
                                <tr>
                                    <td>{formatDate(row.datum)}</td>
                                    <td class="buchungstext">{row.buchungstext}</td>
                                    <td class="betrag" class:negative={row.betrag < 0}>
                                        {formatCurrency(row.betrag)}
                                    </td>
                                    <td>{row.soll}</td>
                                    <td>{row.haben}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                {#if csvData.length > 10}
                    <p class="more-info">... und {csvData.length - 10} weitere Einträge</p>
                {/if}

                <!-- Import Controls -->
                <div class="import-controls">
                    <button 
                        on:click={importData} 
                        disabled={importing}
                        class="btn-primary"
                    >
                        {#if importing}
                            <div class="spinner-small"></div>
                            Importiere...
                        {:else}
                            📥 {csvData.length} Einträge importieren
                        {/if}
                    </button>
                    <button 
                        on:click={clearData}
                        class="btn-secondary"
                    >
                        🗑️ Verwerfen
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .import-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }

    h1 {
        color: #333;
        margin-bottom: 0.5rem;
    }

    .description {
        color: #666;
        margin-bottom: 2rem;
        font-size: 0.95rem;
    }

    .upload-area {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 3rem;
        text-align: center;
        transition: all 0.3s ease;
        cursor: pointer;
        position: relative;
        background: #fafafa;
    }

    .upload-area:hover,
    .upload-area.drag-over {
        border-color: #007acc;
        background: #f0f8ff;
    }

    .upload-content {
        pointer-events: none;
    }

    .upload-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
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

    .processing {
        text-align: center;
        margin: 2rem 0;
        padding: 2rem;
        background: #f8f9fa;
        border-radius: 8px;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #007acc;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    .spinner-small {
        width: 16px;
        height: 16px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #007acc;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        display: inline-block;
        margin-right: 0.5rem;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-message {
        background: #ffebee;
        color: #c62828;
        padding: 1rem;
        border-radius: 4px;
        margin: 1rem 0;
        border-left: 4px solid #c62828;
    }

    .success-message {
        background: #e8f5e8;
        color: #2e7d32;
        padding: 1.5rem;
        border-radius: 4px;
        margin: 1rem 0;
        border-left: 4px solid #2e7d32;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .preview-section {
        margin-top: 2rem;
    }

    .file-name {
        color: #666;
        font-size: 0.9rem;
        margin-bottom: 1rem;
    }

    .table-container {
        overflow-x: auto;
        margin: 1rem 0;
        border: 1px solid #ddd;
        border-radius: 8px;
    }

    .preview-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    .preview-table th,
    .preview-table td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #eee;
    }

    .preview-table th {
        background: #f8f9fa;
        font-weight: 600;
        color: #555;
        position: sticky;
        top: 0;
    }

    .preview-table tr:hover {
        background: #f8f9fa;
    }

    .buchungstext {
        max-width: 350px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .betrag {
        text-align: right;
        font-weight: 500;
    }

    .betrag.negative {
        color: #c62828;
    }

    .more-info {
        color: #666;
        font-style: italic;
        margin: 1rem 0;
    }

    .import-controls {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
    }

    .btn-primary {
        background: #007acc;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        transition: background 0.2s;
    }

    .btn-primary:hover:not(:disabled) {
        background: #005fa3;
    }

    .btn-primary:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: #6c757d;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        transition: background 0.2s;
    }

    .btn-secondary:hover {
        background: #545b62;
    }
</style>