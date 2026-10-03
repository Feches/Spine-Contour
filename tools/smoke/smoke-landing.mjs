// Landing gate smoke: ticking the acknowledgement must not remount the page. A remount builds a
// new .landing-hero, whose riseIn entrance (0.6s, opacity 0 -> 1) then replays -- the logo
// "reloads and flashes" -- and resets the right column's scroll. Also checks the panel's copy:
// no author names, the contact line, the methods-paper title. Needs a FRESH launch (the app
// still on the landing gate, ack false); it ends by entering the app.
import { connect } from './cdp-lib.mjs';

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const cdp = await connect();
const errorsAtStart = cdp.errors.length;
try {
  let s = await cdp.state();
  check('precondition: fresh launch on the landing gate', s.screen === 'landing' && s.ack === false, { screen: s.screen, ack: s.ack });
  // Let the first riseIn finish so a running animation below can only be a replay.
  await cdp.settle(900);

  const panel = await cdp.evaluate(`(() => {
    const p = document.querySelector('.landing-panel');
    return { text: p.textContent, card: Boolean(p.querySelector('.citation-card')),
      tag: p.querySelector('.landing-paper-status')?.textContent ?? null,
      contact: p.querySelector('.landing-contact')?.textContent ?? null };
  })()`);
  check('no author names on the landing panel', !/Woodhouse|Jayasuriya|CREATED BY/.test(panel.text), panel.text.match(/Woodhouse|Jayasuriya|CREATED BY/g));
  check('no CREATED BY card', !panel.card, panel.card);
  check('contact line keeps the address as its button', panel.contact === 'spine-contour@gmail.com' && /open source and free to use/.test(panel.text), panel.contact);
  check('methods paper title with its status tag', /An Open Source Platform for Automated Spine Segmentation and Spinopelvic Parameter Measurement/.test(panel.text) && panel.tag === '(METHODS PAPER · FORTHCOMING)', panel.tag);

  // Mark the live nodes; a remount replaces them with unmarked ones.
  await cdp.evaluate(`(() => { document.querySelector('.landing').dataset.probe = 'before'; document.querySelector('.landing-hero').dataset.probe = 'before'; })()`);

  const box = await cdp.rect('.checkbox-box');
  await cdp.click(box.cx, box.cy);
  await cdp.settle(40);
  const after = await cdp.evaluate(`(() => {
    const hero = document.querySelector('.landing-hero');
    return {
      landing: document.querySelector('.landing').dataset.probe ?? null,
      hero: hero.dataset.probe ?? null,
      running: hero.getAnimations().filter((a) => a.playState === 'running').length,
      opacity: Number(getComputedStyle(hero).opacity),
      checked: document.querySelector('.checkbox-row input').checked,
      enterDisabled: document.querySelector('.landing-actions .btn-primary').disabled,
    };
  })()`);
  s = await cdp.state();
  check('click ticks the box and sets ack', after.checked === true && s.ack === true, { checked: after.checked, ack: s.ack });
  check('Enter is enabled once ticked', after.enterDisabled === false, after.enterDisabled);
  check('the landing page is not remounted', after.landing === 'before', after.landing);
  check('the logo is the same element', after.hero === 'before', after.hero);
  check('the logo animation does not replay', after.running === 0 && after.opacity === 1, { running: after.running, opacity: after.opacity });

  // Untick: Enter goes back to disabled, still without a remount.
  await cdp.click(box.cx, box.cy);
  await cdp.settle(40);
  const untick = await cdp.evaluate(`({
    hero: document.querySelector('.landing-hero').dataset.probe ?? null,
    checked: document.querySelector('.checkbox-row input').checked,
    enterDisabled: document.querySelector('.landing-actions .btn-primary').disabled,
  })`);
  s = await cdp.state();
  check('second click unticks and clears ack', untick.checked === false && s.ack === false, { checked: untick.checked, ack: s.ack });
  check('Enter is disabled again', untick.enterDisabled === true, untick.enterDisabled);
  check('the logo survives the untick too', untick.hero === 'before', untick.hero);

  // A programmatic change (no click) still reaches the controls.
  await cdp.setState('{ ack: true }');
  await cdp.settle(40);
  const programmatic = await cdp.evaluate(`({
    checked: document.querySelector('.checkbox-row input').checked,
    enterDisabled: document.querySelector('.landing-actions .btn-primary').disabled,
  })`);
  check('setState({ ack }) updates the box and Enter', programmatic.checked === true && programmatic.enterDisabled === false, programmatic);

  const enter = await cdp.rect('.landing-actions .btn-primary');
  await cdp.click(enter.cx, enter.cy);
  await cdp.settle(200);
  s = await cdp.state();
  check('Enter opens the app', s.screen === 'studies' && Boolean(await cdp.rect('.app-shell')), s.screen);

  const newErrors = cdp.errors.slice(errorsAtStart);
  check('no console errors', newErrors.length === 0, newErrors);
} finally {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  cdp.close();
}
