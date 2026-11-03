/* Apps Script expects JSON inside the URL-encoded `payload` field. */
window.RegistrationAPI = Object.freeze({
  endpoint() {
    const config = window.REGISTRATION_CONFIG;
    const value = config?.endpoint || '';
    return config?.enabled === true && /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+\/s|macros\/s)\/[A-Za-z0-9_-]+\/exec$/.test(value) ? value : '';
  },
  async request(options = {}) {
    const endpoint = this.endpoint();
    if (!endpoint) throw new Error('접수 준비 중입니다. 운영 사무국에 문의해 주세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint, {...options, credentials: 'omit', redirect: 'follow', signal: controller.signal});
      if (!response.ok) throw new Error('접수 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      const result = await response.json();
      if (result.ok !== true) throw new Error(typeof result.message === 'string' ? result.message.slice(0, 500) : '저장을 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError) {
        throw new Error('서버 응답을 확인하지 못했습니다. 연결을 확인하고 같은 화면에서 다시 시도해 주세요.');
      }
      throw error;
    } finally { clearTimeout(timeout); }
  },
  async settings() {
    const result = await this.request();
    if (result.service !== 'smart-festival-2026' || typeof result.registrationEnabled !== 'boolean' ||
        typeof result.consentVersion !== 'string' || !result.consentVersion.trim() ||
        typeof result.privacyRetention !== 'string' || !result.privacyRetention.trim()) {
      throw new Error('접수 안내를 불러오지 못했습니다. 운영 사무국에 문의해 주세요.');
    }
    let capabilities;
    try { capabilities = await this.request({method:'POST',body:new URLSearchParams({payload:JSON.stringify({action:'getCapabilities'})})}); }
    catch (error) { if (/지원하지 않는 요청/.test(error.message)) throw new Error('접수 시스템 업데이트 중입니다. 잠시 후 다시 이용해 주세요.'); throw error; }
    if (capabilities.idFormat !== '2026-000') throw new Error('접수 시스템 업데이트 중입니다. 잠시 후 다시 이용해 주세요.');
    return result;
  },
  async send(payload, consentVersion) {
    const {requestId, ...fields} = payload;
    const data = {
      name: fields.name, organization: fields.organization, email: fields.email, phone: fields.phone,
      morningTrack: fields.morningTrack, afternoonTrack: fields.afternoonTrack,
      consent: fields.consent, certificate: fields.certificate === 'on', mediaConsent: fields.photoConsent,
      discoverySource: fields.discovery, futureTopics: fields.futureTopic
    };
    const result = await this.request({
      method: 'POST',
      body: new URLSearchParams({payload: JSON.stringify({action: 'register', requestId, consentVersion, data})})
    });
    if (result.requestId !== requestId || !/^2026-\d{3,}$/.test(result.registrationId || '')) throw new Error('저장 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요.');
    return result;
  }
});
