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
    };
    export let kontoNames: Array<{
        id: number;
        name: string;
        kategorie: string;
        klasse: string;
    }>;
    export let uniqueSoll: number[];
    export let uniqueHaben: number[];
    export let saving: boolean = false;

    let editData: any = {};

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
</script>

<!-- Form only, no modal wrapper -->
<form class="embedded-form" on:submit|preventDefault={handleSave}>
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
        <button type="button" class="cancel-btn" on:click={handleCancel} disabled={saving}>
            Abbrechen
        </button>
        <button type="submit" class="save-btn" disabled={saving}>
            {saving ? 'Speichern...' : 'Speichern'}
        </button>
    </div>
</form>

<style>
    .embedded-form {
        width: 100%;
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
    .modal-select {
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1rem;
        font-family: inherit;
    }

    .modal-input:focus,
    .modal-select:focus {
        outline: none;
        border-color: #007acc;
        box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.1);
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding-top: 1rem;
        border-top: 1px solid #e0e0e0;
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
</style>
