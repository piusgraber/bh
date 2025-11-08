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

    // Process CSV file
    async function processCSVFile(file: File) {
        processing = true;
        error = '';
        fileName = file.name;
        
        try {
            const text = await file.text();
            parseCSV(text);
        } catch (err) {
            error = `Fehler beim Lesen der Datei: ${err.message}`;
            console.error('CSV processing error:', err);
        } finally {
            processing = false;
        }
    }

    // Parse CSV content (PostFinance format with semicolons)
    function parseCSV(csvText: string) {
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        
        // Find the header line (should contain "Datum", "Avisierungstext", etc.)
        let headerIndex = -1;
        let dataStartIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('Datum;Avisierungstext') || 
                (line.includes('Datum') && line.includes('Avisierungstext') && line.includes('Saldo'))) {
                headerIndex = i;
                dataStartIndex = i + 1;
                break;
            }
        }
        
        if (headerIndex === -1) {
            error = 'CSV-Format nicht erkannt. Header mit "Datum;Avisierungstext" nicht gefunden.';
            return;
        }

        // Skip empty line after header if exists
        while (dataStartIndex < lines.length && !lines[dataStartIndex].trim()) {
            dataStartIndex++;
        }

        // Parse data lines until we hit "Disclaimer:" or empty lines
        const records = [];
        
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i];
            
            // Stop at disclaimer or if we hit empty lines
            if (line.toLowerCase().includes('disclaimer') || 
                line.toLowerCase().includes('dokumentinhalt') ||
                !line.trim()) {
                break;
            }
            
            // Parse PostFinance CSV format (semicolon separated with quoted values)
            const columns = parseCSVLine(line);
            
            // We expect at least 6 columns: Datum, Avisierungstext, Gutschrift, Lastschrift, Valuta, Saldo
            if (columns.length >= 6) {
                const record = {
                    datum: cleanValue(columns[0]) || '',
                    avisierungstext: cleanValue(columns[1]) || '',
                    gutschrift: cleanValue(columns[2]) || '',
                    lastschrift: cleanValue(columns[3]) || '',
                    valuta: cleanValue(columns[4]) || '',
                    saldo: cleanValue(columns[5]) || '',
                    // Calculate betrag (amount) from gutschrift or lastschrift
                    betrag: calculateBetrag(cleanValue(columns[2]), cleanValue(columns[3]))
                };
                
                // Only add if we have a valid date
                if (record.datum && record.datum.match(/\d{2}\.\d{2}\.\d{4}/)) {
                    records.push(record);
                }
            }
        }
        
        csvData = records;
        console.log(`Parsed ${records.length} records from CSV`);
        
        if (records.length === 0) {
            error = 'Keine gültigen Datensätze in der CSV-Datei gefunden.';
        }
    }

    // Parse a single CSV line handling quoted values and semicolon separation
    function parseCSVLine(line: string): string[] {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ';' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last column
        result.push(current);
        
        return result;
    }

    // Clean quoted values and remove Excel formula prefixes
    function cleanValue(value: string): string {
        if (!value) return '';
        
        // Remove quotes
        let cleaned = value.replace(/^"/, '').replace(/"$/, '');
        
        // Remove Excel formula prefix (=")
        cleaned = cleaned.replace(/^="/, '').replace(/"$/, '');
        
        return cleaned.trim();
    }

    // Calculate betrag from gutschrift/lastschrift
    function calculateBetrag(gutschrift: string, lastschrift: string): number {
        // Clean and parse gutschrift (positive amount)
        if (gutschrift && gutschrift.trim() && gutschrift !== '-' && gutschrift !== '') {
            const cleanAmount = gutschrift.replace(/[^\d.,-]/g, '').replace(',', '.');
            const amount = parseFloat(cleanAmount);
            return isNaN(amount) ? 0 : Math.abs(amount); // Gutschrift is always positive
        }
        
        // Clean and parse lastschrift (negative amount)
        if (lastschrift && lastschrift.trim() && lastschrift !== '-' && lastschrift !== '') {
            const cleanAmount = lastschrift.replace(/[^\d.,-]/g, '').replace(',', '.');
            const amount = parseFloat(cleanAmount);
            if (isNaN(amount)) return 0;
            
            // If lastschrift is already negative, return as is, otherwise make it negative
            return amount > 0 ? -amount : amount;
        }
        
        return 0;
    }

    // Format currency
    function formatCurrency(amount: number | string): string {
        const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
        if (isNaN(num)) return '€0,00';
        return new Intl.NumberFormat('de-DE', { 
            style: 'currency', 
            currency: 'EUR' 
        }).format(num);
    }

    // Format date for display
    function formatDate(dateString: string): string {
        if (!dateString) return '';
        // Input format: DD.MM.YYYY
        const parts = dateString.split('.');
        if (parts.length === 3) {
            try {
                const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                return new Intl.DateTimeFormat('de-DE').format(date);
            } catch {
                return dateString;
            }
        }
        return dateString;
    }

    // Import data to JSON file
    async function importData() {
        if (csvData.length === 0) {
            error = 'Keine Daten zum Importieren vorhanden.';
            return;
        }

        importing = true;
        error = '';
        importSuccess = false;

        try {
            const response = await fetch('/api/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: csvData,
                    fileName: fileName,
                    importDate: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Import fehlgeschlagen: ${response.statusText}`);
            }

            const result = await response.json();
            importSuccess = true;
            console.log('Import successful:', result);
            
            // Hide success message after 3 seconds
            setTimeout(() => {
                importSuccess = false;
            }, 3000);

        } catch (err) {
            error = `Import-Fehler: ${err.message}`;
            console.error('Import error:', err);
        } finally {
            importing = false;
        }
    }

    // Clear data
    function clearData() {
        csvData = [];
        fileName = '';
        error = '';
        importSuccess = false;
    }
</script>

<svelte:head>
    <title>CSV Import - PostFinance Daten</title>
</svelte:head>

<main class="import-container">
    <div class="header">
        <h1>CSV Import</h1>
        <p>PostFinance CSV-Dateien importieren und anzeigen</p>
    </div>

    <!-- File Upload Area -->
    <div class="upload-section">
        {#if csvData.length === 0}
            <div 
                class="drop-zone"
                class:drag-over={dragOver}
                on:dragover={handleDragOver}
                on:dragleave={handleDragLeave}
                on:drop={handleDrop}
            >
                <div class="drop-zone-content">
                    <div class="upload-icon">📄</div>
                    <h3>CSV-Datei hier ablegen</h3>
                    <p>Oder klicken Sie hier, um eine Datei auszuwählen</p>
                    <input 
                        type="file" 
                        accept=".csv" 
                        on:change={handleFileSelect}
                        class="file-input"
                    />
                </div>
                {#if processing}
                    <div class="processing">
                        <span>Verarbeite CSV-Datei...</span>
                    </div>
                {/if}
            </div>
        {/if}

        {#if error}
            <div class="error-message">
                <span class="error-icon">⚠️</span>
                <span>{error}</span>
                <button on:click={() => error = ''} class="close-error">✕</button>
            </div>
        {/if}
    </div>

    <!-- Data Display -->
    {#if csvData.length > 0}
        <div class="data-section">
            <div class="data-header">
                <div class="data-info">
                    <h2>Importierte Daten</h2>
                    <span class="record-count">{csvData.length} Datensätze aus {fileName}</span>
                </div>
                <div class="action-buttons">
                    <button 
                        on:click={importData} 
                        class="import-btn" 
                        disabled={importing || csvData.length === 0}
                    >
                        {importing ? 'Importiere...' : 'Import'}
                    </button>
                    <button on:click={clearData} class="clear-btn">Neue Datei</button>
                </div>
            </div>

            {#if importSuccess}
                <div class="success-message">
                    <span class="success-icon">✅</span>
                    <span>Daten erfolgreich nach /lib/import.json importiert!</span>
                </div>
            {/if}

            <div class="records-list">
                {#each csvData as record, index}
                    <div class="record-item">
                        <div class="record-header">
                            <div class="record-date">{formatDate(record.datum)}</div>
                            <div class="record-amount" class:positive={record.betrag > 0} class:negative={record.betrag < 0}>
                                {formatCurrency(record.betrag)}
                            </div>
                        </div>
                        <div class="record-text">{record.avisierungstext}</div>
                        <div class="record-details">
                            <span class="detail-item">Valuta: {formatDate(record.valuta)}</span>
                            <span class="detail-item">Saldo: {formatCurrency(parseFloat(record.saldo.replace(',', '.')) || 0)}</span>
                            {#if record.gutschrift && record.gutschrift !== '-' && record.gutschrift !== ''}
                                <span class="detail-item gutschrift">Gutschrift: {formatCurrency(parseFloat(record.gutschrift.replace(',', '.')) || 0)}</span>
                            {/if}
                            {#if record.lastschrift && record.lastschrift !== '-' && record.lastschrift !== ''}
                                <span class="detail-item lastschrift">Lastschrift: {formatCurrency(parseFloat(record.lastschrift.replace(',', '.')) || 0)}</span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</main>

<style>
    .import-container {
        min-height: 100vh;
        background: #f9fafb;
        padding: 2rem;
    }

    .header {
        text-align: center;
        margin-bottom: 2rem;
    }

    .header h1 {
        color: #1f2937;
        margin: 0 0 0.5rem 0;
        font-size: 2rem;
        font-weight: 600;
    }

    .header p {
        color: #6b7280;
        margin: 0;
    }

    .upload-section {
        max-width: 600px;
        margin: 0 auto 2rem auto;
    }

    .drop-zone {
        border: 2px dashed #d1d5db;
        border-radius: 0.5rem;
        padding: 3rem 2rem;
        text-align: center;
        background: white;
        transition: all 0.2s ease;
        cursor: pointer;
        position: relative;
    }

    .drop-zone:hover,
    .drop-zone.drag-over {
        border-color: #3b82f6;
        background: #eff6ff;
    }

    .drop-zone-content {
        pointer-events: none;
    }

    .upload-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
        opacity: 0.5;
    }

    .drop-zone h3 {
        margin: 0 0 0.5rem 0;
        color: #1f2937;
        font-weight: 600;
    }

    .drop-zone p {
        margin: 0;
        color: #6b7280;
    }

    .file-input {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0;
        cursor: pointer;
        pointer-events: all;
    }

    .processing {
        margin-top: 1rem;
        color: #3b82f6;
        font-weight: 500;
    }

    .error-message {
        margin-top: 1rem;
        padding: 1rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 0.375rem;
        color: #dc2626;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .error-icon {
        font-size: 1.25rem;
    }

    .close-error {
        margin-left: auto;
        background: none;
        border: none;
        color: #dc2626;
        cursor: pointer;
        padding: 0.25rem;
        font-size: 1rem;
    }

    .data-section {
        max-width: 1000px;
        margin: 0 auto;
    }

    .data-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        background: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .data-info h2 {
        margin: 0 0 0.25rem 0;
        color: #1f2937;
        font-size: 1.5rem;
        font-weight: 600;
    }

    .record-count {
        color: #6b7280;
        font-size: 0.875rem;
    }

    .clear-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 0.375rem;
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .clear-btn:hover {
        background: #dc2626;
    }

    .action-buttons {
        display: flex;
        gap: 1rem;
        align-items: center;
    }

    .import-btn {
        background: #10b981;
        color: white;
        border: none;
        border-radius: 0.375rem;
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
        min-width: 100px;
    }

    .import-btn:hover:not(:disabled) {
        background: #059669;
    }

    .import-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .success-message {
        margin-bottom: 1rem;
        padding: 1rem;
        background: #d1fae5;
        border: 1px solid #34d399;
        border-radius: 0.375rem;
        color: #065f46;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .success-icon {
        font-size: 1.25rem;
    }

    .records-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .record-item {
        background: white;
        border-radius: 0.5rem;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border-left: 4px solid #e5e7eb;
    }

    .record-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .record-date {
        font-weight: 600;
        color: #1f2937;
        font-size: 0.875rem;
    }

    .record-amount {
        font-weight: 700;
        font-size: 1.125rem;
    }

    .record-amount.positive {
        color: #059669;
    }

    .record-amount.negative {
        color: #dc2626;
    }

    .record-text {
        color: #374151;
        margin-bottom: 0.75rem;
        font-weight: 500;
        line-height: 1.5;
    }

    .record-details {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .detail-item {
        background: #f3f4f6;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
    }

    .detail-item.gutschrift {
        background: #d1fae5;
        color: #065f46;
    }

    .detail-item.lastschrift {
        background: #fee2e2;
        color: #991b1b;
    }

    @media (max-width: 768px) {
        .import-container {
            padding: 1rem;
        }

        .header h1 {
            font-size: 1.5rem;
        }

        .data-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
        }

        .record-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }

        .record-details {
            flex-direction: column;
            gap: 0.5rem;
        }
    }
</style>