/* 신청 내역 확인·수정: 성명 + 휴대폰 번호 뒤 4자리로 본인 확인 */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const form = $('#check-form');
  const result = $('#check-result');
  const status = $('#check-status');

  if (!form || !result || !window.RegistrationAPI) {
    return;
  }

  // 확인에 쓴 성명·번호는 이 화면 메모리에만 둡니다.
  let identity = null;

  // 서버와 같은 기준으로 트랙 이름을 비교합니다.
  const normalizeTrack = value => String(value || '')
    .replace(/생성현/g, '생성형')
    .replace(/\(\s*U\s*(\d+)\s*호\s*\)/g, '(U$1호)')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();

  function post(payload) {
    return window.RegistrationAPI.request({
      method: 'POST',
      body: new URLSearchParams({ payload: JSON.stringify(payload) })
    });
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  // 참가 신청 화면의 트랙 선택지를 그대로 복사해 씁니다.
  function trackFieldset(field, legendText, selected, uid) {
    const source = document.querySelectorAll(
      `#registration input[name="${field}"]`
    );
    const fieldset = element('fieldset', null, 'form-group');
    fieldset.append(element('legend', legendText));

    const wanted = normalizeTrack(selected);
    const radios = [];
    let matched = false;

    source.forEach((input, index) => {
      const label = element('label', null, 'choice');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = field;
      radio.value = input.value;
      radio.required = true;
      radio.id = `${uid}-${field}-${index}`;

      if (!matched && normalizeTrack(input.value) === wanted) {
        radio.checked = true;
        matched = true;
      }

      radios.push(radio);

      const text = input.parentElement.querySelector('span');
      label.append(radio, element('span', text ? text.textContent : input.value));
      fieldset.append(label);
    });

    // 예전 표기로 저장된 신청은 "[트랙 N]" 번호로 맞춥니다.
    if (!matched) {
      const number = (wanted.match(/^\[트랙 \d+\]/) || [])[0];
      const fallback = number && radios.find(radio => radio.value.startsWith(number));
      if (fallback) fallback.checked = true;
    }

    return fieldset;
  }

  function consentFieldset(selected) {
    const fieldset = element('fieldset', null, 'form-group');
    fieldset.append(element('legend', '행사 현장 사진 및 동영상 촬영·활용 동의 *'));

    const options = element('div', null, 'consent-options');

    ['동의합니다.', '동의하지 않습니다.'].forEach(value => {
      const label = element('label', null, 'choice');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'mediaConsent';
      radio.value = value;
      radio.required = true;
      radio.checked = (value === '동의합니다.') === selected;
      label.append(radio, element('span', value));
      options.append(label);
    });

    fieldset.append(options);
    return fieldset;
  }

  function textField(labelText, name, value, maxLength, multiline) {
    const label = element('label', null, multiline ? 'written-answer' : '');
    label.append(document.createTextNode(labelText));

    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.name = name;
    input.value = value || '';
    input.maxLength = maxLength;
    input.required = true;
    if (multiline) input.rows = 3;

    label.append(input);
    return label;
  }

  function renderCard(row, editable) {
    const uid = 'mine-' + row.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
    const card = element('form', null, 'check-registration');
    card.noValidate = false;

    const head = element('div', null, 'form-title');
    head.append(element('h2', '신청 내역'));
    head.append(element(
      'span',
      row.attendance === 'ATTENDED' ? '출석 확인됨' : '접수 완료'
    ));
    card.append(head);

    const summary = element('dl', null, 'check-summary');
    [
      ['접수번호', row.id],
      ['이메일', row.email],
      ['연락처', row.phone]
    ].forEach(([term, value]) => {
      summary.append(element('dt', term), element('dd', value));
    });
    card.append(summary);

    const fields = element('div', null, 'fields');
    fields.append(
      textField('성명 *', 'name', row.name, 40),
      textField('소속 *', 'organization', row.organization, 100)
    );
    card.append(fields);

    card.append(
      trackFieldset('morningTrack', '오전 트랙 · 10:30–12:30 *', row.morningTrack, uid),
      trackFieldset('afternoonTrack', '오후 트랙 · 15:30–17:15 *', row.afternoonTrack, uid),
      consentFieldset(row.mediaConsent),
      textField(
        '향후 다루었으면 하는 주제 *',
        'futureTopics',
        row.futureTopics,
        2000,
        true
      )
    );

    const note = element(
      'p',
      '성명과 소속은 수료증에 그대로 표기됩니다.',
      'note'
    );
    card.append(note);

    const cardStatus = element('p', '', 'check-status');
    cardStatus.setAttribute('role', 'status');
    cardStatus.setAttribute('aria-live', 'polite');

    const actions = element('div', null, 'review-actions');
    const cancel = element('button', '신청 취소', 'button');
    cancel.type = 'button';
    const save = element('button', '변경 내용 저장 ↗', 'button dark');
    save.type = 'submit';

    if (row.attendance === 'ATTENDED') {
      cancel.disabled = true;
    }

    if (!editable) {
      card.querySelectorAll('input, textarea').forEach(input => {
        input.disabled = true;
      });
      save.disabled = true;
      note.textContent = '신청 기간이 끝나 내용은 수정할 수 없습니다. 변경이 필요하면 운영 사무국으로 문의해 주세요.';
    }

    actions.append(cancel, save);
    card.append(actions, cardStatus);

    const setBusy = busy => {
      card.querySelectorAll('button').forEach(button => {
        button.disabled = busy ||
          (button === save && !editable) ||
          (button === cancel && row.attendance === 'ATTENDED');
      });
    };

    card.addEventListener('submit', async event => {
      event.preventDefault();

      card.querySelectorAll('input[type=text], input:not([type]), textarea')
        .forEach(input => { input.value = input.value.trim(); });

      if (!card.reportValidity() || !identity) return;

      const data = new FormData(card);
      setBusy(true);
      cardStatus.textContent = '저장 중입니다.';

      try {
        const response = await post({
          action: 'updateMine',
          ...identity,
          registrationId: row.id,
          changes: {
            name: data.get('name'),
            organization: data.get('organization'),
            morningTrack: data.get('morningTrack'),
            afternoonTrack: data.get('afternoonTrack'),
            mediaConsent: data.get('mediaConsent'),
            futureTopics: data.get('futureTopics')
          }
        });

        // 성명을 바꿨다면 다음 확인부터는 새 성명을 씁니다.
        identity = { ...identity, name: response.registration.name };
        Object.assign(row, response.registration);
        cardStatus.textContent = '저장했습니다. 신청 때 입력한 이메일로 변경 안내를 보냈습니다.';
      } catch (error) {
        cardStatus.textContent = error.message;
      } finally {
        setBusy(false);
      }
    });

    cancel.addEventListener('click', async () => {
      if (!identity) return;

      if (!window.confirm('신청을 취소하시겠습니까? 취소 후에는 다시 신청해야 합니다.')) {
        return;
      }

      setBusy(true);
      cardStatus.textContent = '취소하는 중입니다.';

      try {
        await post({
          action: 'updateMine',
          ...identity,
          registrationId: row.id,
          cancel: true
        });

        card.replaceChildren(
          element('h2', '신청을 취소했습니다'),
          element('p', '신청 때 입력한 이메일로 취소 안내를 보냈습니다. 다시 참가하시려면 참가 신청을 새로 해 주세요.', 'note')
        );
        const again = element('a', '참가 신청하기 ↗', 'button dark');
        again.href = '#register';
        card.append(again);
      } catch (error) {
        cardStatus.textContent = error.message;
        setBusy(false);
      }
    });

    return card;
  }

  function reset() {
    identity = null;
    result.hidden = true;
    result.replaceChildren();
    form.hidden = false;
    status.textContent = '';
  }

  form.elements.phoneLast4.addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const name = form.elements.name.value.trim();
    const phoneLast4 = form.elements.phoneLast4.value.trim();
    form.elements.name.value = name;

    if (!name) {
      status.textContent = '성명을 입력해 주세요.';
      form.elements.name.focus();
      return;
    }

    if (!/^\d{4}$/.test(phoneLast4)) {
      status.textContent = '휴대폰 번호 뒤 4자리를 숫자로 입력해 주세요.';
      form.elements.phoneLast4.focus();
      return;
    }

    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    status.textContent = '확인하고 있습니다.';

    try {
      const response = await post({ action: 'lookupMine', name, phoneLast4 });
      identity = { name, phoneLast4 };

      result.replaceChildren();
      response.registrations.forEach(row => {
        result.append(renderCard(row, response.registrationEnabled === true));
      });

      const back = element('button', '다른 정보로 다시 확인', 'text-link check-reset');
      back.type = 'button';
      back.addEventListener('click', reset);
      result.append(back);

      form.hidden = true;
      form.elements.phoneLast4.value = '';
      result.hidden = false;
      status.textContent = '';
      result.querySelector('input')?.focus();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  // 다른 화면으로 나가면 확인 정보와 결과를 지웁니다.
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#check') reset();
  });
})();
