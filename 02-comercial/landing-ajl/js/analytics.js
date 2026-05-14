// AJL Nutricion — Analytics
// GA4 custom events + Meta Pixel events

(function () {
  'use strict';

  function sendGA4(eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  }

  function sendFB(eventName, params) {
    if (typeof fbq === 'function') {
      fbq('track', eventName, params || {});
    }
  }

  // whatsapp_click — fires on any CTA button click
  function trackWhatsAppClicks() {
    document.querySelectorAll('.js-whatsapp').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var section = btn.getAttribute('data-section') || 'unknown';
        sendGA4('whatsapp_click', { section: section });
        sendFB('Lead', { content_name: section });
      });
    });
  }

  // video_play — fires when hero video starts playing
  function trackVideoPlay() {
    var video = document.querySelector('#hero video');
    if (video) {
      video.addEventListener('play', function () {
        sendGA4('video_play', { section: 'hero' });
      }, { once: true });
    }
  }

  // catalog_view — fires once when plans section enters viewport
  function trackCatalogView() {
    var plans = document.getElementById('plans');
    if (!plans || !window.IntersectionObserver) return;
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        sendGA4('catalog_view');
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(plans);
  }

  // plan_click — fires on specific plan CTA clicks
  function trackPlanClicks() {
    document.querySelectorAll('.js-whatsapp[data-section^="plan-"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendGA4('plan_click', { plan: btn.getAttribute('data-section') });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    trackWhatsAppClicks();
    trackVideoPlay();
    trackCatalogView();
    trackPlanClicks();
  });
})();