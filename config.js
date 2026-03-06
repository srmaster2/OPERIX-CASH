// Global configuration and Supabase client initialization (idempotent & safe)
// Ensures a single global client without re-declaration errors

// 1) CONFIG (create once)
if (!window.CONFIG) {
  window.CONFIG = {
    SUPABASE_URL: 'https://hgzyjfsbqxqwzbdtuekh.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnenlqZnNicXhxd3piZHR1ZWtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzI4NDAsImV4cCI6MjA4NTAwODg0MH0.eR8p2SM66S8TSKjSMNzNG8Ip2B5kZYLXWoOBYKMTRCQ',
    MASTER_EMAIL: 'srmaster2@gmail.com',
    TABLES: {
      accounts: 'accounts',
      transactions: 'transactions',
      users: 'users'
      // Add other tables like 'clients' if needed
    }
  };
}

// 2) Supabase client (bind directly to window to avoid lexical const conflicts)
// Do NOT redeclare const/let; use properties on window only
if (!window.supa) {
  // This will overwrite the SDK namespace only if assigned to window.supabase, so we keep the SDK function on window._supabaseNS
  if (!window._supabaseNS) {
    window._supabaseNS = window.supabase; // keep original namespace function
  }
  // Create client once
  const client = window._supabaseNS.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_KEY
  );
  // Expose client globally
  window.supa = client;
  // Also expose as `supabase` (common usage) by assigning to window property (not lexical const)
  window.supabase = client;
}

// 3) Globals for compatibility (assign once, avoid const re-declare)
if (typeof window.MASTER_EMAIL === 'undefined') window.MASTER_EMAIL = window.CONFIG.MASTER_EMAIL;
if (typeof window.TABLES === 'undefined') window.TABLES = window.CONFIG.TABLES;
