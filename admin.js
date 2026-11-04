(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  const dialog = $('#admin');
  const dashboard = $('#admin-dashboard');
  const loginForm = $('#admin-form');

  const SESSION_DURATION = 30 * 60 * 1000;

  const fields = [
    ['siteTitle', '행사명'],
    ['heroTitle1', '메인 제목 첫 줄'],
    ['heroTitle2', '메인 제목 둘째 줄'],
    ['heroIntro', '행사 소개', 'textarea'],
    ['eventDate', '행사 날짜'],
    ['eventTime', '행사 시간'],
    ['eventLocation', '행사 장소'],
    ['hostName', '주최'],
    ['organizers', '주관', 'textarea'],
    ['contactEmail', '문의 이메일', 'email'],
    ['contactPhone', '문의 전화번호', 'tel'],
    ['privacyController', '개인정보 처리 주체'],
    ['privacyRetention', '개인정보 보유 기간'],
    ['mediaUsageScope', '사진·동영상 촬영 및 활용 범위', 'textarea'],
    ['registrationEnabled', '참가 신청 접수', 'select']
  ];

  const required = new Set([
    'siteTitle',
    'heroTitle1',
    'heroTitle2',
    'eventDate',
    'eventTime',
    'eventLocation',
    'hostName',
    'organizers',
    'contactEmail',
    'contactPhone',
    'privacyRetention'
  ]);

  let password = '';
  let session = 0;
  let timer;
  let sessionExpiresAt = 0;

  let page = 1;
  let pages = 1;
  let listRequest = 0;
  let revision = null;
  let tab = 'registrations';
  let contentReady = false;

  function message(text) {
    $('#admin-status').textContent = text;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);

    if (text !== undefined) {
      node.textContent = text;
    }

    if (className) {
      node.className = className;
    }

    return node;
  }

  function actionLink(text, href) {
    const link = element('a', text, 'button compact');
    link.href = href;
    return link;
  }

  function phoneNumber(value) {
    return String(value || '').replace(/[^+0-9]/g, '');
  }

  // 로그인 상태 관리
  function hasSession() {
    if (!password) {
      return false;
    }

    if (Date.now() >= sessionExpiresAt) {
      logout(
        '로그인 후 30분이 지나 로그아웃되었습니다. 다시 로그인해 주세요.'
      );
      return false;
    }

    return true;
  }

  function startSession(candidate) {
    password = candidate;
    sessionExpiresAt = Date.now() + SESSION_DURATION;

    clearTimeout(timer);
    timer = setTimeout(() => hasSession(), SESSION_DURATION);
  }

  function logout(text = '') {
    session++;
    password = '';
    sessionExpiresAt = 0;
    revision = null;
    contentReady = false;

    clearTimeout(timer);

    loginForm.reset();
    loginForm.querySelector('button').disabled = false;

    $('#admin-login').hidden = false;
    dashboard.hidden = true;

    $('#admin-title').textContent = '관리자 로그인';
    $('#admin-list').replaceChildren();

    $('#admin-count').textContent = '0';
    $('#admin-attendance').textContent = '0';
    $('#admin-cancelled').textContent = '—';

    message(text);
  }

  // 이메일·문자 기본 문구
  function confirmationMessage(name) {
    return `${name} 회원님, 스마트교육학회 동계 페스티벌 신청이 완료되었습니다.`;
  }

  function smsLink(number, body) {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (
        navigator.platform === 'MacIntel' &&
        navigator.maxTouchPoints > 1
      );

    const separator = isIOS ? '&' : '?';

    return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
  }

  // 행사 정보 표시
  function defaults() {
    const values = {};

    for (const [key] of fields) {
      const node = document.querySelector(
        `[data-content="${key}"]`
      );

      values[key] = node ? node.innerText : '';
    }

    values.contactEmail =
      $('[data-contact-email]').textContent.trim();

    values.privacyRetention =
      $('#privacy-retention').textContent;

    values.mediaUsageScope =
      typeof registrationSettings !== 'undefined' &&
      registrationSettings
        ? registrationSettings.mediaUsageScope || ''
        : '';

    values.registrationEnabled =
      typeof registrationSettings !== 'undefined' &&
      registrationSettings?.registrationEnabled
        ? 'TRUE'
        : 'FALSE';

    return values;
  }

  function applyContent(content) {
    if (!content || typeof content !== 'object') {
      return;
    }

    for (const [key] of fields) {
      if (typeof content[key] !== 'string') {
        continue;
      }

      // 저장된 기관명에 줄바꿈이 있어도 한 줄로 연결합니다.
      const value = key === 'organizers'
        ? content[key].replace(/\s*[\r\n]+\s*/g, ' · ')
        : content[key];

      document
        .querySelectorAll(`[data-content="${key}"]`)
        .forEach(node => {
          node.textContent = value;
        });
    }

    if (
      typeof content.siteTitle === 'string' &&
      content.siteTitle.trim()
    ) {
      document.title = content.siteTitle;
    }

    if (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.contactEmail || '')
    ) {
      document
        .querySelectorAll('[data-contact-email]')
        .forEach(node => {
          node.textContent = content.contactEmail;
          node.href = 'mailto:' + content.contactEmail;
        });
    }

    if (
      /^\+?[0-9() -]{8,25}$/.test(content.contactPhone || '')
    ) {
      const phone = phoneNumber(content.contactPhone);

      document
        .querySelectorAll('[data-contact-call]')
        .forEach(node => {
          node.href = 'tel:' + phone;
        });

      document
        .querySelectorAll('[data-contact-sms]')
        .forEach(node => {
          node.href = 'sms:' + phone;
        });
    }
  }

  // API 요청
  async function post(action, data = {}) {
    return window.RegistrationAPI.request({
      method: 'POST',
      body: new URLSearchParams({
        payload: JSON.stringify({
          action,
          ...data
        })
      })
    });
  }

  async function authenticated(action, data = {}) {
    if (!hasSession()) {
      throw new Error('다시 로그인해 주세요.');
    }

    const current = session;

    try {
      const result = await post(action, {
        ...data,
        password
      });

      if (!hasSession() || current !== session) {
        throw new Error('로그아웃되었습니다.');
      }

      return result;
    } catch (error) {
      if (
        current === session &&
        /비밀번호|로그인 시도/.test(error.message)
      ) {
        logout(error.message);
      }

      throw error;
    }
  }

  function unsupported(error) {
    return /지원하지 않는 요청/.test(error.message)
      ? '로그인은 완료됐습니다. 목록 조회와 정보 수정을 사용하려면 관리자 서버 업데이트가 필요합니다.'
      : error.message;
  }

  function summary(data) {
    $('#admin-count').textContent =
      String(data.count ?? 0);

    $('#admin-attendance').textContent =
      String(data.attendanceCount ?? 0);

    $('#admin-cancelled').textContent =
      String(data.cancelledCount ?? '—');
  }

  // 신청자 목록 조회
  async function loadList() {
    if (!hasSession()) {
      return;
    }

    const current = session;
    const request = ++listRequest;

    $('#admin-list-status').textContent =
      '접수 현황을 불러오는 중입니다.';

    $('#admin-list').replaceChildren();

    const search = new FormData($('#admin-search'));

    try {
      const result = await authenticated('adminList', {
        query: search.get('query'),
        status: search.get('status'),
        attendance: search.get('attendance'),
        page
      });

      if (session !== current || request !== listRequest) {
        return;
      }

      if (!Array.isArray(result.registrations)) {
        throw new Error('접수 현황 응답을 확인하지 못했습니다.');
      }

      page = result.page;
      pages = result.pages;

      summary(result.summary || {});

      $('#admin-list-status').textContent =
        `조회 결과 ${result.total}명`;

      $('#admin-page').textContent = `${page} / ${pages}`;

      $('#admin-prev').disabled = page <= 1;
      $('#admin-next').disabled = page >= pages;

      if (!result.registrations.length) {
        $('#admin-list').append(
          element('p', '조회된 신청자가 없습니다.', 'note')
        );
      }

      result.registrations.forEach(renderRegistration);
    } catch (error) {
      if (session !== current || request !== listRequest) {
        return;
      }

      $('#admin-list-status').textContent = unsupported(error);
      $('#admin-page').textContent = '';

      $('#admin-prev').disabled = true;
      $('#admin-next').disabled = true;
    }
  }

  // 신청자 한 줄 표시 및 세부 내용
  function renderRegistration(row) {
    const card = element(
      'article',
      undefined,
      'admin-person'
    );

    const details = element('details');

    const heading = element(
      'summary',
      undefined,
      'admin-person-row'
    );

    heading.setAttribute(
      'aria-label',
      `${row.name} 신청 내용 열기 또는 닫기`
    );

    const name = element(
      'span',
      row.name,
      'admin-person-name'
    );

    const organization = element(
      'span',
      row.organization,
      'admin-person-organization'
    );

    name.title = row.name;
    organization.title = row.organization;

    heading.append(name, organization);

    const body = confirmationMessage(row.name);

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      const mail = element(
        'a',
        row.email,
        'admin-person-email'
      );

      const subject =
        '스마트교육학회 동계 페스티벌 신청 완료 안내';

      mail.href =
        `mailto:${row.email}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

      mail.title = `${row.email}로 메일 보내기`;

      heading.append(mail);
    } else {
      heading.append(
        element('span', row.email, 'admin-person-email')
      );
    }

    const contacts = element(
      'span',
      undefined,
      'admin-person-phone'
    );

    contacts.append(element('span', row.phone));

    const number = phoneNumber(row.phone);

    if (/^\+?\d{8,15}$/.test(number)) {
      contacts.append(
        actionLink('전화걸기', 'tel:' + number),
        actionLink('메시지 보내기', smsLink(number, body))
      );
    }

    heading.append(contacts);

    heading.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', event => {
        event.stopPropagation();
      });
    });

    const list = element('dl');

    const detailFields = [
      ['접수번호', row.id],
      ['접수 시각', row.createdAt],
      [
        '접수 상태',
        row.status === 'CANCELLED' ? '취소' : '접수 완료'
      ],
      [
        '출석 상태',
        row.attendance === 'ATTENDED'
          ? '출석 확인'
          : '출석 미확인'
      ],
      ['오전 트랙', row.morningTrack],
      ['오후 트랙', row.afternoonTrack],
      ['촬영 활용', row.mediaConsent ? '동의' : '비동의'],
      ['인지 경로', row.discoverySource],
      ['희망 주제', row.futureTopics]
    ];

    for (const [label, value] of detailFields) {
      list.append(
        element('dt', label),
        element('dd', value)
      );
    }

    const actions = element(
      'div',
      undefined,
      'admin-person-actions'
    );

    const attendance = element(
      'button',
      row.attendance === 'ATTENDED'
        ? '출석 확인 취소'
        : '출석 확인',
      'button compact'
    );

    attendance.type = 'button';
    attendance.disabled = row.status === 'CANCELLED';

    attendance.addEventListener('click', () => {
      updateRegistration(
        row,
        {
          attendance:
            row.attendance === 'ATTENDED'
              ? 'NOT_CHECKED'
              : 'ATTENDED'
        },
        card
      );
    });

    const status = element(
      'button',
      row.status === 'CANCELLED' ? '접수 복원' : '접수 취소',
      'button compact'
    );

    status.type = 'button';

    status.addEventListener('click', () => {
      const verb =
        row.status === 'CANCELLED' ? '복원' : '취소';

      if (
        window.confirm(
          `${row.name} 님의 접수를 ${verb}하시겠습니까?`
        )
      ) {
        updateRegistration(
          row,
          {
            status:
              row.status === 'CANCELLED'
                ? 'REGISTERED'
                : 'CANCELLED'
          },
          card
        );
      }
    });

    actions.append(attendance, status);
    details.append(heading, list, actions);
    card.append(details);

    $('#admin-list').append(card);
  }

  async function updateRegistration(row, updates, card) {
    const current = session;

    card.querySelectorAll('button').forEach(button => {
      button.disabled = true;
    });

    try {
      await authenticated('adminUpdateRegistration', {
        registrationId: row.id,
        updates
      });

      if (current === session) {
        message('접수 정보를 변경했습니다.');
        await loadList();
      }
    } catch (error) {
      if (current === session) {
        message(error.message);

        card.querySelectorAll('button').forEach(button => {
          button.disabled = false;
        });
      }
    }
  }

  // 행사 정보 수정
  function buildContentForm(content) {
    const container = $('#admin-content-fields');
    container.replaceChildren();

    const values = {
      ...defaults(),
      ...content
    };

    for (const [key, label, type] of fields) {
      const wrapper = element('label', label);

      if (type === 'textarea') {
        wrapper.className = 'full';
      }

      const tag =
        type === 'textarea'
          ? 'textarea'
          : type === 'select'
            ? 'select'
            : 'input';

      const input = element(tag);
      input.name = key;

      if (type === 'select') {
        const options = [
          ['TRUE', '접수 중'],
          ['FALSE', '접수 닫기']
        ];

        for (const [value, text] of options) {
          const option = element('option', text);
          option.value = value;
          input.append(option);
        }
      } else if (type === 'textarea') {
        input.rows = 3;
        input.maxLength = 2000;
      } else {
        input.type = type || 'text';
        input.maxLength = 500;
      }

      input.required = required.has(key);
      input.value = values[key] || '';

      wrapper.append(input);
      container.append(wrapper);
    }
  }

  async function loadContent() {
    if (!hasSession()) {
      return;
    }

    const current = session;
    contentReady = false;

    $('#admin-content-form [type=submit]').disabled = true;
    $('#admin-content-status').textContent =
      '행사 정보를 불러오는 중입니다.';

    try {
      const result = await authenticated('adminGetContent');

      if (current !== session) {
        return;
      }

      if (
        !result.content ||
        typeof result.revision !== 'string'
      ) {
        throw new Error('행사 정보를 확인하지 못했습니다.');
      }

      revision = result.revision;
      contentReady = true;

      buildContentForm(result.content);

      $('#admin-content-status').textContent = '';
      $('#admin-content-form [type=submit]').disabled = false;
    } catch (error) {
      if (current === session) {
        $('#admin-content-status').textContent =
          unsupported(error);
      }
    }
  }

  async function selectTab(value) {
    tab = value;

    $('#admin-registrations').hidden =
      tab !== 'registrations';

    $('#admin-content').hidden =
      tab !== 'content';

    document
      .querySelectorAll('[data-admin-tab]')
      .forEach(button => {
        const active = button.dataset.adminTab === tab;

        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
      });

    if (tab === 'content') {
      await loadContent();
    } else {
      await loadList();
    }
  }

  // 관리자 창 열기·닫기
  $('#admin-open').addEventListener('click', () => {
    const loggedIn = hasSession();

    dialog.showModal();

    if (loggedIn) {
      $('#admin-logout').focus();
    } else {
      loginForm.elements.password.focus();
    }
  });

  dialog.addEventListener('close', () => {
    if (!password) {
      logout();
    } else {
      hasSession();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      hasSession();
    }
  });

  $('#admin-logout').addEventListener('click', () => {
    logout('로그아웃되었습니다.');
  });

  // 로그인
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();

    const button = loginForm.querySelector('button');

    if (button.disabled || !loginForm.reportValidity()) {
      return;
    }

    const current = ++session;
    const candidate = loginForm.elements.password.value;

    button.disabled = true;
    message('로그인 확인 중입니다.');

    try {
      const result = await post('adminSummary', {
        password: candidate
      });

      if (current !== session) {
        return;
      }

      if (
        !Number.isInteger(result.count) ||
        !Number.isInteger(result.attendanceCount)
      ) {
        throw new Error('관리자 응답을 확인하지 못했습니다.');
      }

      startSession(candidate);
      loginForm.reset();

      $('#admin-login').hidden = true;
      dashboard.hidden = false;
      $('#admin-title').textContent = '행사 운영 관리';

      message(
        '로그인되었습니다. 로그인 상태는 30분간 유지됩니다.'
      );

      summary(result);
      await selectTab('registrations');
    } catch (error) {
      if (current === session) {
        message(error.message);
        loginForm.reset();
      }
    } finally {
      if (current === session) {
        button.disabled = false;
      }
    }
  });

  // 탭·검색·페이지 이동
  document
    .querySelectorAll('[data-admin-tab]')
    .forEach(button => {
      button.addEventListener('click', () => {
        selectTab(button.dataset.adminTab);
      });
    });

  $('#admin-search').addEventListener('submit', event => {
    event.preventDefault();
    page = 1;
    loadList();
  });

  $('#admin-prev').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadList();
    }
  });

  $('#admin-next').addEventListener('click', () => {
    if (page < pages) {
      page++;
      loadList();
    }
  });

  $('#admin-content-reload').addEventListener('click', () => {
    if (
      !contentReady ||
      window.confirm(
        '저장하지 않은 변경 내용을 버리고 다시 불러오시겠습니까?'
      )
    ) {
      loadContent();
    }
  });

  // 행사 정보 저장
  $('#admin-content-form').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const form = event.currentTarget;

      if (!contentReady || !form.reportValidity()) {
        return;
      }

      const current = session;
      const button = form.querySelector('[type=submit]');
      const content = Object.fromEntries(new FormData(form));

      button.disabled = true;
      $('#admin-content-status').textContent = '저장 중입니다.';

      try {
        const result = await authenticated(
          'adminSaveContent',
          {
            content,
            revision
          }
        );

        if (current !== session) {
          return;
        }

        if (
          !result.content ||
          typeof result.revision !== 'string'
        ) {
          throw new Error(
            '저장 결과를 확인하지 못했습니다. 다시 불러온 뒤 확인해 주세요.'
          );
        }

        revision = result.revision;
        applyContent(result.content);

        $('#admin-content-status').textContent =
          '저장했습니다. 사이트에 변경 내용을 반영했습니다.';

        if (typeof loadRegistrationSettings === 'function') {
          await loadRegistrationSettings();
        }
      } catch (error) {
        if (current === session) {
          $('#admin-content-status').textContent =
            error.message;
        }
      } finally {
        if (current === session) {
          button.disabled = false;
        }
      }
    }
  );

  // 공개 행사 정보 반영
  if (window.RegistrationAPI.endpoint()) {
    post('getPublicContent')
      .then(result => applyContent(result.content))
      .catch(() => {});
  }
})();
  
