// Claude API の中継。受け取った内容はメモリ上で処理して返すだけで、ディスクにもログにも残さない。

import Anthropic from '@anthropic-ai/sdk';

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function createAi(config) {
  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });

  function baseParams({ system, messages, effort = 'medium', maxTokens = 16000 }) {
    const params = {
      model: config.model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system,
      messages,
    };
    if (config.fallbacks) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    return params;
  }

  function textOf(message) {
    return message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  function checkStop(message) {
    if (message.stop_reason === 'refusal') throw new AiError('この内容にはAIがお答えできませんでした。表現を変えてお試しください。', 422);
  }

  // 構造化出力（JSON）で1回呼び出す
  async function json({ system, messages, schema, effort = 'low', signal }) {
    const params = baseParams({ system, messages, effort });
    params.output_config.format = { type: 'json_schema', schema };
    const message = await client.beta.messages.create(params, { signal });
    checkStop(message);
    if (message.stop_reason === 'max_tokens') throw new AiError('AIの応答が長すぎて途中で切れました。もう一度お試しください。');
    try {
      return JSON.parse(textOf(message));
    } catch {
      throw new AiError('AIの応答を読み取れませんでした。もう一度お試しください。');
    }
  }

  // テキストを逐次返す。webSearch=true で公開情報の調査（Deep Research）を行う
  async function stream({ system, messages, effort = 'medium', webSearch = false, onDelta, onStatus, signal }) {
    const params = baseParams({ system, messages: [...messages], effort, maxTokens: 64000 });
    if (webSearch) {
      params.tools = [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 10,
          user_location: { type: 'approximate', country: 'JP', region: 'Hokkaido', timezone: 'Asia/Tokyo' },
        },
      ];
    }
    // サーバーツールの長い処理は pause_turn で一旦返るので、続きを依頼する
    for (let round = 0; round < 4; round++) {
      const s = client.beta.messages.stream(params, { signal });
      for await (const event of s) {
        if (event.type === 'content_block_start') {
          const b = event.content_block;
          if (b.type === 'server_tool_use') onStatus?.('Webで公開情報を検索しています…');
          else if (b.type === 'web_search_tool_result') {
            const n = Array.isArray(b.content) ? b.content.length : 0;
            onStatus?.(n ? `${n}件の情報源を確認しました` : '検索結果を確認しています…');
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onDelta(event.delta.text);
        }
      }
      const final = await s.finalMessage();
      checkStop(final);
      if (final.stop_reason !== 'pause_turn') return final.stop_reason;
      params.messages = [...params.messages, { role: 'assistant', content: final.content }];
    }
    return 'pause_turn';
  }

  return { json, stream };
}
