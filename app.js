(function () {
  'use strict';

  var LETTER_LABELS = {
    discharge: 'discharge summary',
    referral: 'referral letter',
    clinic: 'clinic letter',
  };

  // ---------------------------------------------------------------
  // Hero: one orchestrated typing reveal, shown once on load.
  // ---------------------------------------------------------------
  var heroLetter =
    'Dear Dr. [GP name],\n\n' +
    'Re: [Patient name], DOB [not documented]\n\n' +
    'Thank you for continuing this patient’s care.\n\n' +
    'This 68-year-old woman was admitted with community-acquired ' +
    'pneumonia and commenced on intravenous co-amoxiclav. She became ' +
    'afebrile by day 2, with a falling CRP, and was stepped down to ' +
    'oral antibiotics on day 3 [not documented: course length].\n\n' +
    'She is now mobilising independently with oxygen saturations of ' +
    '97% on air and is fit for discharge today.\n\n' +
    'Please could your practice review her in one week.\n\n' +
    'Yours sincerely,\n[Doctor name]\n(draft — pending review)';

  function typeHero() {
    var target = document.getElementById('hero-typed');
    var cursor = document.getElementById('hero-cursor');
    if (!target) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      target.textContent = heroLetter;
      if (cursor) cursor.style.display = 'none';
      return;
    }

    var i = 0;
    var speed = 12; // ms per character — fast enough not to feel like a stunt
    function step() {
      if (i <= heroLetter.length) {
        target.textContent = heroLetter.slice(0, i);
        i += 2;
        setTimeout(step, speed);
      } else if (cursor) {
        cursor.style.display = 'none';
      }
    }
    step();
  }

  // ---------------------------------------------------------------
  // Letter-type tabs
  // ---------------------------------------------------------------
  var currentType = 'discharge';
  var tabs = document.querySelectorAll('.letter-type-tabs button');

  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentType = btn.getAttribute('data-type');
    });
  });

  // ---------------------------------------------------------------
  // Draft mode selector: template, on-device AI (WebLLM), or Claude
  // ---------------------------------------------------------------
  var modeSelect = document.getElementById('mode-select');
  var apiKeyWrap = document.getElementById('api-key-wrap');
  var webllmNote = document.getElementById('webllm-note');
  var progressWrap = document.getElementById('webllm-progress');
  var progressBar = document.getElementById('webllm-bar');
  var modePill = document.getElementById('mode-pill');

  var PILL_TEXT = {
    template: 'Template mode',
    webllm: 'On-device AI (small model)',
    claude: 'AI mode (Claude)'
  };

  function syncModeUi() {
    var mode = modeSelect.value;
    apiKeyWrap.classList.toggle('visible', mode === 'claude');
    webllmNote.hidden = mode !== 'webllm';
    modePill.textContent = PILL_TEXT[mode];
    modePill.classList.toggle('ai', mode !== 'template');
  }

  modeSelect.addEventListener('change', syncModeUi);
  syncModeUi();

  // ---------------------------------------------------------------
  // Template-mode generator (no API key, no network call).
  // A straightforward, rule-based formatter: it does not understand
  // the findings, it just arranges them into the right shape for
  // the chosen letter type. Clearly different in quality from AI
  // mode, and labelled as such.
  // ---------------------------------------------------------------
  function parseBullets(raw) {
    return raw
      .split('\n')
      .map(function (line) {
        return line.replace(/^[-*•]\s*/, '').trim();
      })
      .filter(Boolean);
  }

  function templateLetter(type, patientInfo, recipient, bullets) {
    var points = parseBullets(bullets);
    if (!points.length) return null;

    var body = points.map(function (p) {
      return '  • ' + p;
    }).join('\n');

    var heading, opening, closing;

    if (type === 'referral') {
      heading = 'REFERRAL LETTER';
      opening = recipient
        ? 'Re: referral regarding the patient below, for the attention of ' + recipient + '.'
        : 'Re: referral regarding the patient below.';
      closing = 'I would be grateful for your assessment. Please do not hesitate to contact me if any further information would help.';
    } else if (type === 'clinic') {
      heading = 'CLINIC LETTER';
      opening = recipient
        ? 'Re: clinic review, copied to ' + recipient + '.'
        : 'Re: clinic review.';
      closing = 'Follow-up as above. Please let me know if anything changes in the meantime.';
    } else {
      heading = 'DISCHARGE SUMMARY';
      opening = recipient
        ? 'Re: discharge summary, for the attention of ' + recipient + '.'
        : 'Re: discharge summary.';
      closing = 'Please continue ongoing care as above. Do get in touch if anything is unclear.';
    }

    var patientLine = patientInfo
      ? 'Patient: ' + patientInfo
      : 'Patient: [not documented]';

    return (
      heading + '\n' +
      '[DRAFT — TEMPLATE MODE — NOT AI-GENERATED]\n\n' +
      patientLine + '\n' +
      opening + '\n\n' +
      'Findings and course:\n' +
      body + '\n\n' +
      closing + '\n\n' +
      'Yours sincerely,\n[Doctor name]\n(draft — pending review)'
    );
  }

  // ---------------------------------------------------------------
  // Prompts shared by both AI modes
  // ---------------------------------------------------------------
  function buildSystemPrompt(type) {
    var label = LETTER_LABELS[type] || 'clinical letter';
    return (
      'You are a careful clinical documentation assistant helping a doctor draft a ' + label + '.\n\n' +
      'Rules:\n' +
      '- Use only the information given to you. Never invent clinical findings, results, names, dates, or history that were not provided.\n' +
      '- If information needed for a standard section is missing, write "[not documented]" rather than guessing.\n' +
      '- Use clear, professional, standard UK clinical letter style and structure.\n' +
      '- This draft will always be reviewed, edited, and approved by a doctor before use. You are producing a first draft only, not a final clinical document.\n' +
      '- Do not include any real patient-identifiable information beyond what is explicitly given. This is a demonstration tool and inputs should already be fictional or anonymised.\n' +
      '- Output only the letter text, with no preamble like "Here is the letter" and no markdown formatting.'
    );
  }

  function buildUserPrompt(type, patientInfo, recipient, bullets) {
    var label = LETTER_LABELS[type] || 'clinical letter';
    return [
      'Draft a ' + label + '.',
      patientInfo ? 'Patient details: ' + patientInfo : '',
      recipient ? 'Addressed to / recipient context: ' + recipient : '',
      'Clinical bullet points to incorporate:',
      bullets
    ].filter(Boolean).join('\n\n');
  }

  // ---------------------------------------------------------------
  // On-device AI (WebLLM). The library and model are only downloaded
  // if the visitor picks this mode, and are cached by the browser so
  // later drafts start quickly. Model names are checked against the
  // library's own list at run time, in order of preference.
  // ---------------------------------------------------------------
  var WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm';
  var WEBLLM_MODEL_PREFERENCE = [
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    'Llama-3.2-3B-Instruct-q4f16_1-MLC'
  ];
  var webllmEnginePromise = null;

  function setProgress(fraction) {
    progressWrap.hidden = false;
    progressBar.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  }

  function getWebllmEngine() {
    if (webllmEnginePromise) return webllmEnginePromise;

    webllmEnginePromise = (async function () {
      if (!('gpu' in navigator)) {
        throw new Error('This browser does not support WebGPU, which on-device AI needs. Try current Chrome or Edge on a computer, or choose Template or Claude instead.');
      }
      statusEl.textContent = 'Loading the AI library…';
      var webllm;
      try {
        webllm = await import(WEBLLM_URL);
      } catch (e) {
        throw new Error('Could not download the AI library. Check your internet connection and try again.');
      }

      var available = (webllm.prebuiltAppConfig && webllm.prebuiltAppConfig.model_list || [])
        .map(function (m) { return m.model_id; });
      var modelId = WEBLLM_MODEL_PREFERENCE.filter(function (id) {
        return available.indexOf(id) !== -1;
      })[0];
      if (!modelId) {
        throw new Error('None of the expected models are available in this version of WebLLM.');
      }

      statusEl.textContent = 'Downloading the model (first time only)…';
      return webllm.CreateMLCEngine(modelId, {
        initProgressCallback: function (report) {
          setProgress(report.progress || 0);
          if (report.text) statusEl.textContent = report.text;
        }
      });
    })();

    // If loading fails, let the visitor try again instead of staying stuck.
    webllmEnginePromise.catch(function () { webllmEnginePromise = null; });
    return webllmEnginePromise;
  }

  function isModelDroppedError(err) {
    return /model not loaded|reload|device.*lost|context lost|out of memory/i.test(
      (err && err.message) || ''
    );
  }

  async function runWebllmOnce(type, patientInfo, recipient, bullets) {
    var engine = await getWebllmEngine();
    progressWrap.hidden = true;
    statusEl.textContent = 'Writing the draft…';
    var reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: buildSystemPrompt(type) },
        { role: 'user', content: buildUserPrompt(type, patientInfo, recipient, bullets) }
      ],
      temperature: 0.2,
      max_tokens: 900
    });
    return reply.choices[0].message.content;
  }

  async function generateWithWebllm(type, patientInfo, recipient, bullets) {
    try {
      return await runWebllmOnce(type, patientInfo, recipient, bullets);
    } catch (err) {
      if (!isModelDroppedError(err)) throw err;
      // The browser dropped the model (usually low memory). Reload once.
      webllmEnginePromise = null;
      statusEl.textContent = 'The model stopped, reloading it…';
      try {
        return await runWebllmOnce(type, patientInfo, recipient, bullets);
      } catch (err2) {
        webllmEnginePromise = null;
        throw new Error(
          'The on-device model stopped, which usually means this device ran out of memory. ' +
          'Close other tabs and apps, refresh the page and try again, or choose Template or Claude instead.'
        );
      }
    }
  }

  // ---------------------------------------------------------------
  // Form handling
  // ---------------------------------------------------------------
  var form = document.getElementById('generate-form');
  var output = document.getElementById('letter-output');
  var errorBox = document.getElementById('error-msg');
  var generateBtn = document.getElementById('generate-btn');
  var statusEl = document.getElementById('generating-status');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('visible');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.remove('visible');
  }

  function setOutput(text) {
    output.textContent = text;
    output.classList.remove('empty');
  }

  function setBusy(isBusy, label) {
    generateBtn.disabled = isBusy;
    statusEl.textContent = isBusy ? (label || 'Generating…') : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var patientInfo = document.getElementById('patient-info').value.trim();
    var recipient = document.getElementById('recipient').value.trim();
    var bullets = document.getElementById('bullets').value.trim();

    if (!bullets) {
      showError('Add at least one clinical finding first.');
      return;
    }

    var mode = modeSelect.value;

    if (mode === 'template') {
      setOutput(templateLetter(currentType, patientInfo, recipient, bullets));
      return;
    }

    if (mode === 'webllm') {
      setBusy(true, 'Starting on-device AI…');
      generateWithWebllm(currentType, patientInfo, recipient, bullets)
        .then(function (text) {
          setBusy(false);
          progressWrap.hidden = true;
          setOutput(text);
        })
        .catch(function (err) {
          setBusy(false);
          progressWrap.hidden = true;
          showError((err && err.message) || 'On-device AI could not start. Try Template or Claude instead.');
        });
      return;
    }

    var apiKey = document.getElementById('api-key').value.trim();
    if (!apiKey) {
      showError('Enter a Claude API key, or choose Template or on-device AI instead.');
      return;
    }

    setBusy(true, 'Asking Claude…');

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: buildSystemPrompt(currentType),
        messages: [{ role: 'user', content: buildUserPrompt(currentType, patientInfo, recipient, bullets) }]
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        setBusy(false);
        if (!result.ok) {
          var msg = result.data && result.data.error && result.data.error.message;
          showError(msg || 'Something went wrong generating the draft.');
          return;
        }
        var text = (result.data.content || []).map(function (b) { return b.text || ''; }).join('');
        setOutput(text);
      })
      .catch(function () {
        setBusy(false);
        showError('Could not reach Claude. Check your internet connection and that the API key is correct.');
      });
  });

  document.getElementById('clear-btn').addEventListener('click', function () {
    output.textContent = 'Your draft will appear here once you generate one.';
    output.classList.add('empty');
    clearError();
  });

  document.getElementById('copy-btn').addEventListener('click', function () {
    var text = output.textContent;
    if (output.classList.contains('empty')) return;
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('copy-btn');
      var original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.textContent = original;
      }, 1500);
    });
  });

  typeHero();
})();
