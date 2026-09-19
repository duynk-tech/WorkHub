import { describe, it, expect } from 'vitest';
import { PRESET_LLM_MODELS } from '@/lib/llm-models';

describe('LLM Models Configuration', () => {
  it('should include latest modern models up to 3.5 (Gemini 2.5, Claude 3.5, GPT-4o)', () => {
    const ids = PRESET_LLM_MODELS.map((m) => m.id);

    // Modern Gemini models
    expect(ids).toContain('gemini-2.5-flash');
    expect(ids).toContain('gemini-2.5-pro');
    expect(ids).toContain('gemini-2.0-flash');
    expect(ids).toContain('gemini-1.5-flash');

    // Claude 3.5 models
    expect(ids).toContain('claude-3-5-sonnet');
    expect(ids).toContain('claude-3-5-haiku');

    // OpenAI models
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gpt-4o-mini');
  });

  it('should have descriptive human-readable names and preset source', () => {
    for (const model of PRESET_LLM_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.source).toBe('preset');
    }
  });

  it('should prioritize modern Claude 3.5 and Gemini 2.5 with proper labels', () => {
    const claudeSonnet = PRESET_LLM_MODELS.find((m) => m.id === 'claude-3-5-sonnet');
    expect(claudeSonnet?.name).toContain('Claude 3.5 Sonnet');

    const gemini25 = PRESET_LLM_MODELS.find((m) => m.id === 'gemini-2.5-flash');
    expect(gemini25?.name).toContain('gemini-2.5-flash');
  });
});
