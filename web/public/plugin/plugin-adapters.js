(function () {
    function normalizePathname(value) {
        return `${value || ''}`.trim();
    }

    function getDefaultSuggestions(pathname) {
        if (pathname.includes('/rentacar/reservar.html')) {
            return [
                {
                    id: 'clarity-dates',
                    selector: '.summary-card',
                    title: 'El resumen transmite cierre antes de tiempo',
                    summary: 'El bloque superior se siente definitivo y puede hacer pensar que ya no es facil corregir recogida, devolucion o fechas antes de elegir carro.',
                    evidence: '"No me queda claro si aqui todavia puedo corregir la recogida o si ya perdi ese paso."',
                    opportunity: 'Hacer mas visible la accion para editar el trayecto desde este mismo bloque.',
                    source: 'Observacion de experiencia',
                    priority: 'alta',
                    area: 'Resumen del viaje'
                },
                {
                    id: 'filter-confidence',
                    selector: '.filters-bar',
                    title: 'Los filtros cambian la lista sin suficiente contexto',
                    summary: 'Cuando desaparecen opciones, falta una explicacion inmediata sobre que filtro esta restringiendo la busqueda o como volver al estado anterior.',
                    evidence: '"Movi un filtro y ya no supe que fue lo que oculto las otras opciones."',
                    opportunity: 'Dar feedback mas explicito sobre cambios y filtros activos en lenguaje sencillo.',
                    source: 'Observacion de experiencia',
                    priority: 'media',
                    area: 'Filtros'
                },
                {
                    id: 'price-credit-card',
                    selector: '#vehicle-kia-picanto .price-note',
                    title: 'La condicion de tarjeta llega demasiado tarde',
                    summary: 'La nota esta presente, pero compite con el resto del contenido y puede pasar desapercibida durante la comparacion inicial.',
                    evidence: '"Yo ya iba a reservar y apenas ahi vi que ese valor dependia de tarjeta de credito."',
                    opportunity: 'Convertir esa condicion en una etiqueta mas visible o explicarla antes de la comparacion.',
                    source: 'Observacion de experiencia',
                    priority: 'alta',
                    area: 'Precio del vehiculo'
                },
                {
                    id: 'call-widget-expectation',
                    selector: '#callWidget',
                    title: 'La ayuda humana no explica que ocurrira despues',
                    summary: 'El acceso es visible, pero deja dudas sobre si la llamada es inmediata, en horario laboral o solo una solicitud de contacto.',
                    evidence: '"Le di en llamame, pero no supe si alguien me iba a marcar ya o despues."',
                    opportunity: 'Aclarar tiempo de respuesta y que pasara despues de dejar el numero.',
                    source: 'Observacion de experiencia',
                    priority: 'media',
                    area: 'Ayuda humana'
                }
            ];
        }

        if (pathname.includes('/examples/car-demo')) {
            return [
                {
                    id: 'hero-focus',
                    selector: '#main-banner',
                    title: 'La promesa principal tarda en aterrizar',
                    summary: 'La cabecera tiene mucha presencia visual, pero el beneficio concreto y el siguiente paso quedan un poco lejos del primer barrido visual.',
                    evidence: '"Entendi que alquilan carros, pero tarde en ver exactamente donde empezaba la cotizacion."',
                    opportunity: 'Conectar el hero con una indicacion mas directa hacia el formulario y el valor de respuesta inmediata.',
                    source: 'Observacion de experiencia',
                    priority: 'alta',
                    area: 'Hero principal'
                },
                {
                    id: 'quote-form-anxiety',
                    selector: '#ajax-contact-form',
                    title: 'El formulario pide datos antes de generar confianza',
                    summary: 'El usuario debe interpretar varios campos de fecha, hora y entrega sin una guia breve sobre el orden ideal para diligenciarlos.',
                    evidence: '"Antes de empezar queria saber cuanto me iba a tomar y si podia cotizar sin equivocarme en las fechas."',
                    opportunity: 'Explicar el flujo en una linea corta y dejar mas visibles las reglas criticas de anticipacion.',
                    source: 'Observacion de experiencia',
                    priority: 'alta',
                    area: 'Formulario de cotizacion'
                },
                {
                    id: 'service-hours-visibility',
                    selector: '[data-testid="service-hours-banner"]',
                    title: 'El horario aparece, pero no resuelve la duda completa',
                    summary: 'El banner informa la franja horaria, aunque todavia deja abierto que cambia si el usuario cotiza por fuera de ese horario.',
                    evidence: '"Vi el horario, pero no supe si igual podia reservar en la noche o que pasaba con la entrega."',
                    opportunity: 'Acompanar el horario con una microaclaracion de disponibilidad, respuesta o excepciones.',
                    source: 'Observacion de experiencia',
                    priority: 'media',
                    area: 'Horario de atencion'
                },
                {
                    id: 'fleet-scan',
                    selector: '#second-section',
                    title: 'La seccion de flota comunica variedad, no decision',
                    summary: 'Las categorias ayudan a explorar, pero todavia cuesta entender cual conviene segun tipo de viaje, pasajeros o equipaje.',
                    evidence: '"Vi varias categorias bonitas, pero no cual era la mas conveniente para mi plan."',
                    opportunity: 'Traducir cada categoria a contextos de uso reales para acelerar la eleccion.',
                    source: 'Observacion de experiencia',
                    priority: 'media',
                    area: 'Categorias de vehiculos'
                },
                {
                    id: 'requirements-discovery',
                    selector: '.site-navbar',
                    title: 'Los requisitos estan en navegacion, no en el momento de decision',
                    summary: 'La informacion existe, pero un usuario nuevo puede iniciar la cotizacion sin detectar a tiempo las condiciones de tarjeta o documentacion.',
                    evidence: '"Yo habria querido saber antes si necesitaba tarjeta, no despues de empezar."',
                    opportunity: 'Traer un resumen de requisitos al area de cotizacion o cerca del CTA principal.',
                    source: 'Observacion de experiencia',
                    priority: 'alta',
                    area: 'Requisitos'
                }
            ];
        }

        return [
            {
                id: 'generic-cta-clarity',
                selector: 'main, body',
                title: 'La pagina necesita mas claridad en el siguiente paso',
                summary: 'Un usuario nuevo podria no identificar de inmediato cual es la accion principal para continuar.',
                evidence: '"La pagina se ve bien, pero no supe cual era el siguiente paso recomendado."',
                opportunity: 'Resaltar mejor la accion principal y reducir competencia visual.',
                source: 'Observacion de experiencia',
                priority: 'media',
                area: 'Experiencia general'
            }
        ];
    }

    function createAdapter(config) {
        const adapterConfig = config && typeof config === 'object' ? config : {};
        const baseAdapter = {
            id: adapterConfig.id || adapterConfig.appId || 'default-surface',
            appId: adapterConfig.appId || '',
            capabilities: {
                learning: true,
                execution: true,
                voice: true,
                improvements: true,
                ...(adapterConfig.capabilities || {})
            },
            getDemoMode(context) {
                if (adapterConfig.demoMode !== undefined) {
                    return `${adapterConfig.demoMode || ''}`.trim();
                }
                return `${context?.appId || adapterConfig.appId || ''}`.trim() === 'car-demo'
                    ? 'autopilot'
                    : '';
            },
            decorateContext(context) {
                return {
                    ...context,
                    demoMode: this.getDemoMode(context),
                    capabilities: { ...(this.capabilities || {}) }
                };
            },
            matchesWorkflow(workflow, context) {
                if (!workflow) return false;
                const contextAppId = `${context?.appId || ''}`.trim();
                const workflowAppId = `${workflow.appId || ''}`.trim();
                if (contextAppId && workflowAppId && workflowAppId !== contextAppId) {
                    return false;
                }

                const contextPathname = normalizePathname(context?.sourcePathname);
                if (!contextPathname) {
                    return true;
                }

                return normalizePathname(workflow.sourcePathname) === contextPathname;
            },
            filterWorkflows(workflows, context) {
                return (workflows || []).filter((workflow) => this.matchesWorkflow(workflow, context));
            },
            getImprovementSuggestions(context) {
                const pathname = normalizePathname(context?.sourcePathname || window.location.pathname);
                return getDefaultSuggestions(pathname);
            }
        };

        return {
            ...baseAdapter,
            ...adapterConfig
        };
    }

    function resolve(config) {
        if (config?.__resolvedAdapter === true) {
            return config;
        }
        if (config?.adapter && config.adapter.__resolvedAdapter === true) {
            return config.adapter;
        }
        if (config?.adapter && typeof config.adapter === 'object') {
            return {
                __resolvedAdapter: true,
                ...createAdapter({
                    ...(config.adapter || {}),
                    appId: config.adapter.appId || config.appId || ''
                })
            };
        }

        return {
            __resolvedAdapter: true,
            ...createAdapter({
                appId: config?.appId || '',
                assistantProfile: config?.assistantProfile || null
            })
        };
    }

    window.GraphPluginAdapters = {
        createAdapter,
        normalizePathname,
        resolve
    };
})();
