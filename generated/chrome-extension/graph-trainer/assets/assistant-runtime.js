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
        speech: {
            displayedText: '',
            targetText: '',
            typingTimer: null,
            currentUtterance: null,
            selectedVoice: null
        },
        interaction: {
            lastTouchAt: 0
        },
        mic: {
            longPressTimer: null,
            longPressTriggered: false
        },
        chat: {
            open: false
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
                padding-bottom: 22px;
                border-radius: 18px;
                background: rgba(20, 27, 34, 0.94);
                color: #f8fbff;
                font: 500 13px/1.45 "Inter", "Segoe UI", sans-serif;
                box-shadow:
                    0 24px 64px rgba(2, 8, 18, 0.55),
                    0 0 0 1px rgba(255, 255, 255, 0.12),
                    0 0 34px rgba(255, 255, 255, 0.12),
                    0 10px 28px rgba(255, 255, 255, 0.08);
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
            .graph-assistant-bubble-text {
                display: block;
                white-space: pre-wrap;
            }
            .graph-assistant-user-bubble {
                position: fixed;
                left: 16px;
                top: 16px;
                z-index: calc(var(--graph-assistant-z, 2147483000) + 2);
                max-width: min(280px, calc(100vw - 152px));
                padding: 10px 12px;
                border-radius: 16px;
                background: rgba(246, 250, 255, 0.97);
                color: #102033;
                font: 600 12px/1.4 "Inter", "Segoe UI", sans-serif;
                box-shadow: 0 20px 44px rgba(5, 10, 20, 0.24);
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 140ms ease, transform 140ms ease;
                pointer-events: none;
            }
            .graph-assistant-user-bubble[data-visible="true"] {
                opacity: 1;
                transform: translateY(0);
            }
            .graph-assistant-bubble-mic {
                position: fixed;
                width: 42px;
                height: 42px;
                border: none;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.98);
                color: #102033;
                box-shadow:
                    0 18px 36px rgba(4, 10, 20, 0.32),
                    0 0 0 1px rgba(255, 255, 255, 0.78);
                z-index: calc(var(--graph-assistant-z, 2147483000) + 3);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                pointer-events: auto;
                transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
            }
            .graph-assistant-bubble-mic:hover {
                transform: translateY(-1px);
                box-shadow:
                    0 22px 42px rgba(4, 10, 20, 0.38),
                    0 0 0 1px rgba(255, 255, 255, 0.88);
            }
            .graph-assistant-bubble-mic[data-active="true"] {
                background: #0f5f8c;
                color: #ffffff;
            }
            .graph-assistant-bubble-mic svg {
                width: 18px;
                height: 18px;
            }
            .graph-assistant-chat-toggle {
                position: fixed;
                width: 42px;
                height: 42px;
                border: none;
                border-radius: 999px;
                background: rgba(20, 27, 34, 0.96);
                color: #f8fbff;
                box-shadow:
                    0 18px 36px rgba(4, 10, 20, 0.32),
                    0 0 0 1px rgba(255, 255, 255, 0.12);
                z-index: calc(var(--graph-assistant-z, 2147483000) + 3);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                pointer-events: auto;
                transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
            }
            .graph-assistant-chat-toggle:hover {
                transform: translateY(-1px);
                box-shadow:
                    0 22px 42px rgba(4, 10, 20, 0.38),
                    0 0 0 1px rgba(255, 255, 255, 0.18);
            }
            .graph-assistant-chat-toggle[data-active="true"] {
                background: #102d44;
            }
            .graph-assistant-chat-toggle svg {
                width: 18px;
                height: 18px;
            }
            .graph-assistant-chat-composer {
                position: fixed;
                left: 16px;
                top: 16px;
                z-index: calc(var(--graph-assistant-z, 2147483000) + 4);
                width: min(320px, calc(100vw - 32px));
                display: grid;
                gap: 10px;
                padding: 14px;
                border-radius: 18px;
                background: rgba(20, 27, 34, 0.96);
                color: #f8fbff;
                box-shadow:
                    0 24px 64px rgba(2, 8, 18, 0.55),
                    0 0 0 1px rgba(255, 255, 255, 0.12),
                    0 10px 28px rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(14px);
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 180ms ease, transform 180ms ease;
                pointer-events: none;
            }
            .graph-assistant-chat-composer[data-visible="true"] {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }
            .graph-assistant-chat-composer textarea {
                width: 100%;
                min-height: 48px;
                max-height: 140px;
                resize: vertical;
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 14px;
                padding: 11px 12px;
                box-sizing: border-box;
                background: rgba(255, 255, 255, 0.08);
                color: #f8fbff;
                font: 500 13px/1.45 "Inter", "Segoe UI", sans-serif;
                outline: none;
            }
            .graph-assistant-chat-composer textarea::placeholder {
                color: rgba(248, 251, 255, 0.66);
            }
            .graph-assistant-chat-composer textarea:focus {
                border-color: rgba(255, 255, 255, 0.34);
                box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
            }
            .graph-assistant-chat-composer-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .graph-assistant-chat-send {
                border: none;
                border-radius: 999px;
                padding: 9px 14px;
                background: rgba(255, 255, 255, 0.96);
                color: #102033;
                font: 700 12px/1 "Inter", "Segoe UI", sans-serif;
                cursor: pointer;
            }
            .graph-assistant-chat-send:disabled {
                opacity: 0.55;
                cursor: wait;
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
            bubble.innerHTML = '<span class="graph-assistant-bubble-text" id="graph-assistant-bubble-text"></span>';
            document.body.appendChild(bubble);
        }

        let userBubble = document.getElementById('graph-assistant-user-bubble');
        if (!userBubble) {
            userBubble = document.createElement('div');
            userBubble.id = 'graph-assistant-user-bubble';
            userBubble.className = 'graph-assistant-user-bubble';
            userBubble.dataset.visible = 'false';
            document.body.appendChild(userBubble);
        }

        let micButton = document.getElementById('graph-assistant-bubble-mic');
        if (!micButton) {
            micButton = document.createElement('button');
            micButton.id = 'graph-assistant-bubble-mic';
            micButton.className = 'graph-assistant-bubble-mic';
            micButton.type = 'button';
            micButton.dataset.active = 'false';
            micButton.setAttribute('aria-label', 'Hablar con el asistente');
            micButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 1 0 10 0Z" fill="currentColor"/></svg>';
            document.body.appendChild(micButton);
        }

        let chatButton = document.getElementById('graph-assistant-chat-toggle');
        if (!chatButton) {
            chatButton = document.createElement('button');
            chatButton.id = 'graph-assistant-chat-toggle';
            chatButton.className = 'graph-assistant-chat-toggle';
            chatButton.type = 'button';
            chatButton.dataset.active = 'false';
            chatButton.setAttribute('aria-label', 'Abrir chat del asistente');
            chatButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H8.5L4 19V5Z" fill="currentColor"/></svg>';
            document.body.appendChild(chatButton);
        }

        let chatComposer = document.getElementById('graph-assistant-chat-composer');
        if (!chatComposer) {
            chatComposer = document.createElement('div');
            chatComposer.id = 'graph-assistant-chat-composer';
            chatComposer.className = 'graph-assistant-chat-composer';
            chatComposer.dataset.visible = 'false';
            chatComposer.innerHTML = `
                <textarea id="graph-assistant-chat-input" rows="2" placeholder="Escribe tu mensaje..."></textarea>
                <div class="graph-assistant-chat-composer-actions">
                    <button id="graph-assistant-chat-send" class="graph-assistant-chat-send" type="button">Enviar</button>
                </div>
            `;
            document.body.appendChild(chatComposer);
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
            bubbleText: document.getElementById('graph-assistant-bubble-text'),
            userBubble,
            micButton,
            chatButton,
            chatComposer,
            chatInput: document.getElementById('graph-assistant-chat-input'),
            chatSendButton: document.getElementById('graph-assistant-chat-send'),
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
        updateFaceTintFromBackdrop();
        positionBubbleNearShell();
        window.setTimeout(positionBubbleNearShell, 360);
    }

    function parseCssColor(colorText) {
        if (!colorText || colorText === 'transparent') {
            return null;
        }

        const rgbMatch = colorText.match(/rgba?\(([^)]+)\)/i);
        if (rgbMatch) {
            const parts = rgbMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
            if (parts.length >= 3) {
                return {
                    r: parts[0],
                    g: parts[1],
                    b: parts[2],
                    a: Number.isFinite(parts[3]) ? parts[3] : 1
                };
            }
        }

        const hex = colorText.replace('#', '').trim();
        if (hex.length === 3) {
            return {
                r: Number.parseInt(hex[0] + hex[0], 16),
                g: Number.parseInt(hex[1] + hex[1], 16),
                b: Number.parseInt(hex[2] + hex[2], 16),
                a: 1
            };
        }
        if (hex.length === 6) {
            return {
                r: Number.parseInt(hex.slice(0, 2), 16),
                g: Number.parseInt(hex.slice(2, 4), 16),
                b: Number.parseInt(hex.slice(4, 6), 16),
                a: 1
            };
        }

        return null;
    }

    function isRuntimeOwnedElement(element) {
        return Boolean(
            element?.closest?.('#graph-assistant-shell')
            || element?.closest?.('#graph-assistant-bubble')
            || element?.closest?.('#graph-assistant-chat-toggle')
            || element?.closest?.('#graph-assistant-chat-composer')
            || element?.closest?.('#graph-assistant-bubble-mic')
            || element?.closest?.('#graph-assistant-spotlight')
        );
    }

    function resolveBackgroundColorFromElement(element) {
        let current = element;
        while (current && current !== document.documentElement) {
            const computed = window.getComputedStyle(current);
            const parsed = parseCssColor(computed.backgroundColor);
            if (parsed && parsed.a > 0.08) {
                return parsed;
            }
            current = current.parentElement;
        }

        const bodyColor = parseCssColor(window.getComputedStyle(document.body).backgroundColor);
        return bodyColor || { r: 255, g: 255, b: 255, a: 1 };
    }

    function relativeLuminance(color) {
        const normalizeChannel = (value) => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        };

        const r = normalizeChannel(color.r || 0);
        const g = normalizeChannel(color.g || 0);
        const b = normalizeChannel(color.b || 0);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function updateFaceTintFromBackdrop() {
        const { shell } = ensureElements();
        const rect = shell.getBoundingClientRect();
        const samplePoints = [
            { x: rect.left + rect.width * 0.18, y: rect.top + rect.height * 0.18 },
            { x: rect.left + rect.width * 0.82, y: rect.top + rect.height * 0.18 },
            { x: rect.left + rect.width * 0.18, y: rect.top + rect.height * 0.82 },
            { x: rect.left + rect.width * 0.82, y: rect.top + rect.height * 0.82 },
            { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 }
        ];

        const luminances = samplePoints.map((point) => {
            const sampleX = clamp(point.x, 1, window.innerWidth - 1);
            const sampleY = clamp(point.y, 1, window.innerHeight - 1);
            const stack = typeof document.elementsFromPoint === 'function'
                ? document.elementsFromPoint(sampleX, sampleY)
                : [];
            const target = stack.find((element) => !isRuntimeOwnedElement(element)) || document.body;
            return relativeLuminance(resolveBackgroundColorFromElement(target));
        });

        const darkest = Math.min(...luminances);
        const average = luminances.reduce((sum, value) => sum + value, 0) / Math.max(1, luminances.length);
        const faceTint = (darkest < 0.42 || average < 0.5) ? '#ffffff' : '#111111';
        document.documentElement.style.setProperty('--graph-assistant-face-tint', faceTint);
    }

    function setDragging(active) {
        const { shell } = ensureElements();
        state.dragging.active = active;
        shell.dataset.dragging = active ? 'true' : 'false';
    }

    function stopTypingAnimation() {
        if (state.speech.typingTimer) {
            clearTimeout(state.speech.typingTimer);
            state.speech.typingTimer = null;
        }
    }

    function renderBubbleText(text) {
        const { bubble, bubbleText } = ensureElements();
        if (!bubble || !bubbleText) return;
        bubbleText.textContent = text || '';
        bubble.dataset.visible = text ? 'true' : 'false';
        window.requestAnimationFrame(positionBubbleNearShell);
    }

    function renderUserBubbleText(text) {
        const { userBubble } = ensureElements();
        if (!userBubble) return;
        userBubble.textContent = text || '';
        userBubble.dataset.visible = text ? 'true' : 'false';
        window.requestAnimationFrame(positionBubbleNearShell);
    }

    function setChatComposerVisible(visible, options = {}) {
        const { chatComposer, chatButton, chatInput } = ensureElements();
        if (!chatComposer || !chatButton) {
            return;
        }
        state.chat.open = Boolean(visible);
        chatComposer.dataset.visible = visible ? 'true' : 'false';
        chatButton.dataset.active = visible ? 'true' : 'false';
        positionBubbleNearShell();
        if (visible && options.focus !== false) {
            window.setTimeout(() => {
                chatInput?.focus();
            }, 20);
        }
    }

    function submitChatComposer() {
        const { chatInput, chatSendButton } = ensureElements();
        const message = `${chatInput?.value || ''}`.trim();
        if (!message || !chatSendButton || chatSendButton.disabled) {
            return;
        }
        emit('chat-submit', { message });
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
            api.clearSpotlight();
            state.interaction.lastTouchAt = Date.now();
            emit('touched', { type: 'pointerdown' });
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

            api.clearSpotlight();
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
        const finalText = `${text || ''}`;
        stopTypingAnimation();
        state.speech.targetText = finalText;
        state.speech.displayedText = '';

        if (!finalText) {
            renderBubbleText('');
            return;
        }

        const typeNextChunk = () => {
            const remaining = state.speech.targetText.slice(state.speech.displayedText.length);
            if (!remaining) {
                state.speech.typingTimer = null;
                return;
            }

            const nextChunkLength = remaining.length > 42 ? 4 : remaining.length > 18 ? 3 : 2;
            state.speech.displayedText += remaining.slice(0, nextChunkLength);
            renderBubbleText(state.speech.displayedText);
            state.speech.typingTimer = setTimeout(typeNextChunk, 12);
        };

        renderBubbleText('');
        typeNextChunk();
    }

    function getSpeechSynthesis() {
        if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
            return null;
        }
        return window.speechSynthesis;
    }

    function pickSpanishVoice() {
        const synth = getSpeechSynthesis();
        if (!synth) {
            return null;
        }

        const voices = synth.getVoices();
        if (!voices.length) {
            return null;
        }

        const preferredLocales = ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-ES'];
        for (const locale of preferredLocales) {
            const exact = voices.find((voice) => `${voice.lang || ''}`.toLowerCase() === locale.toLowerCase());
            if (exact) {
                return exact;
            }
        }

        return voices.find((voice) => `${voice.lang || ''}`.toLowerCase().startsWith('es')) || null;
    }

    function stopAudibleSpeech() {
        const synth = getSpeechSynthesis();
        if (!synth) {
            return;
        }
        if (state.speech.currentUtterance) {
            state.speech.currentUtterance.onend = null;
            state.speech.currentUtterance.onerror = null;
            state.speech.currentUtterance = null;
        }
        if (synth.speaking || synth.pending) {
            synth.cancel();
        }
    }

    function speakAudibly(text, options = {}) {
        const synth = getSpeechSynthesis();
        const normalizedText = `${text || ''}`.trim();
        if (!synth || !normalizedText) {
            return;
        }

        stopAudibleSpeech();

        const utterance = new window.SpeechSynthesisUtterance(normalizedText);
        state.speech.selectedVoice = state.speech.selectedVoice || pickSpanishVoice();
        if (state.speech.selectedVoice) {
            utterance.voice = state.speech.selectedVoice;
            utterance.lang = state.speech.selectedVoice.lang || 'es-CO';
        } else {
            utterance.lang = 'es-CO';
        }
        utterance.rate = Number(options.rate || 1);
        utterance.pitch = Number(options.pitch || 1);
        utterance.volume = Number(options.volume || 1);
        utterance.onend = () => {
            if (state.speech.currentUtterance === utterance) {
                state.speech.currentUtterance = null;
            }
        };
        utterance.onerror = () => {
            if (state.speech.currentUtterance === utterance) {
                state.speech.currentUtterance = null;
            }
        };
        state.speech.currentUtterance = utterance;
        synth.speak(utterance);
    }

    function positionBubbleNearShell() {
        const shell = document.getElementById('graph-assistant-shell');
        const bubble = document.getElementById('graph-assistant-bubble');
        const userBubble = document.getElementById('graph-assistant-user-bubble');
        const micButton = document.getElementById('graph-assistant-bubble-mic');
        const chatButton = document.getElementById('graph-assistant-chat-toggle');
        const chatComposer = document.getElementById('graph-assistant-chat-composer');
        if (!shell || !bubble) {
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

        if (userBubble && userBubble.dataset.visible === 'true') {
            const userRect = userBubble.getBoundingClientRect();
            const userLeft = clamp(rawLeft, padding, Math.max(padding, window.innerWidth - userRect.width - padding));
            const userTop = clamp(rawTop - userRect.height - 12, padding, Math.max(padding, window.innerHeight - userRect.height - padding));
            userBubble.style.left = `${userLeft}px`;
            userBubble.style.top = `${userTop}px`;
        }

        const buttonSize = 42;
        const buttonGap = 10;
        const controlsWidth = (buttonSize * 2) + buttonGap;
        const controlsLeft = clamp(
            rawLeft + (bubbleRect.width / 2) - (controlsWidth / 2),
            padding,
            window.innerWidth - controlsWidth - padding
        );
        const controlsTop = clamp(rawTop + bubbleRect.height - 4, padding, window.innerHeight - buttonSize - padding);

        if (chatButton) {
            chatButton.style.left = `${controlsLeft}px`;
            chatButton.style.top = `${controlsTop}px`;
        }
        if (micButton) {
            micButton.style.left = `${controlsLeft + buttonSize + buttonGap}px`;
            micButton.style.top = `${controlsTop}px`;
        }
        if (chatComposer && chatComposer.dataset.visible === 'true') {
            const composerRect = chatComposer.getBoundingClientRect();
            const composerLeft = clamp(
                rawLeft,
                padding,
                Math.max(padding, window.innerWidth - composerRect.width - padding)
            );
            const composerTop = clamp(
                controlsTop - composerRect.height - 12,
                padding,
                Math.max(padding, window.innerHeight - composerRect.height - padding)
            );
            chatComposer.style.left = `${composerLeft}px`;
            chatComposer.style.top = `${composerTop}px`;
        }
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

    function clearMicLongPressTimer() {
        if (state.mic.longPressTimer) {
            window.clearTimeout(state.mic.longPressTimer);
            state.mic.longPressTimer = null;
        }
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
            const { label, micButton, chatButton, chatInput, chatSendButton } = ensureElements();
            bindDragHandlers();
            document.documentElement.style.setProperty('--graph-assistant-accent', state.options.accentColor);
            document.documentElement.style.setProperty('--graph-assistant-z', `${state.options.zIndex}`);
            if (label) {
                label.textContent = state.options.name || 'Graph';
            }
            if (micButton && micButton.dataset.bound !== 'true') {
                micButton.dataset.bound = 'true';
                micButton.addEventListener('pointerdown', () => {
                    state.mic.longPressTriggered = false;
                    clearMicLongPressTimer();
                    state.mic.longPressTimer = window.setTimeout(() => {
                        state.mic.longPressTriggered = true;
                        emit('voice-button-long-press', {});
                    }, 550);
                });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
                    micButton.addEventListener(eventName, clearMicLongPressTimer);
                });
                micButton.addEventListener('click', (event) => {
                    if (state.mic.longPressTriggered) {
                        event.preventDefault();
                        event.stopPropagation();
                        state.mic.longPressTriggered = false;
                        return;
                    }
                    emit('voice-button', {});
                });
            }
            if (chatButton && chatButton.dataset.bound !== 'true') {
                chatButton.dataset.bound = 'true';
                chatButton.addEventListener('click', () => {
                    setChatComposerVisible(!state.chat.open, { focus: true });
                    emit('chat-toggle', { open: state.chat.open });
                });
            }
            if (chatSendButton && chatSendButton.dataset.bound !== 'true') {
                chatSendButton.dataset.bound = 'true';
                chatSendButton.addEventListener('click', submitChatComposer);
            }
            if (chatInput && chatInput.dataset.bound !== 'true') {
                chatInput.dataset.bound = 'true';
                chatInput.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
                        return;
                    }
                    event.preventDefault();
                    submitChatComposer();
                });
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
            if (options.audible) {
                speakAudibly(text, options);
            }
        },
        clearSpeech() {
            showBubble('');
            stopAudibleSpeech();
        },
        showUserSpeech(text) {
            renderUserBubbleText(text || '');
        },
        clearUserSpeech() {
            renderUserBubbleText('');
        },
        openChatComposer(config = {}) {
            if (!state.mounted) {
                api.mount();
            }
            setChatComposerVisible(true, config);
        },
        closeChatComposer() {
            setChatComposerVisible(false, { focus: false });
        },
        clearChatComposer() {
            const { chatInput } = ensureElements();
            if (chatInput) {
                chatInput.value = '';
            }
        },
        setChatComposerBusy(active) {
            const { chatInput, chatSendButton } = ensureElements();
            if (chatInput) {
                chatInput.disabled = Boolean(active);
            }
            if (chatSendButton) {
                chatSendButton.disabled = Boolean(active);
                chatSendButton.textContent = active ? 'Enviando...' : 'Enviar';
            }
        },
        setVoiceButtonActive(active) {
            const { micButton } = ensureElements();
            if (!micButton) return;
            micButton.dataset.active = active ? 'true' : 'false';
        },
        stopAudibleSpeech() {
            stopAudibleSpeech();
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
