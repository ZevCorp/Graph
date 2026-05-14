(function () {
    const DEFAULTS = {
        name: 'Graph',
        accentColor: '#0f5f8c',
        idleMessage: 'Listo para ayudarte aqui.',
        zIndex: 2147483000
    };

    const state = {
        options: { ...DEFAULTS },
        mounted: false,
        currentTour: null,
        currentStopIndex: -1,
        listeners: new Map(),
        pinned: false,
        dragging: {
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0
        },
        face: {
            mode: 'idle',
            blinkFactor: 1,
            targetSide: 'left',
            blinkTimer: null,
            blinkRestoreTimer: null
        }
    };

    const FACE_PRESETS = {
        smile: {
            eyeOpenness: 0.85,
            eyeSquint: 0.15,
            leftBrowHeight: 2,
            rightBrowHeight: 2.5,
            leftBrowCurve: 0.3,
            rightBrowCurve: 0.4,
            mouthCurve: 0.7,
            mouthWidth: 1.1,
            leftCornerHeight: 0.3,
            rightCornerHeight: 0.5,
            mouthOpenness: 0
        },
        mild_attention: {
            eyeOpenness: 0.85,
            eyeSquint: 0.15,
            leftBrowHeight: 0,
            rightBrowHeight: 4,
            leftBrowCurve: 0.2,
            rightBrowCurve: 0.5,
            mouthCurve: 0.6,
            mouthWidth: 0.92,
            leftCornerHeight: 0,
            rightCornerHeight: 0.5,
            mouthOpenness: 0
        },
        thinking: {
            eyeOpenness: 0.75,
            eyeSquint: 0.2,
            leftBrowHeight: -1,
            rightBrowHeight: 4,
            leftBrowCurve: 0.1,
            rightBrowCurve: 0.5,
            mouthCurve: 0.7,
            mouthWidth: 0.95,
            leftCornerHeight: 0.2,
            rightCornerHeight: 0.1,
            mouthOpenness: 0
        }
    };

    function quadraticBezier(start, control, end) {
        return `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`;
    }

    function cubicBezier(start, control1, control2, end) {
        return `M${start.x},${start.y} C${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}`;
    }

    function verticalLine(start, length) {
        return `M${start.x},${start.y} L${start.x},${start.y + length}`;
    }

    function generateEyebrowPath(baseX, baseY, width, height, curve, flip = false) {
        const halfWidth = width / 2;
        const flipMultiplier = flip ? -1 : 1;
        const startX = baseX - halfWidth * flipMultiplier;
        const endX = baseX + halfWidth * flipMultiplier;
        const startY = baseY - height;
        const endY = baseY - height;
        const controlX = baseX;
        const controlY = baseY - height - (curve * 15);

        return quadraticBezier(
            { x: startX, y: startY },
            { x: controlX, y: controlY },
            { x: endX, y: endY }
        );
    }

    function generateEyePath(centerX, centerY, openness, squint = 0) {
        const lineHeight = 25 * openness * (1 - squint * 0.4);
        const verticalOffset = lineHeight / 2;
        return verticalLine({ x: centerX, y: centerY - verticalOffset }, Math.max(0, lineHeight));
    }

    function generateMouthPath(centerX, centerY, width, curve, leftCorner, rightCorner, openness = 0) {
        const halfWidth = width / 2;
        const baseOffset = curve * 15;
        const leftY = centerY - baseOffset - (leftCorner * 8);
        const rightY = centerY - baseOffset - (rightCorner * 8);
        const start = { x: centerX - halfWidth, y: leftY };
        const end = { x: centerX + halfWidth, y: rightY };
        const curveDepth = -curve * 12;
        const midY = centerY + curveDepth;
        const asymmetryShift = (rightCorner - leftCorner) * 10;
        const control1 = { x: centerX - halfWidth * 0.3 + asymmetryShift, y: midY };
        const control2 = { x: centerX + halfWidth * 0.3 + asymmetryShift, y: midY };

        if (openness > 0.05) {
            const bottomOffset = openness * 15;
            const bottomY = centerY + bottomOffset;
            const topPath = cubicBezier(start, control1, control2, end);
            return topPath + ` Q${centerX},${bottomY} ${start.x},${leftY}`;
        }

        return cubicBezier(start, control1, control2, end);
    }

    function renderAssistantFace(mode = state.face.mode || 'idle') {
        const leftEyebrow = document.getElementById('graph-assistant-left-eyebrow');
        const rightEyebrow = document.getElementById('graph-assistant-right-eyebrow');
        const leftEye = document.getElementById('graph-assistant-left-eye-line');
        const rightEye = document.getElementById('graph-assistant-right-eye-line');
        const mouth = document.getElementById('graph-assistant-mouth');
        const faceGroup = document.getElementById('graph-assistant-face-group');

        if (!leftEyebrow || !rightEyebrow || !leftEye || !rightEye || !mouth || !faceGroup) {
            return;
        }

        const preset = mode === 'tour'
            ? FACE_PRESETS.mild_attention
            : mode === 'executing'
                ? FACE_PRESETS.thinking
                : FACE_PRESETS.smile;

        const isLookingRight = state.face.targetSide === 'right';
        const gazeOffset = isLookingRight ? 4.5 : -4.5;
        const blinkFactor = state.face.blinkFactor;
        let leftBrowHeight = preset.leftBrowHeight;
        let rightBrowHeight = preset.rightBrowHeight;
        let leftBrowCurve = preset.leftBrowCurve;
        let rightBrowCurve = preset.rightBrowCurve;
        let leftCornerHeight = preset.leftCornerHeight;
        let rightCornerHeight = preset.rightCornerHeight;

        if (isLookingRight) {
            [leftBrowHeight, rightBrowHeight] = [rightBrowHeight, leftBrowHeight];
            [leftBrowCurve, rightBrowCurve] = [rightBrowCurve, leftBrowCurve];
            [leftCornerHeight, rightCornerHeight] = [rightCornerHeight, leftCornerHeight];
        }

        const faceRotation = isLookingRight ? 2 : -2;
        faceGroup.setAttribute('transform', `rotate(${faceRotation})`);

        leftEyebrow.setAttribute('d', generateEyebrowPath(-30, -34, 20, leftBrowHeight, leftBrowCurve, false));
        rightEyebrow.setAttribute('d', generateEyebrowPath(30, -34, 20, rightBrowHeight, rightBrowCurve, true));
        leftEye.setAttribute('d', generateEyePath(-30 + gazeOffset, -14, preset.eyeOpenness * blinkFactor, preset.eyeSquint));
        rightEye.setAttribute('d', generateEyePath(30 + gazeOffset, -14, preset.eyeOpenness * blinkFactor, preset.eyeSquint));
        mouth.setAttribute(
            'd',
            generateMouthPath(0, 34, 34 * preset.mouthWidth, preset.mouthCurve, leftCornerHeight, rightCornerHeight, preset.mouthOpenness)
        );
    }

    function scheduleNextBlink() {
        if (state.face.blinkTimer) {
            clearTimeout(state.face.blinkTimer);
        }
        state.face.blinkTimer = setTimeout(() => {
            state.face.blinkFactor = 0;
            renderAssistantFace();

            if (state.face.blinkRestoreTimer) {
                clearTimeout(state.face.blinkRestoreTimer);
            }
            state.face.blinkRestoreTimer = setTimeout(() => {
                state.face.blinkFactor = 1;
                renderAssistantFace();
                scheduleNextBlink();
            }, 110);
        }, 1800 + Math.random() * 2200);
    }

    function ensureFaceAnimation() {
        if (state.face.blinkTimer || state.face.blinkRestoreTimer) {
            return;
        }
        scheduleNextBlink();
    }

    function updateFaceDirectionFromShell() {
        const { shell } = ensureElements();
        const rect = shell.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        state.face.targetSide = midpoint < (window.innerWidth / 2) ? 'right' : 'left';
        renderAssistantFace();
    }

    function ensureStyles() {
        if (document.getElementById('graph-assistant-runtime-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'graph-assistant-runtime-styles';
        style.textContent = `
            :root {
                --graph-assistant-glass-size: 151px;
                --graph-assistant-glass-radius: 999px;
                --graph-assistant-glass-highlight: rgba(255, 255, 255, 0.12);
                --graph-assistant-glass-mid: rgba(255, 255, 255, 0.05);
                --graph-assistant-glass-shadow: rgba(0, 0, 0, 0.35);
                --graph-assistant-glass-border: rgba(255, 255, 255, 0.18);
                --graph-assistant-face-tint: #ffffff;
            }
            .graph-assistant-shell {
                position: fixed;
                left: calc(100vw - 96px);
                top: calc(100vh - 164px);
                width: var(--graph-assistant-glass-size);
                height: var(--graph-assistant-glass-size);
                z-index: var(--graph-assistant-z, 2147483000);
                pointer-events: none;
                transition: left 320ms cubic-bezier(0.22, 1, 0.36, 1), top 320ms cubic-bezier(0.22, 1, 0.36, 1);
            }
            .graph-assistant-shell[data-dragging="true"] {
                transition: none;
            }
            .graph-assistant-shell[data-state="tour"] .graph-assistant-avatar,
            .graph-assistant-shell[data-state="executing"] .graph-assistant-avatar {
                transform: translateY(-2px) scale(1.02);
            }
            .graph-assistant-bubble {
                position: fixed;
                left: 16px;
                top: 16px;
                z-index: calc(var(--graph-assistant-z, 2147483000) + 1);
                max-width: min(320px, calc(100vw - 136px));
                padding: 12px 14px;
                border-radius: 18px;
                background: rgba(20, 27, 34, 0.94);
                color: #f8fbff;
                font: 500 13px/1.45 "Inter", "Segoe UI", sans-serif;
                box-shadow: 0 18px 42px rgba(7, 16, 24, 0.18);
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 180ms ease, transform 180ms ease;
                backdrop-filter: blur(14px);
                pointer-events: none;
            }
            .graph-assistant-bubble[data-visible="true"] {
                opacity: 1;
                transform: translateY(0);
            }
            .graph-assistant-avatar {
                width: var(--graph-assistant-glass-size);
                height: var(--graph-assistant-glass-size);
                border-radius: var(--graph-assistant-glass-radius);
                position: absolute;
                inset: 0;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                background:
                    linear-gradient(135deg, var(--graph-assistant-glass-highlight) 0%, var(--graph-assistant-glass-mid) 50%, rgba(255, 255, 255, 0.08) 100%);
                backdrop-filter: blur(60px) saturate(180%);
                -webkit-backdrop-filter: blur(60px) saturate(180%);
                border: 0.5px solid var(--graph-assistant-glass-border);
                box-shadow: 0 15px 50px var(--graph-assistant-glass-shadow);
                transition: transform 180ms ease;
                pointer-events: auto;
                cursor: grab;
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
            }
            .graph-assistant-shell[data-dragging="true"] .graph-assistant-avatar {
                cursor: grabbing;
            }
            .graph-assistant-label {
                display: none;
            }
            .graph-assistant-face-frame {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                pointer-events: none;
            }
            .graph-assistant-face-slot {
                position: absolute;
                z-index: 2;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                pointer-events: none;
            }
            .graph-assistant-face-core {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                pointer-events: none;
            }
            .graph-assistant-face-svg {
                position: absolute;
                left: 50%;
                top: 50%;
                width: 112px;
                height: 112px;
                transform: translate(-50%, -50%);
                z-index: 2;
                overflow: hidden;
                display: block;
                margin: 0;
                pointer-events: none;
            }
            .graph-assistant-face-stroke {
                fill: none;
                stroke: var(--graph-assistant-face-tint);
                stroke-width: 3;
                stroke-linecap: round;
                stroke-linejoin: round;
                opacity: 1;
                transition: transform 180ms ease, opacity 180ms ease;
                filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.28));
            }
            .graph-assistant-spotlight {
                position: fixed;
                border-radius: 18px;
                border: 2px solid rgba(15, 95, 140, 0.84);
                box-shadow: 0 0 0 9999px rgba(15, 19, 25, 0.18), 0 0 0 8px rgba(15, 95, 140, 0.12);
                pointer-events: none;
                opacity: 0;
                transition: opacity 180ms ease, left 280ms ease, top 280ms ease, width 280ms ease, height 280ms ease;
                z-index: calc(var(--graph-assistant-z, 2147483000) - 1);
            }
            .graph-assistant-spotlight[data-visible="true"] {
                opacity: 1;
            }
            @keyframes graphAssistantGlassFloat {
                0%, 100% {
                    transform: translateY(0);
                }
                50% {
                    transform: translateY(-2px);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureElements() {
        let shell = document.getElementById('graph-assistant-shell');
        if (!shell) {
            shell = document.createElement('div');
            shell.id = 'graph-assistant-shell';
            shell.className = 'graph-assistant-shell';
            shell.dataset.state = 'idle';
            shell.innerHTML = `
                <div class="graph-assistant-avatar" aria-hidden="true">
                    <div class="graph-assistant-face-frame">
                        <div class="graph-assistant-face-slot" data-face-slot="true">
                            <div class="graph-assistant-face-core">
                                <svg class="graph-assistant-face-svg" viewBox="-75 -75 150 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                                    <g id="graph-assistant-face-group" transform="rotate(-2)">
                                        <path id="graph-assistant-left-eyebrow" class="graph-assistant-face-stroke"></path>
                                        <path id="graph-assistant-right-eyebrow" class="graph-assistant-face-stroke"></path>
                                        <path id="graph-assistant-left-eye-line" class="graph-assistant-face-stroke"></path>
                                        <path id="graph-assistant-right-eye-line" class="graph-assistant-face-stroke"></path>
                                        <path id="graph-assistant-mouth" class="graph-assistant-face-stroke"></path>
                                    </g>
                                </svg>
                            </div>
                        </div>
                    </div>
                    <div class="graph-assistant-label" id="graph-assistant-label">Graph</div>
                </div>
            `;
            document.body.appendChild(shell);
        }

        let bubble = document.getElementById('graph-assistant-bubble');
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id = 'graph-assistant-bubble';
            bubble.className = 'graph-assistant-bubble';
            bubble.dataset.visible = 'true';
            document.body.appendChild(bubble);
        }

        let spotlight = document.getElementById('graph-assistant-spotlight');
        if (!spotlight) {
            spotlight = document.createElement('div');
            spotlight.id = 'graph-assistant-spotlight';
            spotlight.className = 'graph-assistant-spotlight';
            document.body.appendChild(spotlight);
        }

        return {
            shell,
            avatar: shell.querySelector('.graph-assistant-avatar'),
            bubble,
            label: document.getElementById('graph-assistant-label'),
            spotlight
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function setShellPosition(x, y) {
        const { shell } = ensureElements();
        const padding = 28;
        const rect = shell.getBoundingClientRect();
        const shellWidth = Math.max(rect.width, 112);
        const shellHeight = Math.max(rect.height, 112);
        const left = clamp(x - shellWidth / 2, padding, window.innerWidth - padding - shellWidth);
        const top = clamp(y - shellHeight / 2, padding, window.innerHeight - padding - shellHeight);
        shell.style.left = `${left}px`;
        shell.style.top = `${top}px`;
        updateFaceDirectionFromShell();
        positionBubbleNearShell();
        window.setTimeout(positionBubbleNearShell, 360);
    }

    function setDragging(active) {
        const { shell } = ensureElements();
        state.dragging.active = active;
        shell.dataset.dragging = active ? 'true' : 'false';
    }

    function bindDragHandlers() {
        const { avatar } = ensureElements();
        if (!avatar || avatar.dataset.dragBound === 'true') {
            return;
        }

        avatar.dataset.dragBound = 'true';

        avatar.addEventListener('pointerdown', (event) => {
            const { shell } = ensureElements();
            const rect = shell.getBoundingClientRect();

            state.pinned = false;
            state.dragging.pointerId = event.pointerId;
            state.dragging.offsetX = event.clientX - rect.left;
            state.dragging.offsetY = event.clientY - rect.top;
            setDragging(true);

            if (typeof avatar.setPointerCapture === 'function') {
                avatar.setPointerCapture(event.pointerId);
            }
        });

        avatar.addEventListener('pointermove', (event) => {
            if (!state.dragging.active || state.dragging.pointerId !== event.pointerId) {
                return;
            }

            const { shell } = ensureElements();
            const rect = shell.getBoundingClientRect();
            const nextLeft = event.clientX - state.dragging.offsetX;
            const nextTop = event.clientY - state.dragging.offsetY;
            const centerX = nextLeft + rect.width / 2;
            const centerY = nextTop + rect.height / 2;
            setShellPosition(centerX, centerY);
        });

        const releaseDrag = (event) => {
            if (state.dragging.pointerId !== null && event.pointerId !== state.dragging.pointerId) {
                return;
            }

            state.dragging.pointerId = null;
            setDragging(false);

            if (typeof avatar.releasePointerCapture === 'function' && event.pointerId !== undefined) {
                try {
                    avatar.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // Ignore release errors when pointer capture is already cleared.
                }
            }
        };

        avatar.addEventListener('pointerup', releaseDrag);
        avatar.addEventListener('pointercancel', releaseDrag);
    }

    function pinShellBottomRight() {
        const { shell } = ensureElements();
        const padding = 28;
        const rect = shell.getBoundingClientRect();
        const targetX = window.innerWidth - padding - Math.max(rect.width / 2, 56);
        const targetY = window.innerHeight - padding - Math.max(rect.height / 2, 56);
        state.pinned = true;
        setShellPosition(targetX, targetY);
    }

    function unpinShell() {
        state.pinned = false;
    }

    function positionNearRect(rect) {
        const shell = ensureElements().shell;
        const shellRect = shell.getBoundingClientRect();
        const horizontalGap = 34;
        const verticalGap = 18;
        const preferredRightX = rect.right + horizontalGap + shellRect.width / 2;
        const preferredLeftX = rect.left - horizontalGap - shellRect.width / 2;
        const centeredY = rect.top + Math.min(rect.height / 2, 70);

        const hasRoomOnRight = rect.right + horizontalGap + shellRect.width < window.innerWidth - 24;
        const hasRoomOnLeft = rect.left - horizontalGap - shellRect.width > 24;

        const x = hasRoomOnRight
            ? preferredRightX
            : hasRoomOnLeft
                ? preferredLeftX
                : rect.left + rect.width / 2;

        const y = centeredY + verticalGap;
        setShellPosition(x, y);
    }

    function resolveElement(selector) {
        if (!selector) return null;
        try {
            return document.querySelector(selector);
        } catch (error) {
            return null;
        }
    }

    function showBubble(text) {
        const { bubble } = ensureElements();
        if (!bubble) return;
        bubble.textContent = text || '';
        bubble.dataset.visible = text ? 'true' : 'false';
        window.requestAnimationFrame(positionBubbleNearShell);
    }

    function positionBubbleNearShell() {
        const shell = document.getElementById('graph-assistant-shell');
        const bubble = document.getElementById('graph-assistant-bubble');
        if (!shell || !bubble || bubble.dataset.visible !== 'true') {
            return;
        }

        const shellRect = shell.getBoundingClientRect();
        const bubbleRect = bubble.getBoundingClientRect();
        const gap = 18;
        const padding = 16;
        const preferredLeft = shellRect.left - bubbleRect.width - gap;
        const fallbackLeft = shellRect.right + gap;
        const hasRoomOnLeft = preferredLeft >= padding;
        const rawLeft = hasRoomOnLeft ? preferredLeft : fallbackLeft;
        const rawTop = shellRect.top + (shellRect.height - bubbleRect.height) / 2;
        const maxLeft = window.innerWidth - bubbleRect.width - padding;
        const maxTop = window.innerHeight - bubbleRect.height - padding;

        bubble.style.left = `${clamp(rawLeft, padding, Math.max(padding, maxLeft))}px`;
        bubble.style.top = `${clamp(rawTop, padding, Math.max(padding, maxTop))}px`;
    }

    function setMode(mode) {
        const { shell } = ensureElements();
        shell.dataset.state = mode || 'idle';
        state.face.mode = mode || 'idle';
        renderAssistantFace();
    }

    function updateSpotlightForElement(element) {
        const { spotlight } = ensureElements();
        if (!element) {
            spotlight.dataset.visible = 'false';
            return;
        }

        const rect = element.getBoundingClientRect();
        const pad = 10;
        spotlight.style.left = `${Math.max(0, rect.left - pad)}px`;
        spotlight.style.top = `${Math.max(0, rect.top - pad)}px`;
        spotlight.style.width = `${Math.min(window.innerWidth, rect.width + pad * 2)}px`;
        spotlight.style.height = `${Math.min(window.innerHeight, rect.height + pad * 2)}px`;
        spotlight.dataset.visible = 'true';
    }

    function emit(eventName, payload) {
        const handlers = state.listeners.get(eventName) || [];
        handlers.forEach((handler) => {
            try {
                handler(payload);
            } catch (error) {
                console.warn('[GraphAssistantRuntime] listener error', error);
            }
        });
    }

    const api = {
        mount(config = {}) {
            state.options = { ...DEFAULTS, ...config };
            ensureStyles();
            const { label } = ensureElements();
            bindDragHandlers();
            document.documentElement.style.setProperty('--graph-assistant-accent', state.options.accentColor);
            document.documentElement.style.setProperty('--graph-assistant-z', `${state.options.zIndex}`);
            if (label) {
                label.textContent = state.options.name || 'Graph';
            }
            showBubble(state.options.idleMessage || DEFAULTS.idleMessage);
            setShellPosition(window.innerWidth - 96, window.innerHeight - 164);
            state.mounted = true;
            setMode('idle');
            ensureFaceAnimation();
            emit('mounted', { options: state.options });
        },
        speak(text, options = {}) {
            if (!state.mounted) {
                api.mount();
            }
            showBubble(text || '');
            if (options.mode) {
                setMode(options.mode);
            }
        },
        clearSpeech() {
            showBubble('');
        },
        moveToSelector(selector, options = {}) {
            if (!state.mounted) {
                api.mount();
            }

            if (state.pinned) {
                if (options.message) {
                    showBubble(options.message);
                }
                if (options.mode) {
                    setMode(options.mode);
                }
                return false;
            }

            const element = resolveElement(selector);
            if (!element) {
                if (options.message) {
                    showBubble(options.message);
                }
                return false;
            }

            positionNearRect(element.getBoundingClientRect());
            updateSpotlightForElement(options.spotlight === false ? null : element);
            if (options.message) {
                showBubble(options.message);
            }
            if (options.mode) {
                setMode(options.mode);
            }
            emit('move', { selector, found: true, options });
            return true;
        },
        clearSpotlight() {
            updateSpotlightForElement(null);
            if (!state.currentTour) {
                setMode('idle');
            }
        },
        pinBottomRight() {
            if (!state.mounted) {
                api.mount();
            }
            pinShellBottomRight();
            setMode('recording');
            updateSpotlightForElement(null);
        },
        unpin() {
            unpinShell();
        },
        startTour(tour = {}) {
            const stops = Array.isArray(tour.stops) ? tour.stops : [];
            state.currentTour = { ...tour, stops };
            state.currentStopIndex = -1;
            if (stops.length === 0) {
                api.speak('No encontre paradas para este recorrido.', { mode: 'tour' });
                return;
            }
            api.speak(tour.title || 'Te voy mostrando los puntos mas importantes.', { mode: 'tour' });
            api.nextTourStop();
        },
        nextTourStop() {
            if (!state.currentTour || !state.currentTour.stops.length) {
                return false;
            }

            state.currentStopIndex += 1;
            if (state.currentStopIndex >= state.currentTour.stops.length) {
                api.finishTour();
                return false;
            }

            const stop = state.currentTour.stops[state.currentStopIndex];
            const moved = api.moveToSelector(stop.selector, {
                spotlight: true,
                mode: 'tour',
                message: stop.message || stop.title || `Paso ${state.currentStopIndex + 1}`
            });

            if (!moved) {
                api.speak(`No pude ubicar ${stop.title || stop.selector}. Sigo con el siguiente punto.`, { mode: 'tour' });
                return api.nextTourStop();
            }

            emit('tour-stop', {
                index: state.currentStopIndex,
                stop,
                total: state.currentTour.stops.length
            });
            return true;
        },
        finishTour() {
            const lastTitle = state.currentTour?.title || 'Recorrido';
            state.currentTour = null;
            state.currentStopIndex = -1;
            api.speak(`${lastTitle} finalizado.`, { mode: 'idle' });
            window.setTimeout(() => api.clearSpotlight(), 1200);
            emit('tour-finished', {});
        },
        handleAutomationEvent(event = {}) {
            if (!event || !event.selector) {
                return;
            }

            const stepText = event.message
                || event.label
                || event.selector
                || 'Estoy trabajando en esta parte.';

            api.moveToSelector(event.selector, {
                spotlight: event.spotlight !== false,
                mode: event.mode || 'executing',
                message: stepText
            });
        },
        subscribe(eventName, handler) {
            if (!state.listeners.has(eventName)) {
                state.listeners.set(eventName, []);
            }
            state.listeners.get(eventName).push(handler);

            return () => {
                const current = state.listeners.get(eventName) || [];
                state.listeners.set(eventName, current.filter((candidate) => candidate !== handler));
            };
        }
    };

    window.addEventListener('resize', () => {
        if (!state.mounted) {
            return;
        }
        if (state.pinned) {
            pinShellBottomRight();
            return;
        }
        const shell = document.getElementById('graph-assistant-shell');
        if (!shell) {
            return;
        }
        const rect = shell.getBoundingClientRect();
        setShellPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    window.GraphAssistantRuntime = api;
})();
