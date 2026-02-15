/**
 * SmartB Event Bus — lightweight pub/sub using native EventTarget API.
 * All inter-module communication flows through this bus.
 *
 * Usage:
 *   SmartBEventBus.on('diagram:rendered', (data) => { ... });
 *   SmartBEventBus.emit('diagram:rendered', { svg });
 *   SmartBEventBus.off('diagram:rendered', handler);
 *   SmartBEventBus.once('diagram:rendered', (data) => { ... });
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

    var SmartBEventBus = {
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

    window.SmartBEventBus = SmartBEventBus;
})();
