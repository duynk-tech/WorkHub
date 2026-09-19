import { describe, it, expect } from 'vitest';
import {
  PROMPT_VARIABLES,
  DEFAULT_SYSTEM_PROMPT,
  PRESET_PROMPT_TEMPLATES,
  renderSystemPrompt,
} from '@/lib/ai-prompt';

describe('AI Agent System Prompt & Dynamic Expressions (n8n-style)', () => {
  it('định nghĩa đầy đủ 8 biến ngữ cảnh động cơ bản', () => {
    expect(PROMPT_VARIABLES).toHaveLength(8);
    const tags = PROMPT_VARIABLES.map((v) => v.tag);
    expect(tags).toContain('user_name');
    expect(tags).toContain('user_position');
    expect(tags).toContain('user_department');
    expect(tags).toContain('user_role');
    expect(tags).toContain('data_scope');
    expect(tags).toContain('current_date');
    expect(tags).toContain('company_name');
    expect(tags).toContain('tools_list');
  });

  it('thay thế chính xác các biểu thức {{variable}} trong prompt template', () => {
    const template = 'Xin chào {{user_name}}, bạn là {{user_position}} thuộc phòng {{user_department}}. Hệ thống: {{company_name}}. Ngày: {{current_date}}.';
    const vars = {
      user_name: 'Nguyễn Văn An',
      user_position: 'Trưởng phòng Kỹ thuật',
      user_department: 'Công nghệ Thông tin',
      company_name: 'WorkHub Pro',
      current_date: '19/09/2026',
    };

    const rendered = renderSystemPrompt(template, vars);
    expect(rendered).toBe('Xin chào Nguyễn Văn An, bạn là Trưởng phòng Kỹ thuật thuộc phòng Công nghệ Thông tin. Hệ thống: WorkHub Pro. Ngày: 19/09/2026.');
  });

  it('hỗ trợ khoảng trắng bên trong dấu ngoặc {{ variable }}', () => {
    const template = 'User: {{   user_name  }} - Scope: {{ data_scope  }}';
    const vars = {
      user_name: 'Trần Thị B',
      data_scope: 'DEPT_TREE',
    };

    const rendered = renderSystemPrompt(template, vars);
    expect(rendered).toBe('User: Trần Thị B - Scope: DEPT_TREE');
  });

  it('tự động fallback về DEFAULT_SYSTEM_PROMPT nếu prompt rỗng hoặc chỉ có khoảng trắng', () => {
    const vars = {
      company_name: 'WorkHub',
      user_name: 'Lê Văn C',
      user_position: 'Kế toán viên',
      user_department: 'Tài chính Kế toán',
      user_role: 'Nhân viên',
      data_scope: 'SELF',
      current_date: '19/09/2026',
      tools_list: 'list_tasks, get_leave_balance',
    };

    const renderedEmpty = renderSystemPrompt('', vars);
    expect(renderedEmpty).toContain('Bạn là trợ lý AI thông minh của WorkHub, đang hỗ trợ nhân sự "Lê Văn C" (Kế toán viên, phòng Tài chính Kế toán).');
    expect(renderedEmpty).toContain('Quy tắc bắt buộc:');

    const renderedWhitespace = renderSystemPrompt('   \n  \t ', vars);
    expect(renderedWhitespace).toContain('Bạn là trợ lý AI thông minh của WorkHub, đang hỗ trợ nhân sự "Lê Văn C"');
  });

  it('giữ nguyên biến nếu không được truyền trong vars', () => {
    const template = 'Họ tên: {{user_name}}, Mã: {{unknown_variable}}';
    const vars = {
      user_name: 'Hoàng Văn D',
    };

    const rendered = renderSystemPrompt(template, vars);
    expect(rendered).toBe('Họ tên: Hoàng Văn D, Mã: {{unknown_variable}}');
  });

  it('nạp đầy đủ 4 preset prompt templates chuyên nghiệp', () => {
    expect(PRESET_PROMPT_TEMPLATES).toHaveLength(4);
    const ids = PRESET_PROMPT_TEMPLATES.map((p) => p.id);
    expect(ids).toContain('default_hr_ops');
    expect(ids).toContain('project_task_focus');
    expect(ids).toContain('it_helpdesk');
    expect(ids).toContain('executive_concise');

    for (const preset of PRESET_PROMPT_TEMPLATES) {
      expect(preset.name.length).toBeGreaterThan(5);
      expect(preset.description.length).toBeGreaterThan(10);
      expect(preset.prompt.length).toBeGreaterThan(50);
      expect(preset.prompt).toContain('{{');
    }
  });

  it('mẫu Executive Concise tuân thủ phong cách súc tích cho lãnh đạo', () => {
    const execPreset = PRESET_PROMPT_TEMPLATES.find((p) => p.id === 'executive_concise');
    expect(execPreset).toBeDefined();
    expect(execPreset?.prompt).toContain('Trợ lý Điều hành Cấp cao');
    expect(execPreset?.prompt).toContain('CỰC KỲ NGẮN GỌN');
  });

  it('mẫu IT Helpdesk hỗ trợ kỹ thuật và thiết bị máy móc', () => {
    const itPreset = PRESET_PROMPT_TEMPLATES.find((p) => p.id === 'it_helpdesk');
    expect(itPreset).toBeDefined();
    expect(itPreset?.prompt).toContain('Hỗ trợ Kỹ thuật & Thiết bị');
    expect(itPreset?.prompt).toContain('thiết bị máy tính, tài sản');
  });
});
