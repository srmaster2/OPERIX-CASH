// Global configuration and Supabase client initialization (idempotent & safe)
// Ensures a single global client without re-declaration errors

// 1) CONFIG (create once)
if (!window.CONFIG) {
  window.CONFIG = {
    SUPABASE_URL: 'https://hgzyjfsbqxqwzbdtuekh.supabase.co',
    // ⚠️ الـ KEY ده غلط — روح Supabase Dashboard → Project Settings → API → anon public
    // الـ key الصح بيبدأ بـ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    SUPABASE_KEY: 'sb_publishable_cYK-ahWLrRzvrf_OC9K8DQ_aWlzObD5',
    MASTER_EMAIL: 'srmaster2@gmail.com',
    TABLES: {
      accounts:     'accounts',
      transactions: 'transactions',
      users:        'users'
    }
  };
}

// 2) Supabase client (create once)
if (!window.supa) {
  if (!window._supabaseNS) {
    window._supabaseNS = window.supabase;
  }
  window.supa     = window._supabaseNS.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY);
  window.supabase = window.supa;
}

// 3) Globals
if (typeof window.MASTER_EMAIL === 'undefined') window.MASTER_EMAIL = window.CONFIG.MASTER_EMAIL;
if (typeof window.TABLES       === 'undefined') window.TABLES       = window.CONFIG.TABLES;