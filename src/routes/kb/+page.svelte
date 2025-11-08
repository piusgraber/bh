<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import BuchungEdit from '$lib/components/BuchungEdit.svelte';

    export let data: {
        buchungen: Array<{
            id: number;
            datum: string;
            soll: number;
            haben: number;
            buchungstext: string;
            betrag: number;
            kategorie?: string;
            originaltext?: string;
            bereich?: string;
            subsoll?: number;
            subhaben?: number;
        }>;
        kontos: number[];
        kontoNames: Array<{
            id: number;
            name: string;
            kategorie: string;
            klasse: string;
        }>;
    };

    let selectedKonto: number | null = null;
    let filteredBuchungen: any[] = [];
    let selectedYear: string = 'alle';
    let selectedSubAccount: string = 'alle'; // Filter for subsoll/subhaben when konto is 2000
    let availableYears: string[] = [];
    let openingSaldo = 0;
    let showEditModal = false;
    let editingBuchung: any = null;
    let saving = false;

    // Cookie helper functions
    function setCookie(name: string, value: string, days: number = 365) {
        if (!browser) return;
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
        console.log(`Cookie saved: ${name}=${value}`);
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

    // Extract available years from buchungen
    $: {
        const years = new Set<string>();
        data.buchungen.forEach(buchung => {
            const year = new Date(buchung.datum).getFullYear().toString();
            years.add(year);
        });
        availableYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }

    // Calculate opening saldo for balance sheet accounts
    function calculateOpeningSaldo(kontoId: number, year: string, subAccount: string = 'alle'): number {
        if (year === 'alle') return 0;
        
        // Check if this is a balance sheet account (Bilanz)
        const konto = data.kontoNames.find(k => k.id === kontoId);
        if (!konto || konto.klasse !== 'Bilanz') {
            return 0; // Income statement accounts start at 0
        }
        
        // Calculate balance from all transactions before the selected year
        const targetYear = parseInt(year);
        let saldo = 0;
        
        data.buchungen.forEach(buchung => {
            const buchungYear = new Date(buchung.datum).getFullYear();
            if (buchungYear < targetYear) {
                let matchesSoll = buchung.soll === kontoId;
                let matchesHaben = buchung.haben === kontoId;
                
                // Apply sub-account filter for account 2000 (Kreditoren)
                if (kontoId === 2000 && subAccount !== 'alle') {
                    if (subAccount === 'nicht_angegeben') {
                        matchesSoll = matchesSoll && !buchung.subsoll;
                        matchesHaben = matchesHaben && !buchung.subhaben;
                    } else {
                        const subAccountId = parseInt(subAccount);
                        matchesSoll = matchesSoll && buchung.subsoll === subAccountId;
                        matchesHaben = matchesHaben && buchung.subhaben === subAccountId;
                    }
                }
                
                // Apply sub-account filter for account 1100 (Debitoren)
                if (kontoId === 1100 && subAccount !== 'alle') {
                    if (subAccount === 'nicht_angegeben') {
                        matchesSoll = matchesSoll && !buchung.subsoll;
                        matchesHaben = matchesHaben && !buchung.subhaben;
                    } else {
                        const subAccountId = parseInt(subAccount);
                        matchesSoll = matchesSoll && buchung.subsoll === subAccountId;
                        matchesHaben = matchesHaben && buchung.subhaben === subAccountId;
                    }
                }
                
                if (matchesSoll) {
                    saldo += buchung.betrag;
                } else if (matchesHaben) {
                    saldo -= buchung.betrag;
                }
            }
        });
        
        return saldo;
    }

    // Filter buchungen based on selected konto, year, and sub-account
    $: {
        if (selectedKonto !== null) {
            // Calculate opening saldo for the selected year (including sub-account filter)
            openingSaldo = calculateOpeningSaldo(selectedKonto, selectedYear, selectedSubAccount);
            
            let buchungenToFilter = data.buchungen;
            
            // Apply year filter if not "alle"
            if (selectedYear !== 'alle') {
                buchungenToFilter = buchungenToFilter.filter(buchung => {
                    const buchungYear = new Date(buchung.datum).getFullYear().toString();
                    return buchungYear === selectedYear;
                });
            }
            
            filteredBuchungen = buchungenToFilter.filter(buchung => {
                const matchesKonto = buchung.soll === selectedKonto || buchung.haben === selectedKonto;
                
                // Apply sub-account filter for account 2000 (Kreditoren)
                if (matchesKonto && selectedKonto === 2000 && selectedSubAccount !== 'alle') {
                    if (selectedSubAccount === 'nicht_angegeben') {
                        // Show only entries without subsoll/subhaben
                        const hasNoSubAccount = 
                            (buchung.soll === 2000 && !buchung.subsoll) ||
                            (buchung.haben === 2000 && !buchung.subhaben);
                        return hasNoSubAccount;
                    } else {
                        const subAccountId = parseInt(selectedSubAccount);
                        const matchesSubAccount = 
                            (buchung.soll === 2000 && buchung.subsoll === subAccountId) ||
                            (buchung.haben === 2000 && buchung.subhaben === subAccountId);
                        return matchesSubAccount;
                    }
                }
                
                // Apply sub-account filter for account 1100 (Debitoren)
                if (matchesKonto && selectedKonto === 1100 && selectedSubAccount !== 'alle') {
                    if (selectedSubAccount === 'nicht_angegeben') {
                        // Show only entries without subsoll/subhaben
                        const hasNoSubAccount = 
                            (buchung.soll === 1100 && !buchung.subsoll) ||
                            (buchung.haben === 1100 && !buchung.subhaben);
                        return hasNoSubAccount;
                    } else {
                        const subAccountId = parseInt(selectedSubAccount);
                        const matchesSubAccount = 
                            (buchung.soll === 1100 && buchung.subsoll === subAccountId) ||
                            (buchung.haben === 1100 && buchung.subhaben === subAccountId);
                        return matchesSubAccount;
                    }
                }
                
                return matchesKonto;
            }).map(buchung => ({
                ...buchung,
                // Determine the other account (Gegenkonto)
                gegenkonto: buchung.soll === selectedKonto ? buchung.haben : buchung.soll,
                // Determine if this is a debit or credit entry for the selected account
                istSoll: buchung.soll === selectedKonto,
                // Format the amount for display
                sollBetrag: buchung.soll === selectedKonto ? buchung.betrag : 0,
                habenBetrag: buchung.haben === selectedKonto ? buchung.betrag : 0
            })).sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime()); // Sort ascending by date
            
            // Calculate running saldo for each transaction, starting with opening saldo
            let runningSaldo = openingSaldo;
            filteredBuchungen = filteredBuchungen.map(buchung => {
                if (buchung.istSoll) {
                    runningSaldo += buchung.betrag;
                } else {
                    runningSaldo -= buchung.betrag;
                }
                return {
                    ...buchung,
                    saldo: runningSaldo
                };
            });
        } else {
            filteredBuchungen = [];
            openingSaldo = 0;
        }
    }

    let cookiesLoaded = false;

    onMount(() => {
        console.log('Loading cookies from storage...');
        
        // Load saved values from cookies
        const savedKonto = getCookie('kb-selectedKonto');
        console.log('Saved Konto:', savedKonto);
        if (savedKonto) {
            selectedKonto = parseInt(savedKonto);
        }
        
        const savedYear = getCookie('kb-selectedYear');
        console.log('Saved Year:', savedYear);
        if (savedYear) {
            selectedYear = savedYear;
        }
        
        const savedSubAccount = getCookie('kb-selectedSubAccount');
        console.log('Saved SubAccount:', savedSubAccount);
        if (savedSubAccount) {
            selectedSubAccount = savedSubAccount;
        }
        
        // Mark cookies as loaded to enable reactive saving
        cookiesLoaded = true;
        console.log('Cookies loaded, reactive saving enabled');
    });

    // Save selected konto to cookie (after initial load)
    $: if (browser && cookiesLoaded && selectedKonto !== null) {
        setCookie('kb-selectedKonto', selectedKonto.toString());
        // Reset sub-account filter when changing to kontos that don't have sub-accounts
        if (selectedKonto !== 2000 && selectedKonto !== 1100) {
            selectedSubAccount = 'alle';
        }
    }

    // Save selected year to cookie (after initial load)
    $: if (browser && cookiesLoaded && selectedYear !== undefined) {
        setCookie('kb-selectedYear', selectedYear);
    }

    // Save selected sub-account to cookie (after initial load)
    $: if (browser && cookiesLoaded && selectedSubAccount !== undefined) {
        setCookie('kb-selectedSubAccount', selectedSubAccount);
    }

    // Format currency
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    }

    // Format number without currency symbol for table display
    function formatNumber(amount: number): string {
        return new Intl.NumberFormat('de-CH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // Format date
    function formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    // Function to get account name by id
    function getAccountName(accountId: number): string {
        const konto = data.kontoNames.find(k => k.id === accountId);
        return konto ? `${accountId} - ${konto.name}` : accountId.toString();
    }

    // Start editing a buchung
    function startEdit(buchung: any) {
        const originalBuchung = data.buchungen.find(b => b.id === buchung.id);
        if (!originalBuchung) return;
        
        editingBuchung = originalBuchung;
        showEditModal = true;
    }

    // Cancel editing
    function handleCancelEdit() {
        showEditModal = false;
        editingBuchung = null;
    }

    // Save edit
    async function handleSaveEdit(event: CustomEvent) {
        if (saving) return;
        
        saving = true;
        
        try {
            const response = await fetch('/api/buchungen', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event.detail)
            });

            if (response.ok) {
                // Reload the page to get fresh data
                window.location.reload();
            } else {
                alert('Fehler beim Speichern der Buchung');
            }
        } catch (error) {
            console.error('Error saving buchung:', error);
            alert('Fehler beim Speichern der Buchung');
        } finally {
            saving = false;
        }
    }

    // Get unique kontos for dropdowns
    $: uniqueSoll = Array.from(new Set(data.buchungen.map(b => b.soll))).sort((a, b) => a - b);
    $: uniqueHaben = Array.from(new Set(data.buchungen.map(b => b.haben))).sort((a, b) => a - b);

    // Create Gegenbuchung (counter-booking)
    async function handleGegenbuchung() {
        if (!editingBuchung || saving) return;

        saving = true;

        try {
            // Find the max ID to create a unique one
            const maxId = Math.max(...data.buchungen.map(b => b.id));
            const newId = maxId + 1;

            const gegenbuchung = {
                id: newId,
                datum: editingBuchung.datum,
                soll: 9999,
                haben: editingBuchung.soll, // Haben becomes the original Soll
                buchungstext: editingBuchung.buchungstext,
                betrag: editingBuchung.betrag,
                kategorie: editingBuchung.kategorie,
                bereich: editingBuchung.bereich
            };

            const response = await fetch('/api/buchungen', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gegenbuchung)
            });

            if (response.ok) {
                // Reload the page to show the new buchung
                window.location.reload();
            } else {
                console.error('Failed to create Gegenbuchung');
            }
        } catch (error) {
            console.error('Error creating Gegenbuchung:', error);
        } finally {
            saving = false;
        }
    }
