(function () {
    // Lightweight auth for PUBLIC DEMO surfaces (landing / pitch). Signs the visitor
    // in ANONYMOUSLY so the protected voice/LLM endpoints accept the request, WITHOUT
    // showing a login gate. Requires "Anonymous sign-ins" enabled in the Supabase
    // dashboard (Authentication → Sign In / Providers → Anonymous).
    //
    // Exposes the same window.MiracleAuth shape as auth-gate.js so the existing token
    // attachment (plugin-api.js, trainer-plugin.js) works unchanged.
    let resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    const state = { client: null, user: null, accessToken: '' };

    function setSession(session) {
        state.accessToken = (session && session.access_token) || '';
        state.user = (session && session.user) || null;
    }

    async function init() {
        const client = await window.MiracleSupabase.whenReady();
        state.client = client;
        if (!client) { resolveReady(null); return; }

        const { data } = await client.auth.getSession();
        if (data && data.session) {
            setSession(data.session);
        } else {
            try {
                const { data: anon, error } = await client.auth.signInAnonymously();
                if (error) {
                    console.warn('[Miracle Demo Auth] Anonymous sign-in failed — enable "Anonymous sign-ins" in Supabase:', error.message);
                } else {
                    setSession(anon.session);
                }
            } catch (error) {
                console.warn('[Miracle Demo Auth] Anonymous sign-in threw:', error.message);
            }
        }

        client.auth.onAuthStateChange((_event, session) => setSession(session));
        resolveReady(state.user);
    }

    window.MiracleAuth = {
        whenAuthenticated() { return ready; },
        getUser() { return state.user; },
        getAccessToken() { return state.accessToken || ''; },
        async signOut() { try { await state.client && state.client.auth.signOut(); } catch (error) { /* ignore */ } }
    };

    if (window.MiracleSupabase) {
        init();
    } else {
        console.error('[Miracle Demo Auth] supabase-client.js must load before demo-auth.js');
    }
})();
