import { ApiError } from './validation.js';

// Explicit provider selection only; no arbitrary proxy URL or ambient token.
export function providerConfig({ provider = 'anthropic', apiKey, deepseekApiKey, model } = {}) {
  if (!['anthropic', 'deepseek'].includes(provider)) throw new ApiError(503, 'AGENT_PROVIDER_INVALID', 'AGENT_PROVIDER 仅支持 anthropic 或 deepseek');
  if (provider === 'anthropic') {
    if (!apiKey?.trim()) throw new ApiError(503, 'AGENT_MODEL_UNAVAILABLE', '未配置 ANTHROPIC_API_KEY，无法运行真实 Agent');
    return { provider, model: model || 'claude-sonnet-4-6', budgetSupported: true, env: { ANTHROPIC_API_KEY: apiKey } };
  }
  if (!deepseekApiKey?.trim()) throw new ApiError(503, 'AGENT_MODEL_UNAVAILABLE', '未配置 DEEPSEEK_API_KEY，无法运行 DeepSeek Agent');
  const selected = model || 'deepseek-flash';
  if (!/^deepseek-[a-z0-9-]{1,50}$/.test(selected)) throw new ApiError(503, 'AGENT_MODEL_INVALID', 'DeepSeek 模式的 AGENT_MODEL 必须使用 deepseek 模型名称');
  return {
    provider, model: selected, budgetSupported: false,
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: deepseekApiKey,
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: selected,
      ANTHROPIC_DEFAULT_SONNET_MODEL: selected,
      ANTHROPIC_DEFAULT_OPUS_MODEL: selected,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: selected,
      ANTHROPIC_SMALL_FAST_MODEL: selected,
    },
  };
}
