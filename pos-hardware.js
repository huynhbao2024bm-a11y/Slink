(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SlinkPosHardware = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  var audioCtx = null;
  var androidBridgeFn = null;

  function setAndroidBridge(fn) {
    androidBridgeFn = typeof fn === 'function' ? fn : null;
  }

  function toBigIntVnd(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 0n;
      return BigInt(Math.trunc(value));
    }
    var cleaned = String(value == null ? '' : value).trim().replace(/[^\d-]/g, '');
    if (!cleaned || cleaned === '-') return 0n;
    try {
      return BigInt(cleaned);
    } catch (_) {
      return 0n;
    }
  }

  function readThreeDigits(num, showZeroHundred) {
    var hundred = Math.floor(num / 100);
    var ten = Math.floor((num % 100) / 10);
    var unit = num % 10;
    var parts = [];

    if (hundred > 0 || showZeroHundred) {
      parts.push(DIGIT_WORDS[hundred] + ' trăm');
    }

    if (ten > 1) {
      parts.push(DIGIT_WORDS[ten] + ' mươi');
      if (unit === 1) {
        parts.push('mốt');
      } else if (unit === 4) {
        parts.push('tư');
      } else if (unit === 5) {
        parts.push('lăm');
      } else if (unit > 0) {
        parts.push(DIGIT_WORDS[unit]);
      }
    } else if (ten === 1) {
      parts.push('mười');
      if (unit === 5) {
        parts.push('lăm');
      } else if (unit > 0) {
        parts.push(DIGIT_WORDS[unit]);
      }
    } else if (unit > 0) {
      if (parts.length > 0) {
        parts.push('lẻ');
      }
      parts.push(DIGIT_WORDS[unit]);
    }

    return parts.join(' ');
  }

  function readBelowBillion(num, forceZeroHundred) {
    var n = Number(num);
    if (n === 0) return '';
    var millions = Math.floor(n / 1000000);
    var thousands = Math.floor((n % 1000000) / 1000);
    var ones = n % 1000;
    var parts = [];

    if (millions > 0) {
      parts.push(readThreeDigits(millions, forceZeroHundred) + ' triệu');
    }
    if (thousands > 0) {
      parts.push(readThreeDigits(thousands, forceZeroHundred || millions > 0) + ' nghìn');
    }
    if (ones > 0) {
      parts.push(readThreeDigits(ones, forceZeroHundred || millions > 0 || thousands > 0));
    }
    return parts.join(' ');
  }

  function readPositiveBigInt(n) {
    if (n === 0n) return 'không';
    var BILLION = 1000000000n;
    var groups = [];
    var cur = n;
    while (cur > 0n) {
      groups.push(Number(cur % BILLION));
      cur = cur / BILLION;
    }

    var parts = [];
    for (var i = groups.length - 1; i >= 0; i--) {
      var val = groups[i];
      if (val === 0) continue;
      var hasHigher = i < groups.length - 1;
      var chunkText = readBelowBillion(val, hasHigher);
      if (i > 0) {
        var tySuffix = '';
        for (var k = 0; k < i; k++) {
          tySuffix += (tySuffix ? ' ' : '') + 'tỷ';
        }
        parts.push(chunkText + ' ' + tySuffix);
      } else {
        parts.push(chunkText);
      }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function formatVndVietnameseSpeech(amountVnd) {
    var n = toBigIntVnd(amountVnd);
    if (n === 0n) return 'không đồng';
    if (n < 0n) {
      return 'âm ' + readPositiveBigInt(-n) + ' đồng';
    }
    return readPositiveBigInt(n) + ' đồng';
  }

  function buildReceivedSpeechText(amountVnd, prefix) {
    var head = prefix ? String(prefix).trim() : 'Đã nhận';
    return head + ' ' + formatVndVietnameseSpeech(amountVnd);
  }

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    var Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return null;
    try {
      audioCtx = new Ctx();
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function playToneSequence(notes) {
    var ctx = getAudioContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(function () {});
      }
      var now = ctx.currentTime;
      for (var i = 0; i < notes.length; i++) {
        var note = notes[i];
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.setValueAtTime(note.freq, now + (note.offset || 0));
        var start = now + (note.offset || 0);
        var dur = note.duration || 0.1;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(note.gain || 0.14, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.01);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function playScanBeep(kind) {
    if (kind === 'error') {
      return playToneSequence([
        { freq: 340, offset: 0, duration: 0.12, gain: 0.14, type: 'triangle' },
        { freq: 260, offset: 0.13, duration: 0.16, gain: 0.14, type: 'triangle' },
      ]);
    }
    return playToneSequence([
      { freq: 1480, offset: 0, duration: 0.065, gain: 0.12, type: 'sine' },
    ]);
  }

  function playChime() {
    return playToneSequence([
      { freq: 1046.5, offset: 0, duration: 0.11, gain: 0.14, type: 'sine' },
      { freq: 1318.5, offset: 0.09, duration: 0.14, gain: 0.15, type: 'sine' },
      { freq: 1568.0, offset: 0.18, duration: 0.22, gain: 0.16, type: 'sine' },
    ]);
  }

  function speakWebSpeech(text) {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        return false;
      }
      window.speechSynthesis.cancel();
      var utt = new SpeechSynthesisUtterance(String(text || ''));
      utt.lang = 'vi-VN';
      utt.rate = 1.0;
      utt.pitch = 1.0;
      window.speechSynthesis.speak(utt);
      return true;
    } catch (_) {
      return false;
    }
  }

  function playTingTing(amountVnd, options) {
    var opts = options || {};
    var text = opts.text ? String(opts.text) : buildReceivedSpeechText(amountVnd, opts.prefix);
    var chime = opts.chime !== false;

    if (androidBridgeFn) {
      return Promise.resolve()
        .then(function () {
          return androidBridgeFn({ type: 'speak', text: text, chime: chime });
        })
        .then(function (res) {
          if (res && res.status === 'ok') return { channel: 'android', text: text };
          if (chime) playChime();
          speakWebSpeech(text);
          return { channel: 'web', text: text };
        })
        .catch(function () {
          if (chime) playChime();
          speakWebSpeech(text);
          return { channel: 'web', text: text };
        });
    }

    if (chime) playChime();
    var spoke = speakWebSpeech(text);
    return Promise.resolve({ channel: spoke ? 'web-speech' : 'web-chime', text: text });
  }

  function setScreenBrightness(level) {
    var numeric = Number(level);
    var normalized = Number.isFinite(numeric)
      ? (numeric < 0 ? -1 : Math.max(0, Math.min(1, numeric)))
      : -1;
    if (!androidBridgeFn) {
      return Promise.resolve({ status: 'noop', level: normalized });
    }
    return Promise.resolve()
      .then(function () {
        return androidBridgeFn({ type: 'screenBrightness', level: normalized });
      })
      .catch(function () {
        return { status: 'error', level: normalized };
      });
  }

  function vibrate(ms) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        return navigator.vibrate(ms == null ? 45 : ms);
      }
    } catch (_) {}
    return false;
  }

  function createContinuousScanner(options) {
    var opts = options || {};
    var cooldownMs = Number(opts.cooldownMs) > 0 ? Number(opts.cooldownMs) : 1100;
    var continuous = opts.continuous !== false;
    var lastCode = '';
    var lastAt = 0;

    return {
      isContinuous: function () {
        return continuous;
      },
      setContinuous: function (next) {
        continuous = Boolean(next);
      },
      resetCooldown: function () {
        lastCode = '';
        lastAt = 0;
      },
      accept: function (rawCode, nowMs) {
        var code = String(rawCode == null ? '' : rawCode).trim();
        if (!code) return { accepted: false, reason: 'empty', code: '' };
        var now = typeof nowMs === 'number' ? nowMs : Date.now();
        if (code === lastCode && now - lastAt < cooldownMs) {
          return { accepted: false, reason: 'cooldown', code: code, remainingMs: cooldownMs - (now - lastAt) };
        }
        lastCode = code;
        lastAt = now;
        return { accepted: true, code: code, continuous: continuous };
      },
    };
  }

  return {
    setAndroidBridge: setAndroidBridge,
    formatVndVietnameseSpeech: formatVndVietnameseSpeech,
    buildReceivedSpeechText: buildReceivedSpeechText,
    playScanBeep: playScanBeep,
    playChime: playChime,
    playTingTing: playTingTing,
    setScreenBrightness: setScreenBrightness,
    vibrate: vibrate,
    createContinuousScanner: createContinuousScanner,
  };
});
