/* ==========================================================
   Interrogation d'Aikido
   ----------------------------------------------------------
   Base de données : techniques.json, liste d'objets
     { "attaque": "...", "defense": "...", "kyu": 5, "indication": "..." }

   Vidéo d'une technique : <VIDEO_DIR><attaque> - <defense>.mp4
   ========================================================== */

(() => {
  'use strict';

  /* ---------- Configuration ---------- */

  const CONFIG = {
    JSON_URL: 'techniques.json',   // base de techniques
    VIDEO_DIR: 'videos/',          // dossier des vidéos, sur le serveur
    VIDEO_EXT: '.mp4',
    DEFAULT_MAX_QUESTIONS: 16,
  };

  /* ---------- Accès au DOM ---------- */

  const $ = (id) => document.getElementById(id);

  const els = {
    screens: {
      setup: $('screen-setup'),
      quiz: $('screen-quiz'),
      report: $('screen-report'),
    },
    // préparation
    loadStatus: $('load-status'),
    loadError: $('load-error'),
    loadErrorMsg: $('load-error-msg'),
    jsonFile: $('json-file'),
    form: $('setup-form'),
    groups: {
      attaque: $('group-attaque'),
      defense: $('group-defense'),
      kyu: $('group-kyu'),
    },
    maxQuestions: $('max-questions'),
    matchInfo: $('match-info'),
    btnStart: $('btn-start'),
    // interrogation
    ringFill: $('ring-fill'),
    remaining: $('remaining'),
    remainingText: $('remaining-text'),
    progressText: $('progress-text'),
    statusBadge: $('status-badge'),
    btnStop: $('btn-stop'),
    qAttaque: $('q-attaque'),
    qDefense: $('q-defense'),
    qKyu: $('q-kyu'),
    video: $('video'),
    videoMsg: $('video-msg'),
    videoMsgFile: $('video-msg-file'),
    indicationBox: $('indication-box'),
    indicationText: $('indication-text'),
    btnOk: $('btn-ok'),
    btnWork: $('btn-work'),
    btnPlay: $('btn-play'),
    btnIndication: $('btn-indication'),
    btnNext: $('btn-next'),
    // rapport
    reportDate: $('report-date'),
    reportFilters: $('report-filters'),
    reportSummary: $('report-summary'),
    reportNote: $('report-note'),
    reportBody: $('report-body'),
    btnPrint: $('btn-print'),
    btnRetry: $('btn-retry'),
    btnNew: $('btn-new'),
  };

  /* ---------- État ---------- */

  const app = {
    techniques: [],
    /*
      session = {
        items:  [{ tech, status }]   status : null | 'ok' | 'travail'
        index:  numéro de la question en cours
        date:   Date de début
        description: texte des filtres
        results: [{ tech, ok }]      renseigné à la fin
        stopped: true si l'interrogation a été arrêtée avant la fin
      }
    */
    session: null,
  };

  const RING_LENGTH = 2 * Math.PI * 30; // rayon du cercle SVG = 30

  /* ---------- Utilitaires ---------- */

  const plural = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`;

  const kyuLabel = (k) => {
    const n = Number(k);
    if (!Number.isFinite(n)) return 'Kyu non précisé';
    return n === 1 ? '1er kyu' : `${n}e kyu`;
  };

  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const videoFileName = (t) => `${t.attaque} - ${t.defense}${CONFIG.VIDEO_EXT}`;
  const videoUrl = (t) => CONFIG.VIDEO_DIR + encodeURIComponent(videoFileName(t));

  function show(name) {
    for (const [key, section] of Object.entries(els.screens)) {
      section.hidden = key !== name;
    }
    window.scrollTo(0, 0);
    if (name !== 'quiz') {
      const title = els.screens[name].querySelector('h2');
      if (title) title.focus({ preventScroll: true });
    }
  }

  /* ---------- Chargement de la base ---------- */

  function normalize(data) {
    const list = Array.isArray(data)
      ? data
      : data && Array.isArray(data.techniques) ? data.techniques : [];

    return list
      .map((e) => ({
        attaque: String(e.attaque ?? e.Attaque ?? '').trim(),
        defense: String(e.defense ?? e['défense'] ?? e.Defense ?? '').trim(),
        kyu: Number(e.kyu),
        indication: String(e.indication ?? '').trim(),
      }))
      .filter((t) => t.attaque && t.defense);
  }

  function setTechniques(data) {
    const techniques = normalize(data);
    if (techniques.length === 0) {
      throw new Error('Le fichier ne contient aucune technique valide (champs attendus : attaque, defense, kyu, indication).');
    }
    app.techniques = techniques;
    els.loadError.hidden = true;
    els.loadStatus.hidden = true;
    buildFilters();
    els.form.hidden = false;
    updateMatchInfo();
  }

  function showLoadError(message) {
    els.loadStatus.hidden = true;
    els.form.hidden = true;
    els.loadErrorMsg.textContent = message;
    els.loadError.hidden = false;
  }

  async function init() {
    els.maxQuestions.value = CONFIG.DEFAULT_MAX_QUESTIONS;
    try {
      const res = await fetch(CONFIG.JSON_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`erreur HTTP ${res.status}`);
      setTechniques(await res.json());
    } catch (err) {
      showLoadError(
        `Impossible de charger « ${CONFIG.JSON_URL} » (${err.message}). ` +
        'Ouvrez la page depuis un serveur web (et non directement depuis le disque), ' +
        'ou choisissez le fichier JSON manuellement.'
      );
    }
  }

  els.jsonFile.addEventListener('change', () => {
    const file = els.jsonFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setTechniques(JSON.parse(reader.result));
      } catch (err) {
        showLoadError(`Fichier illisible : ${err.message}`);
      }
    };
    reader.onerror = () => showLoadError('Le fichier n’a pas pu être lu.');
    reader.readAsText(file);
  });

  /* ---------- Filtres ---------- */

  function buildChipGroup(container, group, values, labelFn = String) {
    container.replaceChildren();
    for (const value of values) {
      const label = document.createElement('label');
      
      label.className = 'chip';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(value);
      input.dataset.group = group;

      const text = document.createElement('span');
      text.textContent = labelFn(value);
        console.log("add elem: ", text.textContent);
      label.append(input, text);
      container.append(label);
    }
  }

  function buildFilters() {
    const unique = (key) => [...new Set(app.techniques.map((t) => t[key]))];

    buildChipGroup(els.groups.attaque, 'attaque', unique('attaque').sort(collator.compare));
    buildChipGroup(els.groups.defense, 'defense', unique('defense').sort(collator.compare));
    console.log(els.groups.defense)

    const kyus = unique('kyu').filter(Number.isFinite).sort((a, b) => b - a);
    buildChipGroup(els.groups.kyu, 'kyu', kyus, kyuLabel);
  }

  function readFilters() {
    const selected = (group) => new Set(
      [...els.form.querySelectorAll(`input[data-group="${group}"]:checked`)].map((i) => i.value)
    );
    return { attaque: selected('attaque'), defense: selected('defense'), kyu: selected('kyu') };
  }

  function readMax() {
    const n = parseInt(els.maxQuestions.value, 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  }

  function matches(t, f) {
    return (f.attaque.size === 0 || f.attaque.has(t.attaque))
        && (f.defense.size === 0 || f.defense.has(t.defense))
        && (f.kyu.size === 0 || f.kyu.has(String(t.kyu)));
  }

  function describeFilters(f, max) {
    const parts = [];
    if (f.attaque.size) parts.push(`Attaque : ${[...f.attaque].join(', ')}`);
    if (f.defense.size) parts.push(`Défense : ${[...f.defense].join(', ')}`);
    if (f.kyu.size) parts.push(`Kyu : ${[...f.kyu].map(Number).sort((a, b) => b - a).join(', ')}`);
    if (Number.isFinite(max)) parts.push(`Maximum : ${plural(max, 'question', 'questions')}`);
    return parts.length ? parts.join(' ; ') : 'Aucun filtre';
  }

  function updateMatchInfo() {
    const pool = app.techniques.filter((t) => matches(t, readFilters()));
    const n = pool.length;

    if (n === 0) {
      els.matchInfo.textContent = 'Aucune technique ne correspond à ces filtres.';
      els.btnStart.disabled = true;
      return;
    }

    const questions = Math.min(n, readMax());
    els.matchInfo.textContent =
      `${plural(n, 'technique correspond', 'techniques correspondent')} aux filtres. ` +
      `L'interrogation portera sur ${plural(questions, 'question', 'questions')}.`;
    els.btnStart.disabled = false;
  }

  els.form.addEventListener('change', updateMatchInfo);
  els.maxQuestions.addEventListener('input', updateMatchInfo);

  els.form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear]');
    if (!button) return;
    els.form
      .querySelectorAll(`input[data-group="${button.dataset.clear}"]`)
      .forEach((input) => { input.checked = false; });
    updateMatchInfo();
  });

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const filters = readFilters();
    const max = readMax();
    const pool = shuffle(app.techniques.filter((t) => matches(t, filters)));
    if (pool.length === 0) return;
    startSession(pool.slice(0, max), describeFilters(filters, max));
  });

  /* ---------- Interrogation ---------- */

  function startSession(techniques, description) {
    app.session = {
      items: techniques.map((tech) => ({ tech, status: null })),
      index: 0,
      date: new Date(),
      description,
      results: [],
      stopped: false,
    };
    show('quiz');
    renderQuestion();
  }

  const currentItem = () => app.session.items[app.session.index];

  function renderQuestion() {
    const s = app.session;
    const t = currentItem().tech;
    const total = s.items.length;
    const remaining = total - s.index - 1;

    els.qAttaque.textContent = t.attaque;
    els.qDefense.textContent = t.defense;
    els.qKyu.textContent = kyuLabel(t.kyu);

    els.remaining.textContent = remaining;
    els.remainingText.textContent =
      plural(remaining, 'technique restante', 'techniques restantes');
    els.progressText.textContent = `Technique ${s.index + 1} sur ${total}`;

    els.ringFill.style.strokeDasharray = RING_LENGTH;
    els.ringFill.style.strokeDashoffset = RING_LENGTH * (1 - s.index / total);

    els.btnNext.textContent = remaining === 0 ? 'Terminer' : 'Suivant';

    // indication masquée à chaque nouvelle technique
    els.indicationBox.hidden = true;
    els.btnIndication.textContent = 'Afficher l\u2019indication';

    loadVideo(t);
    updateBadge();
  }

  function loadVideo(t) {
    els.video.pause();
    els.videoMsg.hidden = true;
    els.videoMsgFile.textContent = videoFileName(t);
    els.video.src = videoUrl(t);   // pas de lecture automatique
    els.video.load();
  }

  els.video.addEventListener('error', () => { els.videoMsg.hidden = false; });
  els.video.addEventListener('loadedmetadata', () => { els.videoMsg.hidden = true; });

  /*
    Règle d'évaluation : la dernière action décide.
      - OK                                       → OK
      - À travailler / Jouer la vidéo /
        Afficher l'indication                    → À travailler
      - Suivant                                  → conserve l'état courant
    Une technique jamais validée par OK est comptée « À travailler » dans le rapport.
  */
  function mark(status) {
    currentItem().status = status;
    updateBadge();
  }

  function updateBadge() {
    const status = currentItem().status;
    els.statusBadge.dataset.status = status ?? 'none';
    els.statusBadge.textContent =
      status === 'ok' ? 'OK' : status === 'travail' ? 'À travailler' : 'Non évaluée';
  }

  els.btnOk.addEventListener('click', () => mark('ok'));
  els.btnWork.addEventListener('click', () => mark('travail'));

  els.btnPlay.addEventListener('click', () => {
    els.video.play().catch(() => { /* vidéo absente : le message est déjà affiché */ });
  });

  // lecture lancée avec les commandes natives du lecteur : même effet
  els.video.addEventListener('play', () => mark('travail'));

  els.btnIndication.addEventListener('click', () => {
    const opening = els.indicationBox.hidden;
    if (opening) {
      els.indicationText.textContent =
        currentItem().tech.indication || 'Aucune indication pour cette technique.';
      mark('travail');
    }
    els.indicationBox.hidden = !opening;
    els.btnIndication.textContent =
      opening ? 'Masquer l\u2019indication' : 'Afficher l\u2019indication';
  });

  els.btnNext.addEventListener('click', () => {
    const s = app.session;
    if (s.index < s.items.length - 1) {
      s.index += 1;
      renderQuestion();
      window.scrollTo(0, 0);
    } else {
      finish(false);
    }
  });

  els.btnStop.addEventListener('click', () => {
    if (window.confirm('Terminer l\u2019interrogation maintenant ?')) finish(true);
  });

  /* ---------- Rapport ---------- */

  function finish(stoppedEarly) {
    const s = app.session;
    els.video.pause();

    // En cas d'arrêt anticipé, on ne garde que les techniques déjà traitées
    // (la technique en cours n'est comptée que si elle a été évaluée).
    let items = s.items;
    if (stoppedEarly) {
      const includeCurrent = s.items[s.index].status !== null;
      items = s.items.slice(0, s.index + (includeCurrent ? 1 : 0));
    }

    s.results = items.map((i) => ({ tech: i.tech, ok: i.status === 'ok' }));
    s.stopped = items.length < s.items.length;

    renderReport();
    show('report');
  }

  function renderReport() {
    const s = app.session;
    const okCount = s.results.filter((r) => r.ok).length;
    const workCount = s.results.length - okCount;

    els.reportDate.textContent = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(s.date);

    els.reportFilters.textContent = s.description;
    els.reportSummary.textContent =
      `${okCount} OK, ${workCount} à travailler, sur ${plural(s.results.length, 'technique', 'techniques')}`;

    els.reportNote.hidden = !s.stopped;
    if (s.stopped) {
      els.reportNote.textContent =
        `Interrogation interrompue : ${s.results.length} technique(s) évaluée(s) sur ${s.items.length} prévue(s).`;
    }

    els.reportBody.replaceChildren();
    if (s.results.length === 0) {
      const row = els.reportBody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 3;
      cell.textContent = 'Aucune technique évaluée.';
    }

    for (const { tech, ok } of s.results) {
      const row = els.reportBody.insertRow();
      row.insertCell().textContent = `${tech.attaque} - ${tech.defense}`;
      row.insertCell().textContent = kyuLabel(tech.kyu);

      const tag = document.createElement('span');
      tag.className = 'result-tag';
      tag.dataset.result = ok ? 'ok' : 'travail';
      tag.textContent = ok ? 'OK' : 'À travailler';
      row.insertCell().append(tag);
    }

    els.btnRetry.hidden = workCount === 0;
  }

  els.btnPrint.addEventListener('click', () => window.print());

  els.btnRetry.addEventListener('click', () => {
    const techniques = app.session.results.filter((r) => !r.ok).map((r) => r.tech);
    if (techniques.length === 0) return;
    startSession(shuffle(techniques), 'Révision des techniques à travailler');
  });

  els.btnNew.addEventListener('click', () => {
    show('setup');
    updateMatchInfo();
  });

  /* ---------- Démarrage ---------- */

  init();
})();
