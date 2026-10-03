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
  // AI mode toggle
  // ---------------------------------------------------------------
  var aiToggle = document.getElementById('ai-mode-toggle');
  var apiKeyWrap = document.getElementById('api-key-wrap');
  var modePill = document.getElementById('mode-pill');

  function syncModeUi() {
    var on = aiToggle.checked;
    apiKeyWrap.classList.toggle('visible', on);
    modePill.textContent = on ? 'AI mode (Claude)' : 'Template mode';
    modePill.classList.toggle('ai', on);
  }

  aiToggle.addEventListener('change', syncModeUi);
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

    if (!aiToggle.checked) {
      var letter = templateLetter(currentType, patientInfo, recipient, bullets);
      setOutput(letter);
      return;
    }

    var apiKey = document.getElementById('api-key').value.trim();
    if (!apiKey) {
      showError('Enter a Claude API key, or turn off AI mode to use the template instead.');
      return;
    }

    setBusy(true, 'Asking Claude…');

    var label = LETTER_LABELS[currentType] || 'clinical letter';
    var systemPrompt =
      'You are a careful clinical documentation assistant helping a doctor draft a ' + label + '.\n\n' +
      'Rules:\n' +
      '- Use only the information given to you. Never invent clinical findings, results, names, dates, or history that were not provided.\n' +
      '- If information needed for a standard section is missing, write "[not documented]" rather than guessing.\n' +
      '- Use clear, professional, standard UK clinical letter style and structure.\n' +
      '- This draft will always be reviewed, edited, and approved by a doctor before use. You are producing a first draft only, not a final clinical document.\n' +
      '- Do not include any real patient-identifiable information beyond what is explicitly given. This is a demonstration tool and inputs should already be fictional or anonymised.\n' +
      '- Output only the letter text, with no preamble like "Here is the letter" and no markdown formatting.';
    var userPrompt = [
      'Draft a ' + label + '.',
      patientInfo ? 'Patient details: ' + patientInfo : '',
      recipient ? 'Addressed to / recipient context: ' + recipient : '',
      'Clinical bullet points to incorporate:',
      bullets
    ].filter(Boolean).join('\n\n');

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
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
