(function () {
    // Google login gate for the EMR surface. While there is no authenticated user it
    // shows a blocking overlay; once signed in it resolves window.MiracleAuth.whenAuthenticated().
    let resolveAuthed;
    const authed = new Promise((resolve) => { resolveAuthed = resolve; });
    const state = { client: null, user: null, overlay: null, accessToken: '' };

    function buildOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'miracle-auth-gate';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483000',
            'display:grid', 'place-items:center',
            'background:rgba(15,23,42,0.55)', 'backdrop-filter:blur(6px)',
            'font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif'
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'width:min(420px,calc(100vw - 40px))', 'background:#ffffff', 'color:#0f172a',
            'border-radius:20px', 'padding:32px', 'box-shadow:0 32px 90px rgba(15,23,42,0.25)',
            'text-align:center', 'display:grid', 'gap:16px'
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'Inicia sesion en Miracle';
        title.style.cssText = 'margin:0;font-size:22px;font-weight:800';

        const subtitle = document.createElement('p');
        subtitle.id = 'miracle-auth-subtitle';
        subtitle.textContent = 'Conecta tu cuenta para que tus notas se sincronicen en tiempo real entre tus dispositivos.';
        subtitle.style.cssText = 'margin:0;color:#475569;line-height:1.5;font-size:14px';

        const button = document.createElement('button');
        button.id = 'miracle-auth-button';
        button.type = 'button';
        button.textContent = 'Continuar con Google';
        button.style.cssText = [
            'border:0', 'border-radius:999px', 'padding:14px 18px', 'font:inherit', 'font-weight:700',
            'background:#2f8cff', 'color:#fff', 'cursor:pointer'
        ].join(';');
        button.addEventListener('click', signIn);

        card.append(title, subtitle, button);
        overlay.appendChild(card);
        return overlay;
    }

    function showOverlay(message) {
        if (!state.overlay) {
            state.overlay = buildOverlay();
        }
        if (!state.overlay.isConnected) {
            (document.body || document.documentElement).appendChild(state.overlay);
        }
        const subtitle = state.overlay.querySelector('#miracle-auth-subtitle');
        const button = state.overlay.querySelector('#miracle-auth-button');
        if (message) {
            if (subtitle) subtitle.textContent = message;
            // No client means sign-in cannot work; hide the button.
            if (button) button.style.display = state.client ? '' : 'none';
        }
        state.overlay.style.display = 'grid';
    }

    function hideOverlay() {
        if (state.overlay) {
            state.overlay.style.display = 'none';
        }
    }

    async function signIn() {
        if (!state.client) return;
        try {
            await state.client.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.href }
            });
        } catch (error) {
            console.error('[Miracle Auth] Sign-in failed:', error);
        }
    }

    function setUser(user) {
        const previous = state.user;
        state.user = user || null;
        if (state.user) {
            hideOverlay();
            resolveAuthed(state.user);
            if (!previous) {
                window.dispatchEvent(new CustomEvent('miracle-auth-changed', { detail: { user: state.user } }));
            }
        } else {
            showOverlay();
        }
    }

    async function init() {
        const client = await window.MiracleSupabase.whenReady();
        state.client = client;

        if (!client) {
            showOverlay(window.MiracleSupabase.getError() || 'Supabase no esta configurado.');
            return;
        }

        const { data } = await client.auth.getSession();
        state.accessToken = (data && data.session && data.session.access_token) || '';
        setUser(data && data.session ? data.session.user : null);

        client.auth.onAuthStateChange((_event, session) => {
            state.accessToken = (session && session.access_token) || '';
            setUser(session ? session.user : null);
        });
    }

    window.MiracleAuth = {
        whenAuthenticated() { return authed; },
        getUser() { return state.user; },
        getAccessToken() { return state.accessToken || ''; },
        async signOut() {
            try { await state.client?.auth.signOut(); } catch (error) { console.warn('[Miracle Auth] Sign-out failed:', error); }
        }
    };

    if (window.MiracleSupabase) {
        init();
    } else {
        console.error('[Miracle Auth] supabase-client.js must load before auth-gate.js');
    }
})();
