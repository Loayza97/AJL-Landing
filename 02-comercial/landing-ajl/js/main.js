// AJL Nutricion — Main JS
// UTM capture + WhatsApp link builder

(function () {
  'use strict';

  // --- Config ---
  var WA_NUMBER = '51XXXXXXXXX'; // TODO: Replace with real number
  var WA_BASE = 'https://wa.me/' + WA_NUMBER;

  // --- UTM capture ---
  function getUtmSource() {
    var params = new URLSearchParams(window.location.search);
    return params.get('utm_source') || 'directo';
  }

  // --- WhatsApp message builder ---
  function buildWaMessage(section) {
    var source = getUtmSource();
    var messages = {
      'hero': 'Hola! Me interesa un plan nutricional. Vengo de: ' + source,
      'plan-transformacion': 'Hola! Me interesa el plan Transformacion (S/600). Vengo de: ' + source,
      'plan-constancia': 'Hola! Me interesa el plan Constancia (S/440). Vengo de: ' + source,
      'plan-acompanamiento': 'Hola! Me interesa el plan Acompanamiento (S/320). Vengo de: ' + source,
      'plan-basico': 'Hola! Me interesa el plan Basico (S/250). Vengo de: ' + source,
      'stepdown': 'Hola! Quiero agendar una evaluacion (S/80). Vengo de: ' + source,
      'cta-final': 'Hola! Quiero informacion sobre los planes nutricionales. Vengo de: ' + source,
    };
    return messages[section] || messages['cta-final'];
  }

  function buildWaUrl(section) {
    return WA_BASE + '?text=' + encodeURIComponent(buildWaMessage(section));
  }

  // --- Initialize WhatsApp links ---
  function initWhatsAppLinks() {
    var buttons = document.querySelectorAll('.js-whatsapp');
    buttons.forEach(function (btn) {
      var section = btn.getAttribute('data-section') || 'cta-final';
      btn.href = buildWaUrl(section);
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
    });
  }

  document.addEventListener('DOMContentLoaded', initWhatsAppLinks);
})();
