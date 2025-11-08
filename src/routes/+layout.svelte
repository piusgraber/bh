<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let filterCookies = null;
  let showCookies = false;

  // Cookie helper function
  function getCookie(name) {
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

  // Load filter cookies (individual cookies)
  function loadFilterCookies() {
    if (!browser) return;
    
    filterCookies = {
      textFilter: getCookie('buchungen-textFilter') || '',
      sollFilter: getCookie('buchungen-sollFilter') || '',
      habenFilter: getCookie('buchungen-habenFilter') || '',
      betragFrom: getCookie('buchungen-betragFrom') || '',
      betragTo: getCookie('buchungen-betragTo') || '',
      onlyEmptyKategorie: getCookie('buchungen-onlyEmptyKategorie') || 'false'
    };
    
    console.log('Layout loading individual cookies:', filterCookies);
    
    // Check if any cookies exist
    const hasAnyCookies = Object.values(filterCookies).some(value => value !== '' && value !== 'false');
    if (!hasAnyCookies) {
      filterCookies = { message: 'No filter cookies found' };
    }
  }

  onMount(() => {
    // Initial load
    loadFilterCookies();
    
    // Add window load event as backup
    const handleWindowLoad = () => {
      console.log('Layout window loaded - reloading cookies as backup');
      loadFilterCookies();
    };
    
    if (document.readyState === 'complete') {
      handleWindowLoad();
    } else {
      window.addEventListener('load', handleWindowLoad);
    }
    
    // Refresh cookie display every 2 seconds to show updates
    const interval = setInterval(loadFilterCookies, 2000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('load', handleWindowLoad);
    };
  });
</script>

<style>
  .cookie-info {
    margin: 1rem 0;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: #f9f9f9;
  }
  
  .cookie-toggle {
    background: #007acc;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  .cookie-toggle:hover {
    background: #005a9e;
  }
  
  .cookie-display {
    margin-top: 1rem;
    padding: 1rem;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .cookie-display h3 {
    margin: 0 0 0.5rem 0;
    color: #333;
    font-size: 1rem;
  }
  
  .cookie-display pre {
    background: #f5f5f5;
    padding: 0.75rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.4;
    margin: 0;
    border: 1px solid #e0e0e0;
  }
  
  .nav-menu {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
    flex-wrap: wrap;
  }
  
  .nav-link {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 1rem;
    background: white;
    color: #333;
    text-decoration: none;
    border-radius: 4px;
    border: 1px solid #ddd;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }
  
  .nav-link:hover {
    background: #007acc;
    color: white;
    border-color: #007acc;
  }
  
  .postfinance-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2em;
    height: 1.2em;
    background: #FFCC00;
    color: white;
    border-radius: 2px;
    font-size: 0.9em;
    font-weight: bold;
    margin-right: 0.3rem;
  }
  
  .postfinance-link:hover .postfinance-icon {
    background: #FFD700;
  }
  
  .xfact-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    padding: 0 0.3em;
    height: 1.2em;
    background: #333;
    color: white;
    border-radius: 2px;
    font-size: 0.75em;
    font-weight: bold;
    margin-right: 0.3rem;
    font-family: monospace;
  }
  
  .xfact-link:hover .xfact-icon {
    background: #555;
  }
</style>

<h1>Buchungen</h1>

<!-- Navigation Menu -->
<nav class="nav-menu">
  <a href="/buchung" class="nav-link">📊 Buchungen</a>
  <a href="/kb" class="nav-link">📋 Kontoblätter</a>
  <a href="/docs" class="nav-link">📁 Docs</a>
  <a href="/assign" class="nav-link">🔗 Dokumente zuordnen</a>
  <a href="/import" class="nav-link postfinance-link"><span class="postfinance-icon">➕</span> PostFinance Import</a>
  <a href="/xfact" class="nav-link xfact-link"><span class="xfact-icon">xr</span> Xfact Import</a>
  <a href="/importkk" class="nav-link">💳 Kreditkarten Import</a>
</nav>

<!-- Cookie Display Toggle -->
<!--
<div class="cookie-info">
  <button 
    class="cookie-toggle" 
    on:click={() => showCookies = !showCookies}
  >
    {showCookies ? '🍪 Hide Cookies' : '🍪 Show Filter Cookies'}
  </button>
  
  {#if showCookies && filterCookies}
    <div class="cookie-display">
      <h3>Current Filter Cookies:</h3>
      <pre>{JSON.stringify(filterCookies, null, 2)}</pre>
    </div>
  {/if}
</div>
-->
<slot />
