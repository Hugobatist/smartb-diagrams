/**
 * SmartCode Event Bus — lightweight pub/sub using native EventTarget API.
 * All inter-module communication flows through this bus.
 *
 * Usage:
 *   SmartCodeEventBus.on('diagram:rendered', (data) => { ... });
 *   SmartCodeEventBus.emit('diagram:rendered', { svg });
 *   SmartCodeEventBus.off('diagram:rendered', handler);
 *   SmartCodeEventBus.once('diagram:rendered', (data) => { ... });
 */
(function() {
    'use strict';

    var target = new EventTarget();

    // Store wrapped handlers so off() can remove the correct listener.
    // WeakMap<originalHandler, Map<eventName, wrappedHandler>>
    var handlerMap = new WeakMap();

    function getWrapped(event, handler) {
        var byEvent = handlerMap.get(handler);
        if (!byEvent) return null;
        return byEvent.get(event) || null;
    }

    function setWrapped(event, handler, wrapped) {
        var byEvent = handlerMap.get(handler);
        if (!byEvent) {
            byEvent = new Map();
            handlerMap.set(handler, byEvent);
        }
        byEvent.set(event, wrapped);
    }

    var SmartCodeEventBus = {
        on: function(event, handler) {
            var wrapped = function(e) { handler(e.detail); };
            setWrapped(event, handler, wrapped);
            target.addEventListener(event, wrapped);
        },
        off: function(event, handler) {
            var wrapped = getWrapped(event, handler);
            if (wrapped) {
                target.removeEventListener(event, wrapped);
            }
        },
        emit: function(event, data) {
            target.dispatchEvent(new CustomEvent(event, { detail: data }));
        },
        once: function(event, handler) {
            var wrapped = function(e) { handler(e.detail); };
            target.addEventListener(event, wrapped, { once: true });
        }
    };

    window.SmartCodeEventBus = SmartCodeEventBus;
})();