</script>

<svelte:head>
    <title>Kontoübersicht - Buchungen</title>
</svelte:head>

<div class="kb-container">
    <h1>Kontoübersicht</h1>
    
    <!-- Konto Selection -->
    <div class="konto-selection">
        <div class="filter-controls">
            <div class="filter-group">
                <label for="year-select">Jahr:</label>
                <select id="year-select" bind:value={selectedYear}>
                    <option value="alle">Alle</option>
                    {#each availableYears as year}
                        <option value={year}>{year}</option>
                    {/each}
                </select>
            </div>
            
            <div class="filter-group">
                <label for="konto-select">Konto auswählen:</label>
                <select id="konto-select" bind:value={selectedKonto}>
                    <option value={null}>-- Konto wählen --</option>
                    {#each data.kontos as konto}
                        <option value={konto}>{getAccountName(konto)}</option>
                    {/each}
                </select>
            </div>
            
            {#if selectedKonto === 2000}
                <div class="filter-group">
                    <label for="subaccount-select">Kreditor:</label>
                    <select id="subaccount-select" bind:value={selectedSubAccount}>
                        <option value="alle">Alle</option>
                        <option value="nicht_angegeben">Nicht angegeben</option>
                        {#each data.kontoNames.filter(k => k.id >= 2001 && k.id <= 2099) as konto}
                            <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                        {/each}
                    </select>
                </div>
            {/if}
            
            {#if selectedKonto === 1100}
                <div class="filter-group">
                    <label for="subaccount-select">Debitor:</label>
                    <select id="subaccount-select" bind:value={selectedSubAccount}>
                        <option value="alle">Alle</option>
                        <option value="nicht_angegeben">Nicht angegeben</option>
                        {#each data.kontoNames.filter(k => k.id >= 1101 && k.id <= 1199) as konto}
                            <option value={konto.id.toString()}>{konto.id} - {konto.name}</option>
                        {/each}
                    </select>
                </div>
            {/if}
        </div>
        
        {#if selectedKonto !== null}
            <div class="konto-info">
                <strong>Ausgewähltes Konto: {selectedKonto}</strong>
                <span class="transaction-count">({filteredBuchungen.length} Buchungen)</span>
                {#if selectedYear !== 'alle' && openingSaldo !== 0}
                    <span class="balance">Eröffnungssaldo: {formatCurrency(openingSaldo)}</span>
                {/if}
                {#if filteredBuchungen.length > 0}
                    <span class="balance">Endsaldo: {formatCurrency(filteredBuchungen[filteredBuchungen.length - 1].saldo)}</span>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Buchungen Table -->
    {#if selectedKonto !== null && filteredBuchungen.length > 0}
        <div class="table-container">
            <table class="buchungen-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Gegenkonto</th>
                        <th>Buchungstext</th>
                        <th class="amount-col">Soll</th>
                        <th class="amount-col">Haben</th>
                        <th class="amount-col">Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    {#if selectedYear !== 'alle' && openingSaldo !== 0}
                        <tr class="opening-balance">
                            <td class="date-col">01.01.{selectedYear}</td>
                            <td class="konto-col"></td>
                            <td class="text-col"><em>Eröffnungssaldo</em></td>
                            <td class="amount-col soll"></td>
                            <td class="amount-col haben"></td>
                            <td class="amount-col saldo" class:positive={openingSaldo >= 0} class:negative={openingSaldo < 0}>
                                {formatNumber(openingSaldo)}
                            </td>
                        </tr>
                    {/if}
                    {#each filteredBuchungen as buchung}
                        <tr 
                            class={buchung.istSoll ? 'soll-entry' : 'haben-entry'}
                            class:clickable={true}
                            on:click={() => startEdit(buchung)}
                            role="button"
                            tabindex="0"
                            on:keydown={(e) => e.key === 'Enter' && startEdit(buchung)}
                        >
                            <td class="date-col">
                                {formatDate(buchung.datum)}
                                {#if buchung.assignedDocuments && buchung.assignedDocuments.length > 0}
                                    <span class="document-indicator" title="{buchung.assignedDocuments.length} Dokument(e) zugeordnet">📎</span>
                                {/if}
                            </td>
                            <td class="konto-col">
                                <div class="gegenkonto">{buchung.gegenkonto}</div>
                                {#if buchung.kategorie}
                                    <div class="kategorie">{buchung.kategorie}</div>
                                {/if}
                            </td>
                            <td class="text-col">{buchung.buchungstext}</td>
                            <td class="amount-col soll">
                                {buchung.istSoll ? formatNumber(buchung.betrag) : ''}
                            </td>
                            <td class="amount-col haben">
                                {!buchung.istSoll ? formatNumber(buchung.betrag) : ''}
                            </td>
                            <td class="amount-col saldo" class:positive={buchung.saldo >= 0} class:negative={buchung.saldo < 0}>
                                {formatNumber(buchung.saldo)}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else if selectedKonto !== null}
        <div class="no-data">
            <p>Keine Buchungen für Konto {selectedKonto} gefunden.</p>
        </div>
    {:else}
        <div class="no-selection">
            <p>Bitte wählen Sie ein Konto aus, um die Buchungen anzuzeigen.</p>
        </div>
    {/if}
</div>

<!-- Edit Modal -->
{#if showEditModal && editingBuchung}
    <BuchungEdit 
        buchung={editingBuchung}
        kontoNames={data.kontoNames}
        {uniqueSoll}
        {uniqueHaben}
        showGegenbuchung={true}
        {saving}
        on:cancel={handleCancelEdit}
        on:save={handleSaveEdit}
        on:gegenbuchung={handleGegenbuchung}
    />
{/if}

<style>
    .kb-container {
        padding: 1rem;
        max-width: 1200px;
        margin: 0 auto;
    }

    h1 {
        color: #333;
        margin-bottom: 1.5rem;
    }

    .konto-selection {
        background: #f5f5f5;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
        border: 1px solid #ddd;
    }

    .filter-controls {
        display: flex;
        gap: 2rem;
        align-items: flex-end;
        flex-wrap: wrap;
    }

    .filter-group {
        display: flex;
        flex-direction: column;
    }

    .filter-group label {
        margin-bottom: 0.5rem;
        font-weight: bold;
        color: #333;
    }

    #konto-select,
    #year-select,
    #subaccount-select {
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1rem;
        min-width: 200px;
        background: white;
    }

    .konto-info {
        margin-top: 1rem;
        display: flex;
        gap: 1rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .transaction-count {
        color: #666;
        font-style: italic;
    }

    .balance {
        color: #007acc;
        font-weight: bold;
        font-size: 1.1rem;
    }

    .table-container {
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        max-height: 60vh;
        overflow-y: auto;
        border: 1px solid #ddd;
    }

    .buchungen-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    .buchungen-table thead {
        background: #007acc;
        color: white;
        position: sticky;
        top: 0;
        z-index: 10;
    }

    .buchungen-table th {
        padding: 1rem 0.75rem;
        text-align: left;
        font-weight: bold;
        border-bottom: 2px solid #005a9e;
    }

    .buchungen-table th.amount-col {
        text-align: right;
        width: 120px;
    }

    .buchungen-table tbody tr:nth-child(even) {
        background-color: #f9f9f9;
    }

    .buchungen-table tbody tr:hover {
        background-color: #e3f2fd;
    }

    .buchungen-table tbody tr.opening-balance {
        background-color: #fff8dc;
        font-weight: bold;
        border-top: 2px solid #666;
        border-bottom: 2px solid #666;
    }

    .buchungen-table tbody tr.opening-balance:hover {
        background-color: #fff8dc;
    }

    .buchungen-table tbody tr.opening-balance td {
        font-style: italic;
    }

    .buchungen-table td {
        padding: 0.75rem;
        border-bottom: 1px solid #eee;
        vertical-align: top;
    }

    .date-col {
        width: 100px;
        white-space: nowrap;
    }

    .konto-col {
        width: 100px;
        text-align: center;
        font-weight: bold;
        vertical-align: top;
        padding: 0.75rem 0.5rem;
    }

    .gegenkonto {
        font-weight: bold;
        font-size: 0.9rem;
        margin-bottom: 2px;
    }

    .kategorie {
        font-size: 0.75rem;
        color: #666;
        font-style: italic;
        font-weight: normal;
        line-height: 1.1;
    }

    .text-col {
        min-width: 300px;
        word-wrap: break-word;
    }

    .amount-col {
        width: 120px;
        text-align: right;
        font-family: 'Courier New', monospace;
        font-weight: bold;
    }

    .amount-col.soll {
        color: #388e3c;
    }

    .amount-col.haben {
        color: #d32f2f;
    }

    .amount-col.saldo {
        background: #f8f9fa;
        font-weight: bold;
        border-left: 2px solid #007acc;
    }

    .amount-col.saldo.positive {
        color: #2e7d32;
    }

    .amount-col.saldo.negative {
        color: #d32f2f;
    }

    .soll-entry {
        border-left: 4px solid #d32f2f;
    }

    .haben-entry {
        border-left: 4px solid #388e3c;
    }

    .no-data, .no-selection {
        text-align: center;
        padding: 2rem;
        color: #666;
        background: #f5f5f5;
        border-radius: 8px;
        border: 1px solid #ddd;
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .kb-container {
            padding: 0.5rem;
        }

        .buchungen-table {
            font-size: 0.8rem;
        }

        .buchungen-table th,
        .buchungen-table td {
            padding: 0.5rem 0.25rem;
        }

        .text-col {
            min-width: 200px;
        }

        .amount-col {
            width: 90px;
        }

        .konto-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
    }

    @media (max-width: 480px) {
        .buchungen-table th.amount-col,
        .buchungen-table td.amount-col {
            width: 80px;
            font-size: 0.75rem;
        }

        .text-col {
            min-width: 150px;
        }
    }

    /* Print styles */
    @media print {
        /* Reset page margins and ensure content is visible */
        :global(*) {
            visibility: hidden;
        }

        /* Make our component and its children visible */
        .kb-container,
        .kb-container * {
            visibility: visible;
        }

        /* Position our container to fill the page */
        .kb-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
        }

        /* Print header styling */
        h1 {
            font-size: 18pt;
            margin-bottom: 10mm;
            text-align: center;
            page-break-after: avoid;
            color: black !important;
        }

        /* Simplify konto selection display for print */
        .konto-selection {
            margin-bottom: 5mm;
            border: 1px solid #000;
            background: white;
            padding: 3mm;
        }

        .konto-selection label {
            display: none;
        }

        #konto-select {
            display: none;
        }

        .konto-info {
            border: 1px solid #000;
            padding: 3mm;
            margin: 0;
            background: #f5f5f5;
            display: block !important;
        }

        .konto-info * {
            color: black !important;
        }

        /* Table print styling */
        .table-container {
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none;
            border: 1px solid #000;
            background: white;
            width: 80%;
            margin: 0 auto;
        }

        .buchungen-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            page-break-inside: auto;
            background: white;
            table-layout: fixed;
            max-width: 180mm;
            margin: 0 auto;
        }

        .buchungen-table thead {
            display: table-header-group;
            background: #e0e0e0 !important;
            position: static;
        }

        .buchungen-table thead th {
            border: 1px solid #000;
            padding: 1mm;
            background: #e0e0e0 !important;
            color: black !important;
            font-weight: bold;
            font-size: 7pt;
            text-align: center;
            overflow: hidden;
        }

        /* Optimized column widths for print - more compact */
        .buchungen-table th:nth-child(1),  /* Datum */
        .buchungen-table td:nth-child(1) {
            width: 15%;
        }

        .buchungen-table th:nth-child(2),  /* Gegenkonto */
        .buchungen-table td:nth-child(2) {
            width: 12%;
        }

        .buchungen-table th:nth-child(3),  /* Buchungstext */
        .buchungen-table td:nth-child(3) {
            width: 46%;
        }

        .buchungen-table th:nth-child(4),  /* Soll */
        .buchungen-table td:nth-child(4) {
            width: 9%;
        }

        .buchungen-table th:nth-child(5),  /* Haben */
        .buchungen-table td:nth-child(5) {
            width: 9%;
        }

        .buchungen-table th:nth-child(6),  /* Saldo */
        .buchungen-table td:nth-child(6) {
            width: 9%;
        }

        .buchungen-table tbody {
            display: table-row-group;
        }

        .buchungen-table tbody tr {
            page-break-inside: avoid;
            border: none;
            background: white !important;
        }

        .buchungen-table tbody tr:nth-child(even) {
            background: #f9f9f9 !important;
        }

        .buchungen-table td {
            border: 1px solid #ccc;
            padding: 0.5mm 1mm;
            font-size: 7pt;
            color: black !important;
            background: inherit !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Special styling for specific columns */
        .date-col {
            text-align: center;
            font-size: 7pt;
        }

        .konto-col {
            text-align: center;
            font-weight: bold;
            font-size: 7pt;
            vertical-align: top;
            padding: 0.5mm 1mm;
        }

        .gegenkonto {
            font-weight: bold;
            font-size: 7pt;
            margin-bottom: 1px;
        }

        .kategorie {
            font-size: 6pt;
            color: #666;
            font-style: italic;
            font-weight: normal;
            line-height: 1;
        }

        .text-col {
            text-align: left;
            font-size: 7pt;
            white-space: normal !important;
            word-wrap: break-word;
            overflow: visible;
            line-height: 1.2;
        }

        /* Remove colored borders for print */
        .soll-entry,
        .haben-entry {
            border-left: 1px solid #ccc !important;
        }

        /* Print-friendly amount columns */
        .amount-col {
            text-align: right;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            font-size: 7pt;
            padding: 0.5mm 1mm;
        }

        .amount-col.soll,
        .amount-col.haben,
        .amount-col.saldo {
            color: black !important;
            font-weight: bold;
        }

        .amount-col.saldo {
            background: #f0f0f0 !important;
            border-left: 2px solid #000 !important;
        }

        /* Show content when no selection or no data */
        .no-data,
        .no-selection {
            border: 1px solid #000;
            padding: 5mm;
            text-align: center;
            background: white;
            color: black !important;
        }

        /* Page break rules */
        .konto-info {
            page-break-after: avoid;
        }

        .buchungen-table thead {
            page-break-after: avoid;
        }

        .buchungen-table tbody tr {
            page-break-inside: avoid;
        }

        /* Force visibility of all content */
        * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
    }

    /* Document indicator icon */
    .document-indicator {
        margin-left: 0.5rem;
        color: #28a745;
        font-size: 0.9em;
        cursor: help;
    }

    /* Clickable rows */
    .buchungen-table tbody tr.clickable {
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .buchungen-table tbody tr.clickable:hover {
        background-color: #e3f2fd !important;
    }
</style>