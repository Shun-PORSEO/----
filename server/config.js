// 環境変数から設定を読む。秘密情報（APIキー・会員コード）はフロントに渡さない。

function parseMemberCodes(raw) {
  // 例: MEMBER_CODES="abc123:株式会社サンプル,xyz789:有限会社テスト"
  const map = new Map();
  for (const part of String(raw || '').split(',')) {
    const [code, ...rest] = part.trim().split(':');
    if (code) map.set(code.trim(), rest.join(':').trim() || '会員');
  }
  return map;
}

export function loadConfig(env = process.env) {
  const apiKey = env.ANTHROPIC_API_KEY || '';
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '0.0.0.0',
    demo: !apiKey || env.DEMO_MODE === '1',
    apiKey,
    model: env.CLAUDE_MODEL || 'claude-opus-5',
    // 拒否応答時にサーバー側で別モデルへ自動再試行する（off で無効化）
    fallbacks: env.CLAUDE_FALLBACKS !== 'off',
    memberCodes: parseMemberCodes(env.MEMBER_CODES),
    rateLimitPerHour: Number(env.RATE_LIMIT_PER_HOUR || 120),
    serviceName: env.SERVICE_NAME || '会社の記憶帳',
    operatorName: env.OPERATOR_NAME || 'PORSEO',
    contactEmail: env.CONTACT_EMAIL || '',
    consultFormUrl: env.CONSULT_FORM_URL || '',
    trialFormUrl: env.TRIAL_FORM_URL || '',
    newsletterUrl: env.NEWSLETTER_URL || '',
    podcastUrl: env.PODCAST_URL || '',
  };
}

export function publicConfig(config) {
  return {
    demo: config.demo,
    serviceName: config.serviceName,
    operatorName: config.operatorName,
    contactEmail: config.contactEmail,
    consultFormUrl: config.consultFormUrl,
    trialFormUrl: config.trialFormUrl,
    newsletterUrl: config.newsletterUrl,
    podcastUrl: config.podcastUrl,
    requiresMemberCode: !config.demo && config.memberCodes.size > 0,
  };
}
