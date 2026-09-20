function preferredVoice(voices) {
  return voices.find(v => /^en-AU$/i.test(v.lang) && /siri|enhanced|premium|natural|karen|matilda|catherine|gordon/i.test(v.name))
    || voices.find(v => /^en-AU$/i.test(v.lang))
    || voices.find(v => /^en-(GB|US)$/i.test(v.lang) && /enhanced|premium|natural/i.test(v.name))
    || voices.find(v => /^en/i.test(v.lang))
    || null;
}

function configureAudioSession() {
  try {
    if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {}
}

export function setupHelp({ model, launcher, panel, title, text, status, play, stop, close }) {
  let enabled = false;
  let activeRef = null;
  let voices = [];

  const refreshVoices = () => {
    if ('speechSynthesis' in window) voices = window.speechSynthesis.getVoices() || [];
  };
  refreshVoices();
  if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    launcher.classList.remove('speaking');
    status.textContent = activeRef ? 'Voice off · tap Play voice' : 'Ready';
  }

  function present(ref) {
    activeRef = ref;
    title.textContent = ref.name;
    text.textContent = ref.explanation || ref.summary;
    status.textContent = 'Voice off · tap Play voice';
    panel.classList.add('open');
  }

  function speak() {
    if (!activeRef) return;
    if (!('speechSynthesis' in window)) {
      status.textContent = 'Voice is not available in this browser';
      return;
    }
    configureAudioSession();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${activeRef.name}. ${activeRef.explanation || activeRef.summary}`);
    const voice = preferredVoice(voices);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-AU';
    }
    utterance.rate = .96;
    utterance.pitch = 1;
    utterance.onstart = () => {
      launcher.classList.add('speaking');
      status.textContent = 'Speaking through the active media audio route';
    };
    utterance.onend = () => {
      launcher.classList.remove('speaking');
      status.textContent = 'Voice off · tap Play voice';
    };
    utterance.onerror = () => {
      launcher.classList.remove('speaking');
      status.textContent = 'Voice playback was interrupted';
    };
    window.speechSynthesis.speak(utterance);
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    document.body.classList.toggle('help-mode', enabled);
    launcher.classList.toggle('active', enabled);
    launcher.setAttribute('aria-pressed', String(enabled));
    launcher.textContent = enabled ? '×' : '?';
    if (!enabled) {
      stopVoice();
      panel.classList.remove('open');
    }
  }

  launcher.addEventListener('click', () => setEnabled(!enabled));
  play.addEventListener('click', speak);
  stop.addEventListener('click', stopVoice);
  close.addEventListener('click', () => {
    stopVoice();
    panel.classList.remove('open');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && enabled) setEnabled(false);
  });

  document.addEventListener('click', event => {
    if (!enabled || event.target.closest('.help-ui,.zoom-controls,.search-shell')) return;
    const target = event.target.closest('[data-atlas-type][data-atlas-id]');
    if (!target) return;
    const ref = model.resolve(target.dataset.atlasType, target.dataset.atlasId);
    if (!ref) return;
    event.preventDefault();
    event.stopPropagation();
    present(ref);
  }, true);

  return { setEnabled, present, stopVoice };
}
