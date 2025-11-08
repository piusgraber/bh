<script lang="ts">
  export let data: {
    id: string;
    buchung: { 
      id: number; 
      buchungstext: string; 
      datum: string; 
      soll: number;
      haben: number;
      betrag: number;
      kategorie?: string;
    };
  };

  // Format currency as CHF
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF'
    }).format(amount);
  }

  // Format date
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('de-CH');
  }
</script>

<h1>Buchung {data.id}</h1>

<div class="space-y-2">
  <p><strong>Buchungstext:</strong> {data.buchung.buchungstext}</p>
  <p><strong>Datum:</strong> {formatDate(data.buchung.datum)}</p>
  <p><strong>Soll:</strong> {data.buchung.soll}</p>
  <p><strong>Haben:</strong> {data.buchung.haben}</p>
  <p><strong>Kategorie:</strong> {data.buchung.kategorie || '-'}</p>
  <p><strong>Betrag:</strong> {formatCurrency(data.buchung.betrag)}</p>
</div>
