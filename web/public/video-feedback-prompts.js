(function () {
    function escapeHtml(value) {
        return `${value || ''}`
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function getResultId() {
        const segments = window.location.pathname.split('/').filter(Boolean);
        return segments[segments.length - 1] || '';
    }

    async function fetchPayload(resultId) {
        const response = await fetch(`/api/video-feedback/${encodeURIComponent(resultId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No pude cargar los prompts generados.');
        }
        return payload;
    }

    function renderPrompts(payload) {
        const grid = document.getElementById('prompt-grid');
        const prompts = Array.isArray(payload.actionablePrompts) ? payload.actionablePrompts : [];
        if (!prompts.length) {
            grid.innerHTML = '<div class="empty">No hubo prompts accionables en este resultado.</div>';
            return;
        }

        grid.innerHTML = prompts.map((item) => `
            <article class="card">
                <h2>${escapeHtml(item.title || 'Cambio')}</h2>
                <div class="meta">
                    <div><strong>Intencion:</strong> ${escapeHtml(item.userIntentSummary || '')}</div>
                    <div><strong>Ubicacion sugerida:</strong> ${escapeHtml(item.pageLocationHint || '')}</div>
                </div>
                <pre id="${escapeHtml(item.id)}">${escapeHtml(item.prompt || '')}</pre>
                <button class="copy-btn" type="button" data-copy-target="${escapeHtml(item.id)}">Copiar prompt</button>
            </article>
        `).join('');
    }

    function renderFutureIdeas(payload) {
        const ideas = Array.isArray(payload.futureIdeas) ? payload.futureIdeas : [];
        const content = document.getElementById('future-ideas-content');
        const toggle = document.getElementById('future-ideas-toggle');
        toggle.textContent = ideas.length ? `Ideas futuras (${ideas.length})` : 'Ideas futuras';

        if (!ideas.length) {
            content.innerHTML = '<div class="empty">No se detectaron ideas futuras o ambiguas en este resultado.</div>';
            return;
        }

        content.innerHTML = ideas.map((item) => `
            <div class="idea">
                <strong>${escapeHtml(item.idea || '')}</strong>
                <div>${escapeHtml(item.context || '')}</div>
            </div>
        `).join('');
    }

    function bindCopyButtons() {
        document.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-copy-target]');
            if (!button) {
                return;
            }
            const target = document.getElementById(button.getAttribute('data-copy-target'));
            if (!target) {
                return;
            }
            await navigator.clipboard.writeText(target.textContent || '');
            button.textContent = 'Copiado';
            window.setTimeout(() => {
                button.textContent = 'Copiar prompt';
            }, 1200);
        });
    }

    function bindDrawer() {
        const toggle = document.getElementById('future-ideas-toggle');
        const drawer = document.getElementById('future-ideas-drawer');
        toggle.addEventListener('click', () => {
            const next = drawer.dataset.open !== 'true';
            drawer.dataset.open = next ? 'true' : 'false';
        });
    }

    async function main() {
        bindCopyButtons();
        bindDrawer();

        const grid = document.getElementById('prompt-grid');
        try {
            const payload = await fetchPayload(getResultId());
            renderPrompts(payload);
            renderFutureIdeas(payload);
        } catch (error) {
            grid.innerHTML = `<div class="error">${escapeHtml(error.message || 'No pude cargar este resultado.')}</div>`;
        }
    }

    main().catch(() => {});
})();
