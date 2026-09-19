'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Plug, Copy, Trash2, Lock, Unlock, Webhook, Send, KeyRound, Terminal,
  CheckCircle2, AlertTriangle, Bot, MessageCircle, RefreshCw, Check, Save,
  Wrench, Play, Edit2, Code, Globe, X, Layers, Settings, Sparkles, Eye, EyeOff,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Switch,
  Checkbox, EmptyState, PageHeader, Alert, Divider, Textarea,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtDateTime, fmtRelative } from '@/lib/date';
import { generateWebhookSecret } from '@/lib/utils';
import {
  createMcpClientAction, toggleMcpClientAction, deleteMcpClientAction,
  saveWebhookAction, deleteWebhookAction, testWebhookAction,
} from '@/server/mcp/actions';
import {
  saveSettingsAction, testZaloBotAction, registerZaloWebhookAction, getZaloWebhookInfoAction,
  saveCustomToolAction, deleteCustomToolAction, toggleCustomToolAction, testCustomToolAction,
  fetchLlmModelsAction,
} from '@/server/modules/settings/actions';
import { PRESET_LLM_MODELS, type LlmModelItem } from '@/lib/llm-models';
import type { CustomAgentTool, CustomToolParam } from '@/server/modules/zalo/custom-tools';
import { parseCurlCommand } from '@/lib/curl-parser';
import { ZaloWorkflowDiagram } from './workflow-diagram';

/* eslint-disable @typescript-eslint/no-explicit-any */
const WEBHOOK_EVENTS = [
  { value: 'task.created', label: 'Tạo công việc' },
  { value: 'task.completed', label: 'Hoàn thành công việc' },
  { value: 'leave.submitted', label: 'Nộp đơn nghỉ' },
  { value: 'leave.approved', label: 'Duyệt đơn nghỉ' },
  { value: 'leave.rejected', label: 'Từ chối đơn nghỉ' },
  { value: 'attendance.checkin', label: 'Chấm công vào' },
];

export function IntegrationScreen({
  initialTab = 'mcp',
  initialModal = '',
  initialSubtab = '',
  clients, webhooks, users, tools, recentCalls, mcpUrl, zaloWebhookUrl, settings = {}, customTools = [], canManage, canManageZalo,
}: {
  initialTab?: string;
  initialModal?: string;
  initialSubtab?: string;
  clients: any[]; webhooks: any[];
  users: { id: number; username: string; fullName: string }[];
  tools: { name: string; title: string; description: string; mutating: boolean }[];
  recentCalls: any[];
  mcpUrl: string;
  zaloWebhookUrl: string;
  settings?: Record<string, any>;
  customTools?: CustomAgentTool[];
  canManage: boolean;
  canManageZalo: boolean;
}) {
  type IntegrationTab = 'mcp' | 'zalo' | 'webhook' | 'logs';
  const VALID_TABS: IntegrationTab[] = ['mcp', 'zalo', 'webhook', 'logs'];

  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const initialValidTab: IntegrationTab = VALID_TABS.includes(initialTab as IntegrationTab)
    ? (initialTab as IntegrationTab)
    : 'mcp';
  const [tab, setTab] = useState<IntegrationTab>(initialValidTab);

  // Sync tab with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as IntegrationTab | null;
      if (t && VALID_TABS.includes(t)) {
        setTab(t);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (newTab: IntegrationTab) => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const [zaloValues, setZaloValues] = useState<Record<string, any>>(settings);
  const [zaloWebhookInput, setZaloWebhookInput] = useState(zaloWebhookUrl);
  const [zaloWebhookInfo, setZaloWebhookInfo] = useState<any | null>(null);
  const [zaloWebhookLoading, setZaloWebhookLoading] = useState(false);
  const [savingZalo, setSavingZalo] = useState(false);

  const isInitialModalOpen = ['config', 'zalo', 'bot', 'webhook', 'gemini'].includes(initialModal);
  const [zaloConfigModalOpen, setZaloConfigModalOpen] = useState(isInitialModalOpen);
  const [zaloConfigTab, setZaloConfigTab] = useState<'bot' | 'webhook' | 'gemini'>(() => {
    if (['bot', 'webhook', 'gemini'].includes(initialSubtab)) return initialSubtab as 'bot' | 'webhook' | 'gemini';
    if (['bot', 'webhook', 'gemini'].includes(initialModal)) return initialModal as 'bot' | 'webhook' | 'gemini';
    return 'bot';
  });

  const openZaloConfigModal = (initialTab: 'bot' | 'webhook' | 'gemini' = 'bot') => {
    setZaloConfigTab(initialTab);
    setZaloConfigModalOpen(true);
  };

  // Custom Tools state
  const [customToolsList, setCustomToolsList] = useState<CustomAgentTool[]>(customTools);
  const [toolModal, setToolModal] = useState<CustomAgentTool | null>(null);
  const [toolModalTab, setToolModalTab] = useState<'info' | 'params' | 'action'>('info');
  const [rawHeadersText, setRawHeadersText] = useState('{}');
  const [confirmDeleteTool, setConfirmDeleteTool] = useState<CustomAgentTool | null>(null);
  const [savingCustomTool, setSavingCustomTool] = useState(false);
  const [testingCustomTool, setTestingCustomTool] = useState(false);
  const [testArgs, setTestArgs] = useState<Record<string, any>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; data?: any; error?: string } | null>(null);
  const [mcpToolsModal, setMcpToolsModal] = useState(false);
  const [standaloneTestTool, setStandaloneTestTool] = useState<CustomAgentTool | null>(null);
  const [curlInputText, setCurlInputText] = useState('');
  const [showCurlImporter, setShowCurlImporter] = useState(false);
  const [curlAutoParams, setCurlAutoParams] = useState(true);
  const [showInlineTest, setShowInlineTest] = useState(false);

  const [llmModels, setLlmModels] = useState<LlmModelItem[]>(PRESET_LLM_MODELS);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsStatus, setFetchModelsStatus] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [showAdvancedLlm, setShowAdvancedLlm] = useState(false);
  const [showZaloSecret, setShowZaloSecret] = useState(false);
  const [copiedZaloSecret, setCopiedZaloSecret] = useState(false);
  const [showWebhookModalSecret, setShowWebhookModalSecret] = useState(false);
  const [copiedWebhookSecret, setCopiedWebhookSecret] = useState(false);

  const setZalo = (key: string, val: any) => setZaloValues((v) => ({ ...v, [key]: val }));

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsStatus(null);
    try {
      const res = await fetchLlmModelsAction({
        apiKey: zaloValues['ai.geminiApiKey'],
        baseUrl: zaloValues['ai.baseUrl'],
      });
      if (res.ok) {
        setLlmModels(res.models);
        setFetchModelsStatus({ tone: 'success', message: res.message });
        toast.success(res.message);
      } else {
        if (res.models?.length) setLlmModels(res.models);
        setFetchModelsStatus({ tone: 'danger', message: res.message });
        toast.error(res.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi gọi API lấy danh sách mô hình';
      setFetchModelsStatus({ tone: 'danger', message: msg });
      toast.error(msg);
    } finally {
      setFetchingModels(false);
    }
  };

  const saveZaloConfig = () => {
    setSavingZalo(true);
    startTransition(async () => {
      const payload = {
        'zalo.enabled': zaloValues['zalo.enabled'],
        'zalo.botToken': zaloValues['zalo.botToken'],
        'zalo.webhookSecret': zaloValues['zalo.webhookSecret'],
        'ai.geminiApiKey': zaloValues['ai.geminiApiKey'],
        'ai.baseUrl': zaloValues['ai.baseUrl'] ?? '',
        'ai.model': zaloValues['ai.model'] || 'gemini-1.5-flash',
      };
      const res = await saveSettingsAction('zalo', payload);
      setSavingZalo(false);
      if (res.ok) {
        toast.success(res.message);
        setZaloConfigModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleRegisterZaloWebhook = () => {
    if (!zaloWebhookInput.trim()) return;
    setZaloWebhookLoading(true);
    startTransition(async () => {
      const res = await registerZaloWebhookAction(zaloWebhookInput.trim());
      setZaloWebhookLoading(false);
      if (res.ok) {
        toast.success(res.message);
        handleCheckZaloWebhook();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCheckZaloWebhook = () => {
    setZaloWebhookLoading(true);
    startTransition(async () => {
      const res = await getZaloWebhookInfoAction();
      setZaloWebhookLoading(false);
      if (res.ok) {
        setZaloWebhookInfo(res.info ?? null);
        toast.success('Đã lấy thông tin Webhook từ Zalo');
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleTestZalo = () => {
    startTransition(async () => {
      const res = await testZaloBotAction();
      res.ok ? toast.success(res.message) : toast.error(res.message);
    });
  };

  const handleNewTool = () => {
    setToolModal({
      id: '',
      name: '',
      title: '',
      description: '',
      isActive: true,
      actionType: 'HTTP',
      parameters: [],
      httpConfig: {
        method: 'GET',
        url: '',
        headers: { 'Content-Type': 'application/json' },
        bodyTemplate: '',
      },
      codeSnippet: '// args chứa các tham số truyền vào từ AI\nreturn {\n  success: true,\n  result: "Xin chào " + (args.name || "")\n};',
    });
    setRawHeadersText('{\n  "Content-Type": "application/json"\n}');
    setToolModalTab('info');
    setTestResult(null);
    setTestArgs({});
  };

  const handleEditTool = (tool: CustomAgentTool) => {
    const cloned = JSON.parse(JSON.stringify(tool));
    setToolModal(cloned);
    setRawHeadersText(JSON.stringify(cloned.httpConfig?.headers || {}, null, 2));
    setToolModalTab('info');
    setTestResult(null);
    const initialArgs: Record<string, any> = {};
    (cloned.parameters || []).forEach((p: any) => {
      initialArgs[p.name] = '';
    });
    setTestArgs(initialArgs);
  };

  const handleSaveTool = () => {
    if (!toolModal) return;
    if (!toolModal.name.trim()) {
      toast.error('Vui lòng nhập tên hàm AI (ví dụ: lookup_order)');
      return;
    }
    if (!toolModal.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề công cụ');
      return;
    }
    if (!toolModal.description.trim()) {
      toast.error('Vui lòng nhập mô tả hướng dẫn AI');
      return;
    }

    let parsedHeaders = {};
    if (toolModal.actionType === 'HTTP' && rawHeadersText.trim()) {
      try {
        parsedHeaders = JSON.parse(rawHeadersText);
      } catch {
        toast.error('Headers JSON không hợp lệ. Vui lòng kiểm tra lại định dạng JSON.');
        return;
      }
    }

    const payload: CustomAgentTool = {
      ...toolModal,
      httpConfig: toolModal.httpConfig
        ? {
            ...toolModal.httpConfig,
            headers: parsedHeaders,
          }
        : undefined,
    };

    setSavingCustomTool(true);
    startTransition(async () => {
      const res = await saveCustomToolAction(payload);
      setSavingCustomTool(false);
      if (res.ok && res.tool) {
        toast.success(res.message);
        setCustomToolsList((list) => {
          const idx = list.findIndex((t) => t.id === res.tool!.id);
          if (idx >= 0) {
            const next = [...list];
            next[idx] = res.tool!;
            return next;
          }
          return [...list, res.tool!];
        });
        setToolModal(null);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleToggleTool = (tool: CustomAgentTool) => {
    const nextActive = !tool.isActive;
    setCustomToolsList((list) =>
      list.map((t) => (t.id === tool.id ? { ...t, isActive: nextActive } : t))
    );
    startTransition(async () => {
      const res = await toggleCustomToolAction(tool.id, nextActive);
      if (!res.ok) {
        toast.error(res.message);
        // revert
        setCustomToolsList((list) =>
          list.map((t) => (t.id === tool.id ? { ...t, isActive: tool.isActive } : t))
        );
      }
    });
  };

  const handleDeleteTool = () => {
    if (!confirmDeleteTool) return;
    startTransition(async () => {
      const res = await deleteCustomToolAction(confirmDeleteTool.id);
      if (res.ok) {
        toast.success(res.message);
        setCustomToolsList((list) => list.filter((t) => t.id !== confirmDeleteTool.id));
        setConfirmDeleteTool(null);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleRunTest = (targetTool?: CustomAgentTool) => {
    const activeTool = targetTool || toolModal;
    if (!activeTool) return;
    let parsedHeaders = {};
    if (activeTool.actionType === 'HTTP') {
      const headersSource = targetTool
        ? JSON.stringify(targetTool.httpConfig?.headers || {})
        : rawHeadersText;
      if (headersSource.trim()) {
        try {
          parsedHeaders = JSON.parse(headersSource);
        } catch {
          toast.error('Headers JSON không hợp lệ');
          return;
        }
      }
    }

    const testToolData: CustomAgentTool = {
      ...activeTool,
      httpConfig: activeTool.httpConfig
        ? {
            ...activeTool.httpConfig,
            headers: parsedHeaders,
          }
        : undefined,
    };

    setTestingCustomTool(true);
    setTestResult(null);
    startTransition(async () => {
      const res = await testCustomToolAction(testToolData, testArgs);
      setTestingCustomTool(false);
      setTestResult(res);
      if (res.ok) {
        toast.success('Chạy thử nghiệm thành công!');
      } else {
        toast.error(res.message || 'Chạy thử nghiệm thất bại');
      }
    });
  };

  const handleParseCurl = () => {
    if (!curlInputText.trim()) {
      toast.error('Vui lòng dán lệnh cURL cần phân tích');
      return;
    }

    const parsed = parseCurlCommand(curlInputText);
    if (!parsed) {
      toast.error('Không thể phân tích cú pháp cURL. Vui lòng kiểm tra lại URL hoặc cú pháp.');
      return;
    }

    setToolModal((prev) => {
      if (!prev) return null;

      const shouldUpdateName = !prev.name || prev.name.startsWith('custom_') || prev.name.startsWith('tool_');
      const shouldUpdateTitle = !prev.title || prev.title.startsWith('Công cụ ') || prev.title.startsWith('Gọi API');

      let updatedParams = [...(prev.parameters || [])];
      if (curlAutoParams && parsed.suggestedParams.length > 0) {
        parsed.suggestedParams.forEach((sp) => {
          if (!updatedParams.some((p) => p.name === sp.name)) {
            updatedParams.push({
              name: sp.name,
              type: sp.type,
              description: sp.description,
              required: sp.required,
            });
          }
        });
      }

      return {
        ...prev,
        name: shouldUpdateName && parsed.suggestedName ? parsed.suggestedName : prev.name,
        title: shouldUpdateTitle && parsed.suggestedTitle ? parsed.suggestedTitle : prev.title,
        actionType: 'HTTP',
        httpConfig: {
          method: parsed.method,
          url: curlAutoParams ? parsed.urlWithPlaceholders : parsed.url,
          bodyTemplate: curlAutoParams ? parsed.bodyWithPlaceholders : parsed.body,
        },
        parameters: updatedParams,
      };
    });

    setRawHeadersText(parsed.rawHeadersText);
    setShowCurlImporter(false);
    toast.success(`Đã phân tích cURL thành công: ${parsed.method} ${parsed.url.slice(0, 45)}...`);
  };

  const addParameter = () => {
    setToolModal((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        parameters: [
          ...(prev.parameters || []),
          { name: '', type: 'string', description: '', required: true },
        ],
      };
    });
  };

  const updateParameter = (index: number, field: keyof CustomToolParam, value: any) => {
    setToolModal((prev) => {
      if (!prev) return null;
      const nextParams = [...(prev.parameters || [])];
      nextParams[index] = { ...nextParams[index], [field]: value };
      return { ...prev, parameters: nextParams };
    });
  };

  const removeParameter = (index: number) => {
    setToolModal((prev) => {
      if (!prev) return null;
      const nextParams = [...(prev.parameters || [])];
      nextParams.splice(index, 1);
      return { ...prev, parameters: nextParams };
    });
  };

  const [clientModal, setClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: '', actAsUserId: users[0]?.id ?? 0, readOnly: true,
    scopes: [] as string[], rateLimitPerMin: 60, allowedIps: '', expiresAt: '',
  });
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<any | null>(null);

  const [webhookModal, setWebhookModal] = useState<any | null>(null);

  const copy = (text: string, label = 'Đã sao chép') => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const createClient = () => {
    startTransition(async () => {
      const res = await createMcpClientAction({ ...clientForm, expiresAt: clientForm.expiresAt || null });
      if (res.ok && res.apiKey) {
        setNewKey(res.apiKey);
        setClientModal(false);
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.message);
    });
  };

  const configSnippet = (key: string) => JSON.stringify({
    mcpServers: { workhub: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } },
  }, null, 2);

  return (
    <div className="stack">
      <PageHeader
        title="Tích hợp & MCP"
        description="Cho phép trợ lý AI truy vấn dữ liệu WorkHub qua MCP, và đẩy sự kiện ra hệ thống ngoài bằng webhook"
      />

      <div className="tabs">
        <div className="tab" data-active={tab === 'mcp'} onClick={() => handleTabChange('mcp')}>
          <Plug size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />MCP Client ({clients.length})
        </div>
        <div className="tab" data-active={tab === 'zalo'} onClick={() => handleTabChange('zalo')}>
          <MessageCircle size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Zalo AI Bot
        </div>
        <div className="tab" data-active={tab === 'webhook'} onClick={() => handleTabChange('webhook')}>
          <Webhook size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Webhook ({webhooks.length})
        </div>
        <div className="tab" data-active={tab === 'logs'} onClick={() => handleTabChange('logs')}>
          <Terminal size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Nhật ký gọi MCP
        </div>
      </div>

      {tab === 'mcp' && (
        <div className="stack" style={{ gap: 16 }}>
          <Alert tone="info" icon={<Bot />}>
            <div style={{ width: '100%' }}>
              <b>Endpoint MCP</b> — mỗi API key chạy dưới danh tính một tài khoản, không bao giờ vượt quá quyền của tài khoản đó.
              <div className="row" style={{ gap: 8, marginTop: 7 }}>
                <code style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface-card)', padding: '7px 10px', borderRadius: 6, overflowX: 'auto' }}>
                  {mcpUrl}
                </code>
                <Button size="sm" variant="secondary" onClick={() => copy(mcpUrl)}><Copy /> Chép</Button>
              </div>
            </div>
          </Alert>
          {newKey && (
            <Card>
              <CardBody>
                <Alert tone="warning" icon={<AlertTriangle />}>
                  <b>Sao chép API key ngay — khóa này chỉ hiển thị một lần.</b>
                </Alert>
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <code style={{ flex: 1, fontSize: 12.5, fontFamily: 'var(--font-mono)', background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: 8, wordBreak: 'break-all' }}>
                    {newKey}
                  </code>
                  <Button variant="primary" onClick={() => copy(newKey, 'Đã sao chép API key')}><Copy /> Chép khóa</Button>
                </div>
                <Divider style={{ margin: '14px 0' }} />
                <div className="hint" style={{ marginBottom: 6 }}>Cấu hình cho Claude Code / client MCP:</div>
                <pre style={{
                  fontSize: 11.5, fontFamily: 'var(--font-mono)', background: 'var(--surface-sunken)',
                  padding: 12, borderRadius: 8, overflowX: 'auto', margin: 0,
                }}>{configSnippet(newKey)}</pre>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Button size="sm" variant="secondary" onClick={() => copy(configSnippet(newKey))}><Copy /> Chép cấu hình</Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Đã lưu, đóng thông báo</Button>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>MCP Client</CardTitle>
                <div className="card-subtitle">Ứng dụng AI được cấp quyền truy vấn dữ liệu WorkHub</div>
              </div>
              {canManage && <Button variant="primary" size="sm" onClick={() => setClientModal(true)}><Plus /> Tạo API key</Button>}
            </CardHeader>
            <CardBody style={{ padding: clients.length ? 0 : undefined }}>
              {clients.length === 0 ? (
                <EmptyState icon={<Plug size={20} />} title="Chưa có MCP client" description="Tạo API key để kết nối trợ lý AI với hệ thống." />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Client</th><th>Chạy dưới danh tính</th><th>Phạm vi công cụ</th>
                      <th>Lần gọi gần nhất</th><th>Trạng thái</th><th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 560, color: 'var(--text-strong)' }}>{c.name}</div>
                          <div className="hint" style={{ fontFamily: 'var(--font-mono)' }}>{c.keyPrefix}.••••</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>{c.actAsUser.employee.fullName}</div>
                          <div className="hint">@{c.actAsUser.username}</div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <Badge tone={c.readOnly ? 'info' : 'warning'}>{c.readOnly ? 'Chỉ đọc' : 'Đọc & ghi'}</Badge>
                            <Badge tone="outline">
                              {(c.scopesJson as string[])?.length ? `${(c.scopesJson as string[]).length} công cụ` : 'Toàn bộ công cụ'}
                            </Badge>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5 }}>{c.lastUsedAt ? fmtRelative(c.lastUsedAt) : <span className="text-faint">Chưa dùng</span>}</div>
                          <div className="hint">{c.callCount} lượt gọi</div>
                        </td>
                        <td>
                          {c.isActive
                            ? <Badge tone="success" dot>Hoạt động</Badge>
                            : <Badge tone="neutral" dot>Đã thu hồi</Badge>}
                        </td>
                        <td>
                          {canManage && (
                            <div className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                              <Button size="sm" variant="ghost" iconOnly onClick={() => startTransition(async () => {
                                const res = await toggleMcpClientAction(c.id, !c.isActive);
                                res.ok ? toast.success(res.message) : toast.error(res.message);
                                router.refresh();
                              })} aria-label={c.isActive ? 'Thu hồi' : 'Kích hoạt'}>
                                {c.isActive ? <Lock /> : <Unlock />}
                              </Button>
                              <Button size="sm" variant="ghost" iconOnly onClick={() => setConfirmDeleteClient(c)} aria-label="Xóa"><Trash2 /></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Công cụ MCP khả dụng ({tools.length})</CardTitle>
                <div className="card-subtitle">Trợ lý AI có thể gọi các công cụ này để đọc và thao tác dữ liệu</div>
              </div>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {tools.map((t) => (
                  <div key={t.name} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                    <div className="row" style={{ gap: 7, marginBottom: 4 }}>
                      <code style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{t.name}</code>
                      <Badge tone={t.mutating ? 'warning' : 'info'}>{t.mutating ? 'Ghi' : 'Đọc'}</Badge>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 560, color: 'var(--text-strong)' }}>{t.title}</div>
                    <div className="hint">{t.description}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'zalo' && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Sơ đồ luồng xử lý dạng Diagram kiểu n8n */}
          <ZaloWorkflowDiagram
            customTools={customToolsList}
            mcpToolsCount={tools.length}
            zaloEnabled={Boolean(zaloValues['zalo.enabled'])}
            zaloWebhookUrl={zaloWebhookInput || zaloWebhookUrl}
            hasGeminiKey={Boolean(zaloValues['ai.geminiApiKey'])}
            llmModel={zaloValues['ai.model'] || 'gemini-1.5-flash'}
            canManage={canManageZalo}
            onNewTool={handleNewTool}
            onEditTool={handleEditTool}
            onTestTool={(tool) => {
              setStandaloneTestTool(tool);
              const initialArgs: Record<string, any> = {};
              (tool.parameters || []).forEach((p) => {
                initialArgs[p.name] = '';
              });
              setTestArgs(initialArgs);
              setTestResult(null);
            }}
            onToggleTool={handleToggleTool}
            onDeleteTool={(tool) => setConfirmDeleteTool(tool)}
            onConfigureZalo={() => openZaloConfigModal('bot')}
            onConfigureGemini={() => openZaloConfigModal('gemini')}
            onTestZalo={handleTestZalo}
            onViewMcpTools={() => setMcpToolsModal(true)}
          />
        </div>
      )}

      {tab === 'webhook' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Webhook đi ra</CardTitle>
              <div className="card-subtitle">Gửi sự kiện tới hệ thống bên ngoài, ký bằng HMAC-SHA256 nếu khai báo secret</div>
            </div>
            {canManage && (
              <Button variant="primary" size="sm" onClick={() => setWebhookModal({ name: '', url: '', events: [], secret: '', isActive: true })}>
                <Plus /> Thêm webhook
              </Button>
            )}
          </CardHeader>
          <CardBody style={{ padding: webhooks.length ? 0 : undefined }}>
            {webhooks.length === 0 ? (
              <EmptyState icon={<Webhook size={20} />} title="Chưa có webhook" description="Đăng ký endpoint để nhận sự kiện từ WorkHub." />
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Tên</th><th>URL</th><th>Sự kiện</th><th>Lần gọi cuối</th><th style={{ width: 120 }}></th></tr>
                </thead>
                <tbody>
                  {webhooks.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{w.name}</div>
                        {!w.isActive && <Badge tone="outline">Tắt</Badge>}
                      </td>
                      <td><code style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{w.url}</code></td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                          {w.events.split(',').filter(Boolean).map((e: string) => <Badge key={e} tone="outline">{e}</Badge>)}
                        </div>
                      </td>
                      <td>
                        {w.lastCalledAt ? (
                          <div>
                            <Badge tone={w.lastStatus && w.lastStatus < 400 ? 'success' : 'danger'}>HTTP {w.lastStatus}</Badge>
                            <div className="hint">{fmtRelative(w.lastCalledAt)}</div>
                          </div>
                        ) : <span className="text-faint">Chưa gọi</span>}
                      </td>
                      <td>
                        {canManage && (
                          <div className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="ghost" iconOnly onClick={() => startTransition(async () => {
                              const res = await testWebhookAction(w.id);
                              res.ok ? toast.success(res.message) : toast.error(res.message);
                              router.refresh();
                            })} aria-label="Gửi thử"><Send /></Button>
                            <Button size="sm" variant="ghost" iconOnly onClick={() => setWebhookModal({ ...w, events: w.events.split(',').filter(Boolean) })} aria-label="Sửa"><Plus style={{ transform: 'rotate(45deg)' }} /></Button>
                            <Button size="sm" variant="ghost" iconOnly onClick={() => startTransition(async () => {
                              const res = await deleteWebhookAction(w.id);
                              res.ok ? toast.success(res.message) : toast.error(res.message);
                              router.refresh();
                            })} aria-label="Xóa"><Trash2 /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader><CardTitle>Nhật ký gọi MCP gần đây</CardTitle></CardHeader>
          <CardBody style={{ padding: recentCalls.length ? 0 : undefined }}>
            {recentCalls.length === 0 ? (
              <EmptyState icon={<Terminal size={20} />} title="Chưa có lượt gọi nào" />
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr><th>Thời điểm</th><th>Client</th><th>Công cụ</th><th>Kết quả</th><th className="num">Thời gian</th></tr>
                </thead>
                <tbody>
                  {recentCalls.map((log) => (
                    <tr key={log.id}>
                      <td className="hint">{fmtDateTime(log.createdAt)}</td>
                      <td>{log.client.name}</td>
                      <td><code style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{log.toolName}</code></td>
                      <td>
                        {log.success
                          ? <Badge tone="success"><CheckCircle2 size={11} /> Thành công</Badge>
                          : <Badge tone="danger" title={log.error}>Lỗi</Badge>}
                        {log.error && <div className="hint" style={{ color: 'var(--danger)' }}>{log.error}</div>}
                      </td>
                      <td className="num tnum">{log.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {/* Modal Cấu hình Zalo AI Bot */}
      <Modal
        open={zaloConfigModalOpen}
        onClose={() => setZaloConfigModalOpen(false)}
        title="Cấu hình Zalo AI Bot"
        description="Kết nối Zalo Bot Platform với AI Agent (Google Gemini) để kích hoạt xử lý tự động"
        size="lg"
        footer={
          <div className="row-between" style={{ width: '100%' }}>
            <div>
              <Button size="sm" variant="secondary" onClick={handleTestZalo} loading={pending}>
                <Send size={13} /> Gửi tin thử
              </Button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => setZaloConfigModalOpen(false)}>
                Đóng
              </Button>
              {canManageZalo && (
                <Button size="sm" variant="primary" onClick={saveZaloConfig} loading={savingZalo}>
                  <Save size={13} /> Lưu cấu hình
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          {/* Modal Tabs */}
          <div className="tabs" style={{ marginBottom: 4 }}>
            <div
              className="tab"
              data-active={zaloConfigTab === 'bot'}
              onClick={() => setZaloConfigTab('bot')}
            >
              <MessageCircle size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
              1. Kết nối Zalo Bot
            </div>
            <div
              className="tab"
              data-active={zaloConfigTab === 'webhook'}
              onClick={() => setZaloConfigTab('webhook')}
            >
              <Webhook size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
              2. Đăng ký Webhook
            </div>
            <div
              className="tab"
              data-active={zaloConfigTab === 'gemini'}
              onClick={() => setZaloConfigTab('gemini')}
            >
              <Sparkles size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
              3. Google Gemini AI
            </div>
          </div>

          {/* Tab 1: Kết nối Bot */}
          {zaloConfigTab === 'bot' && (
            <div className="stack" style={{ gap: 14 }}>
              <label
                className="row"
                style={{
                  gap: 12,
                  background: 'var(--surface-sunken)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Switch
                  checked={Boolean(zaloValues['zalo.enabled'])}
                  onChange={(e) => setZalo('zalo.enabled', e.target.checked)}
                />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 560 }}>Kích hoạt Zalo AI Bot</div>
                  <div className="hint">Nhân sự nhắn tin qua Zalo sẽ được AI trợ lý trả lời và gọi MCP tools tự động</div>
                </div>
              </label>

              <Field label="Bot token" hint="Lấy từ Zalo Bot Manager (dạng bot_id:secret_key)" required>
                <Input
                  type="password"
                  value={zaloValues['zalo.botToken'] ?? ''}
                  onChange={(e) => setZalo('zalo.botToken', e.target.value)}
                  placeholder="123456789:abcdef..."
                />
              </Field>

              <Field label="Webhook secret" hint="Dùng để bảo mật request từ Zalo (hỗ trợ chế độ tự động tạo ngẫu nhiên)">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      type={showZaloSecret ? 'text' : 'password'}
                      value={zaloValues['zalo.webhookSecret'] ?? ''}
                      onChange={(e) => setZalo('zalo.webhookSecret', e.target.value)}
                      placeholder="whsec_... hoặc nhập secret tùy chọn"
                      style={{ fontFamily: showZaloSecret ? 'var(--font-mono)' : undefined, fontSize: 13 }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={() => setShowZaloSecret(!showZaloSecret)}
                    title={showZaloSecret ? 'Ẩn secret' : 'Hiện secret'}
                  >
                    {showZaloSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  {Boolean(zaloValues['zalo.webhookSecret']) && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      iconOnly
                      onClick={() => {
                        navigator.clipboard.writeText(zaloValues['zalo.webhookSecret']);
                        setCopiedZaloSecret(true);
                        toast.success('Đã sao chép Webhook Secret!');
                        setTimeout(() => setCopiedZaloSecret(false), 2000);
                      }}
                      title="Sao chép Webhook Secret"
                    >
                      {copiedZaloSecret ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const newSecret = generateWebhookSecret();
                      setZalo('zalo.webhookSecret', newSecret);
                      setShowZaloSecret(true);
                      toast.success('Đã tự động tạo Webhook Secret mới!');
                    }}
                    title="Tự động tạo Webhook Secret ngẫu nhiên có độ bảo mật cao"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0, gap: 5 }}
                  >
                    <Sparkles size={13} color="var(--brand)" />
                    Tự động tạo
                  </Button>
                </div>
              </Field>
            </div>
          )}

          {/* Tab 2: Đăng ký Webhook */}
          {zaloConfigTab === 'webhook' && (
            <div className="stack" style={{ gap: 14 }}>
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <div className="row-between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>Đăng ký Webhook Zalo Bot</span>
                    <div className="hint" style={{ marginTop: 2 }}>
                      WorkHub tự động gọi API Zalo Bot Platform để đăng ký URL nhận tin nhắn, không cần cấu hình thủ công
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="ghost" loading={zaloWebhookLoading} onClick={handleCheckZaloWebhook}>
                      <RefreshCw size={13} /> Kiểm tra trạng thái
                    </Button>
                  </div>
                </div>

                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Input
                    value={zaloWebhookInput}
                    onChange={(e) => setZaloWebhookInput(e.target.value)}
                    placeholder="https://your-domain.com/api/zalo"
                    style={{ flex: 1, minWidth: 260, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    loading={zaloWebhookLoading}
                    onClick={handleRegisterZaloWebhook}
                    disabled={!zaloValues['zalo.botToken']}
                  >
                    <Check size={14} /> Đăng ký Webhook
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copy(zaloWebhookInput)}
                  >
                    <Copy size={13} /> Chép
                  </Button>
                </div>

                {zaloWebhookInfo && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-base)', fontSize: 12 }}>
                    <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>URL đang kích hoạt trên Zalo:</span>
                      <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{zaloWebhookInfo.url || '(Chưa đăng ký)'}</code>
                    </div>
                    {zaloWebhookInfo.pending_update_count !== undefined && (
                      <div className="hint">Tin nhắn đang chờ xử lý trên Zalo: {zaloWebhookInfo.pending_update_count}</div>
                    )}
                    {zaloWebhookInfo.last_error_message && (
                      <div style={{ color: 'var(--danger)', marginTop: 4 }}>
                        Lỗi gần nhất từ Zalo: {zaloWebhookInfo.last_error_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Google Gemini AI & LLM Model */}
          {zaloConfigTab === 'gemini' && (
            <div className="stack" style={{ gap: 14 }}>
              <Field
                label="API Key (Google Gemini / LLM Provider)"
                hint="Dùng miễn phí từ Google AI Studio (aistudio.google.com), OpenRouter hoặc nhà cung cấp LLM tương thích"
                required
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      id="gemini-key-input"
                      type="password"
                      value={zaloValues['ai.geminiApiKey'] ?? ''}
                      onChange={(e) => setZalo('ai.geminiApiKey', e.target.value)}
                      placeholder="Nhập API key mới (AIzaSy... hoặc sk-...)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={fetchingModels}
                    onClick={handleFetchModels}
                    title="Gọi API kiểm tra key và lấy danh sách các mô hình thực tế từ nhà cung cấp"
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    <RefreshCw size={13} className={fetchingModels ? 'animate-spin' : ''} />
                    {fetchingModels ? 'Đang gọi API...' : 'Gọi API lấy Model'}
                  </Button>
                </div>
              </Field>

              {fetchModelsStatus && (
                <Alert tone={fetchModelsStatus.tone} style={{ padding: '8px 12px', fontSize: 12.5 }}>
                  {fetchModelsStatus.message}
                </Alert>
              )}

              <Field
                label="Mô hình LLM (AI Model)"
                hint="Chọn mô hình AI từ danh sách đã nạp trực tiếp qua API hoặc các mô hình phổ biến (Gemini 2.5, Claude 3.5, GPT-4o...)"
              >
                <div className="stack" style={{ gap: 8 }}>
                  <Select
                    value={
                      llmModels.some((m) => m.id === (zaloValues['ai.model'] || 'gemini-1.5-flash'))
                        ? (zaloValues['ai.model'] || 'gemini-1.5-flash')
                        : 'custom'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setZalo('ai.model', 'claude-3-5-sonnet');
                      } else {
                        setZalo('ai.model', val);
                      }
                    }}
                  >
                    {llmModels.some((m) => m.source === 'api') && (
                      <optgroup label={`Danh sách mô hình từ API (${llmModels.filter((m) => m.source === 'api').length})`}>
                        {llmModels.filter((m) => m.source === 'api').map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </optgroup>
                    )}

                    <optgroup label="Mô hình phổ biến (Gemini, Claude 3.5, OpenAI)">
                      {PRESET_LLM_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>

                    <option value="custom">Tùy chỉnh (Nhập mã mô hình khác...)</option>
                  </Select>

                  {(!llmModels.some((m) => m.id === (zaloValues['ai.model'] || 'gemini-1.5-flash')) || zaloValues['ai.model'] === 'custom') && (
                    <Field label="Tên mã mô hình tùy chỉnh" hint="Nhập chính xác ID mô hình (ví dụ: claude-3-5-sonnet-20241022, gemini-2.5-flash...)">
                      <Input
                        value={zaloValues['ai.model'] ?? ''}
                        onChange={(e) => setZalo('ai.model', e.target.value)}
                        placeholder="Mã mô hình..."
                      />
                    </Field>
                  )}
                </div>
              </Field>

              {/* Tùy chọn nâng cao: Base URL endpoint */}
              <div style={{ border: '1px dashed var(--border-base)', borderRadius: 'var(--radius-md)', padding: 10, background: 'var(--surface-sunken)' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setShowAdvancedLlm(!showAdvancedLlm)}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 560, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Settings size={13} />
                    Cấu hình nâng cao: Base URL / Gateway (Tùy chọn)
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--brand)' }}>
                    {showAdvancedLlm ? 'Thu gọn ▲' : 'Mở rộng ▼'}
                  </span>
                </div>

                {showAdvancedLlm && (
                  <div style={{ marginTop: 10 }}>
                    <Field
                      label="Endpoint / Base URL"
                      hint="Mặc định để trống dùng Google Gemini chính thức. Điền https://openrouter.ai/api/v1 để dùng Claude 3.5 Sonnet / GPT-4o, hoặc proxy OpenAI tương thích."
                    >
                      <Input
                        value={zaloValues['ai.baseUrl'] ?? ''}
                        onChange={(e) => setZalo('ai.baseUrl', e.target.value)}
                        placeholder="https://generativelanguage.googleapis.com/v1beta/openai (Mặc định Gemini)"
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Thông tin chi tiết mô hình đang chọn */}
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14, fontSize: 12.5 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bot size={15} color="#8b5cf6" />
                  Đang chọn mô hình: <code style={{ color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>{zaloValues['ai.model'] || 'gemini-1.5-flash'}</code>
                </div>
                <div className="hint" style={{ lineHeight: 1.5 }}>
                  {zaloValues['ai.model']?.includes('claude-3-5')
                    ? 'Claude 3.5 (Sonnet / Haiku) từ Anthropic là một trong những mô hình hàng đầu thế giới về khả năng lập trình, tuân thủ hướng dẫn và gọi tool / function calling cực kỳ chính xác.'
                    : zaloValues['ai.model']?.includes('2.5')
                    ? 'Gemini 2.5 là dòng mô hình mới nhất của Google mang lại khả năng suy luận đa phương thức nâng cao, hiểu ngữ cảnh phức tạp và tốc độ phản hồi ấn tượng.'
                    : zaloValues['ai.model']?.includes('2.0-flash')
                    ? 'Gemini 2.0 Flash thế hệ mới với độ trễ phản hồi cực thấp, tốc độ sinh token cao và khả năng gọi function calling đặc biệt chính xác.'
                    : zaloValues['ai.model']?.includes('1.5-pro')
                    ? 'Gemini 1.5 Pro có khả năng suy luận mạnh mẽ, hiểu ngữ cảnh tài liệu lớn, thích hợp phân tích tổng hợp dữ liệu sâu.'
                    : 'Mô hình được tối ưu hóa cân bằng giữa tốc độ phản hồi nhanh, nhận diện ý định tiếng Việt mượt mà và gọi công cụ hệ thống chính xác.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal tạo MCP client */}
      <Modal
        open={clientModal}
        onClose={() => setClientModal(false)}
        title="Tạo MCP API key"
        description="Key sẽ chạy dưới danh tính tài khoản được chọn và chịu đúng phạm vi dữ liệu của tài khoản đó"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClientModal(false)}>Hủy</Button>
            <Button variant="primary" onClick={createClient} loading={pending}><KeyRound /> Tạo key</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Tên client" required className="span-2" hint="vd: Claude Desktop, Trợ lý Zalo nội bộ">
            <Input value={clientForm.name} onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Chạy dưới danh tính" required hint="Quyền và phạm vi dữ liệu lấy theo tài khoản này">
            <Select value={clientForm.actAsUserId} onChange={(e) => setClientForm((f) => ({ ...f, actAsUserId: Number(e.target.value) }))}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>)}
            </Select>
          </Field>
          <Field label="Giới hạn gọi / phút">
            <Input type="number" value={clientForm.rateLimitPerMin} onChange={(e) => setClientForm((f) => ({ ...f, rateLimitPerMin: Number(e.target.value) }))} />
          </Field>
          <Field label="IP được phép" hint="Phân cách bởi dấu phẩy, để trống là cho phép mọi IP">
            <Input value={clientForm.allowedIps} onChange={(e) => setClientForm((f) => ({ ...f, allowedIps: e.target.value }))} placeholder="103.1.2.3, 42.5.6.7" />
          </Field>
          <Field label="Ngày hết hạn" hint="Để trống nếu không hết hạn">
            <Input type="date" value={clientForm.expiresAt} onChange={(e) => setClientForm((f) => ({ ...f, expiresAt: e.target.value }))} />
          </Field>
          <label className="row span-2" style={{ gap: 10 }}>
            <Switch checked={clientForm.readOnly} onChange={(e) => setClientForm((f) => ({ ...f, readOnly: e.target.checked }))} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 540 }}>Chế độ chỉ đọc</div>
              <div className="hint">Khi bật, client không thể tạo công việc, nộp đơn hay duyệt đơn</div>
            </div>
          </label>
          <Field label="Giới hạn công cụ" className="span-2" hint="Không chọn gì = cho phép toàn bộ công cụ phù hợp quyền">
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 5 }}>
              {tools.map((t) => (
                <label key={t.name} className="row" style={{ gap: 7, fontSize: 12.5 }}>
                  <Checkbox
                    checked={clientForm.scopes.includes(t.name)}
                    onChange={(e) => setClientForm((f) => ({
                      ...f,
                      scopes: e.target.checked ? [...f.scopes, t.name] : f.scopes.filter((s) => s !== t.name),
                    }))}
                  />
                  <span>{t.title}</span>
                  {t.mutating && <Badge tone="warning">Ghi</Badge>}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Modal webhook */}
      <Modal
        open={Boolean(webhookModal)}
        onClose={() => setWebhookModal(null)}
        title={webhookModal?.id ? 'Sửa webhook' : 'Thêm webhook'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWebhookModal(null)}>Hủy</Button>
            <Button variant="primary" loading={pending} onClick={() => startTransition(async () => {
              const res = await saveWebhookAction(webhookModal.id ?? null, {
                name: webhookModal.name, url: webhookModal.url,
                events: webhookModal.events, secret: webhookModal.secret ?? '', isActive: webhookModal.isActive,
              });
              if (res.ok) { toast.success(res.message); setWebhookModal(null); router.refresh(); }
              else toast.error(res.message);
            })}>
              Lưu webhook
            </Button>
          </>
        }
      >
        {webhookModal && (
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Tên" required>
              <Input value={webhookModal.name} onChange={(e) => setWebhookModal({ ...webhookModal, name: e.target.value })} placeholder="vd: n8n automation" />
            </Field>
            <Field label="URL endpoint" required>
              <Input value={webhookModal.url} onChange={(e) => setWebhookModal({ ...webhookModal, url: e.target.value })} placeholder="https://n8n.congty.vn/webhook/workhub" />
            </Field>
            <Field label="Secret ký HMAC" hint="Gửi kèm header X-WorkHub-Signature để bên nhận xác thực (hỗ trợ tự động tạo)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Input
                    type={showWebhookModalSecret ? 'text' : 'password'}
                    value={webhookModal.secret ?? ''}
                    onChange={(e) => setWebhookModal({ ...webhookModal, secret: e.target.value })}
                    placeholder="whsec_... hoặc nhập secret riêng"
                    style={{ fontFamily: showWebhookModalSecret ? 'var(--font-mono)' : undefined, fontSize: 13 }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  iconOnly
                  onClick={() => setShowWebhookModalSecret(!showWebhookModalSecret)}
                  title={showWebhookModalSecret ? 'Ẩn secret' : 'Hiện secret'}
                >
                  {showWebhookModalSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
                {Boolean(webhookModal.secret) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={() => {
                      navigator.clipboard.writeText(webhookModal.secret || '');
                      setCopiedWebhookSecret(true);
                      toast.success('Đã sao chép Secret ký HMAC!');
                      setTimeout(() => setCopiedWebhookSecret(false), 2000);
                    }}
                    title="Sao chép Secret"
                  >
                    {copiedWebhookSecret ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newSecret = generateWebhookSecret();
                    setWebhookModal({ ...webhookModal, secret: newSecret });
                    setShowWebhookModalSecret(true);
                    toast.success('Đã tự động tạo Secret HMAC mới!');
                  }}
                  title="Tự động tạo Secret ngẫu nhiên có độ bảo mật cao"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0, gap: 5 }}
                >
                  <Sparkles size={13} color="var(--brand)" />
                  Tự động tạo
                </Button>
              </div>
            </Field>
            <Field label="Sự kiện đăng ký" required>
              <div style={{ display: 'grid', gap: 5 }}>
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.value} className="row" style={{ gap: 8, fontSize: 13 }}>
                    <Checkbox
                      checked={webhookModal.events.includes(ev.value)}
                      onChange={(e) => setWebhookModal({
                        ...webhookModal,
                        events: e.target.checked
                          ? [...webhookModal.events, ev.value]
                          : webhookModal.events.filter((x: string) => x !== ev.value),
                      })}
                    />
                    {ev.label} <code className="hint" style={{ fontFamily: 'var(--font-mono)' }}>{ev.value}</code>
                  </label>
                ))}
              </div>
            </Field>
            <label className="row" style={{ gap: 9, fontSize: 13 }}>
              <Switch checked={webhookModal.isActive} onChange={(e) => setWebhookModal({ ...webhookModal, isActive: e.target.checked })} />
              Webhook đang hoạt động
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDeleteClient)}
        onClose={() => setConfirmDeleteClient(null)}
        onConfirm={() => startTransition(async () => {
          const res = await deleteMcpClientAction(confirmDeleteClient.id);
          res.ok ? toast.success(res.message) : toast.error(res.message);
          setConfirmDeleteClient(null);
          router.refresh();
        })}
        loading={pending}
        danger
        title="Xóa MCP client"
        confirmText="Xóa"
        message={<>Xóa client <b>{confirmDeleteClient?.name}</b>? API key sẽ ngừng hoạt động ngay lập tức.</>}
      />

      {/* Modal Custom Tool Builder */}
      <Modal
        open={Boolean(toolModal)}
        onClose={() => setToolModal(null)}
        title={toolModal?.id ? `Chỉnh sửa công cụ: ${toolModal.title || toolModal.name}` : 'Thêm công cụ tùy chỉnh mới'}
        size="lg"
        footer={
          <div className="row-between" style={{ width: '100%' }}>
            <div>
              {toolModal?.actionType === 'HTTP' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setToolModalTab('action');
                    setShowCurlImporter(true);
                  }}
                  title="Nhập nhanh phương thức, URL, Headers và Body từ câu lệnh cURL"
                >
                  <Terminal size={13} /> Nhập từ cURL
                </Button>
              )}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button variant="secondary" onClick={() => setToolModal(null)}>Hủy</Button>
              <Button variant="primary" loading={savingCustomTool} onClick={handleSaveTool}>
                <Save size={14} /> Lưu công cụ
              </Button>
            </div>
          </div>
        }
      >
        {toolModal && (
          <div className="stack" style={{ gap: 16 }}>
            {/* Modal Tabs: 3 Tab gọn gàng, loại bỏ tab Thử nghiệm thừa thãi */}
            <div className="tabs" style={{ marginBottom: 4 }}>
              <div
                className="tab"
                data-active={toolModalTab === 'info'}
                onClick={() => setToolModalTab('info')}
              >
                <Bot size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
                1. Thông tin AI
              </div>
              <div
                className="tab"
                data-active={toolModalTab === 'params'}
                onClick={() => setToolModalTab('params')}
              >
                <Layers size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
                2. Tham số ({toolModal.parameters?.length || 0})
              </div>
              <div
                className="tab"
                data-active={toolModalTab === 'action'}
                onClick={() => setToolModalTab('action')}
              >
                <Globe size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
                3. Cấu hình {toolModal.actionType}
              </div>
            </div>

            {/* TAB 1: INFO */}
            {toolModalTab === 'info' && (
              <div className="stack" style={{ gap: 14 }}>
                {toolModal.actionType === 'HTTP' && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(2, 132, 199, 0.05)',
                      border: '1px solid rgba(2, 132, 199, 0.2)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div className="row" style={{ gap: 6, fontSize: 12 }}>
                      <Sparkles size={14} style={{ color: 'var(--brand)' }} />
                      <span>Có sẵn lệnh cURL từ Postman / Swagger / DevTools?</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      style={{ height: 25, fontSize: 11.5 }}
                      onClick={() => {
                        setToolModalTab('action');
                        setShowCurlImporter(true);
                      }}
                    >
                      <Terminal size={12} /> Dán cURL để tự động điền
                    </Button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Tên định danh cho AI (name)" required hint="Chỉ chữ cái, số và dấu gạch dưới (vd: tra_cuu_don_hang)">
                    <Input
                      value={toolModal.name}
                      onChange={(e) => setToolModal({ ...toolModal, name: e.target.value })}
                      placeholder="vd: lookup_order"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                  <Field label="Tiêu đề hiển thị (title)" required hint="Tên gợi nhớ cho quản trị viên">
                    <Input
                      value={toolModal.title}
                      onChange={(e) => setToolModal({ ...toolModal, title: e.target.value })}
                      placeholder="vd: Tra cứu đơn hàng CRM"
                    />
                  </Field>
                </div>

                <Field
                  label="Mô tả hướng dẫn AI (description)"
                  required
                  hint="Gemini sẽ đọc mô tả này để tự quyết định khi nào cần gọi công cụ khi người dùng chat"
                >
                  <Textarea
                    rows={3}
                    value={toolModal.description}
                    onChange={(e) => setToolModal({ ...toolModal, description: e.target.value })}
                    placeholder="vd: Sử dụng công cụ này khi người dùng hỏi về tiến độ đơn hàng, tra cứu mã vận đơn hoặc số điện thoại người nhận."
                  />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Loại thực thi">
                    <Select
                      value={toolModal.actionType}
                      onChange={(e) => setToolModal({ ...toolModal, actionType: e.target.value as 'HTTP' | 'CODE' })}
                    >
                      <option value="HTTP">HTTP Request (REST API)</option>
                      <option value="CODE">JavaScript Code</option>
                    </Select>
                  </Field>
                  <Field label="Trạng thái">
                    <label className="row" style={{ gap: 10, marginTop: 8 }}>
                      <Switch
                        checked={toolModal.isActive}
                        onChange={(e) => setToolModal({ ...toolModal, isActive: e.target.checked })}
                      />
                      <span style={{ fontSize: 13 }}>Kích hoạt cho AI sử dụng</span>
                    </label>
                  </Field>
                </div>
              </div>
            )}

            {/* TAB 2: PARAMETERS */}
            {toolModalTab === 'params' && (
              <div className="stack" style={{ gap: 14 }}>
                <div className="row-between">
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tham số đầu vào (Inputs)</div>
                    <div className="hint">AI sẽ tự trích xuất các thông tin này từ câu nói của người dùng trên Zalo</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={addParameter}>
                    <Plus size={13} /> Thêm tham số
                  </Button>
                </div>

                {(!toolModal.parameters || toolModal.parameters.length === 0) ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-base)' }}>
                    <div className="hint">Chưa có tham số nào. Nhấn "+ Thêm tham số" nếu công cụ cần dữ liệu đầu vào.</div>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 10 }}>
                    {toolModal.parameters.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 100px 1fr 90px 32px',
                          gap: 8,
                          alignItems: 'center',
                          padding: 10,
                          background: 'var(--surface-sunken)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <Input
                          placeholder="Tên (vd: code)"
                          value={p.name}
                          onChange={(e) => updateParameter(idx, 'name', e.target.value)}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                        />
                        <Select
                          value={p.type}
                          onChange={(e) => updateParameter(idx, 'type', e.target.value as any)}
                          style={{ fontSize: 12.5 }}
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                        </Select>
                        <Input
                          placeholder="Mô tả cho AI (vd: Mã đơn hàng)"
                          value={p.description}
                          onChange={(e) => updateParameter(idx, 'description', e.target.value)}
                          style={{ fontSize: 12.5 }}
                        />
                        <label className="row" style={{ gap: 5, fontSize: 12 }}>
                          <Checkbox
                            checked={Boolean(p.required)}
                            onChange={(e) => updateParameter(idx, 'required', e.target.checked)}
                          />
                          Bắt buộc
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          style={{ color: 'var(--danger)', padding: 4 }}
                          onClick={() => removeParameter(idx)}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Alert tone="info">
                  <div style={{ fontSize: 12 }}>
                    💡 <b>Mẹo cấu hình</b>: Bạn có thể sử dụng cú pháp <code>{`{{tên_tham_số}}`}</code> trong URL, Headers hoặc Body JSON ở bước tiếp theo để tự động đưa giá trị người dùng nhập vào request.
                  </div>
                </Alert>
              </div>
            )}

            {/* TAB 3: ACTION CONFIG */}
            {toolModalTab === 'action' && (
              <div className="stack" style={{ gap: 14 }}>
                {toolModal.actionType === 'HTTP' ? (
                  <>
                    {/* Hộp Nhập từ lệnh cURL */}
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(2, 132, 199, 0.04)',
                        border: '1.5px solid rgba(2, 132, 199, 0.28)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div
                        className="row-between"
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setShowCurlImporter(!showCurlImporter)}
                      >
                        <div className="row" style={{ gap: 8 }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 5,
                              background: '#0284c7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                            }}
                          >
                            <Terminal size={13} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 650, fontSize: 13, color: 'var(--brand)' }}>
                              Nhập nhanh từ lệnh cURL (Import cURL)
                            </div>
                            <div className="hint" style={{ fontSize: 11 }}>
                              Tự động bóc tách Method, URL, Headers, Body JSON và tạo tham số
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" style={{ height: 26, fontSize: 11.5 }}>
                          {showCurlImporter ? 'Thu gọn' : 'Dán cURL'}
                        </Button>
                      </div>

                      {showCurlImporter && (
                        <div className="stack" style={{ gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(2, 132, 199, 0.25)' }}>
                          <Field
                            label="Dán câu lệnh cURL vào đây"
                            hint="Hỗ trợ cURL từ Postman, Chrome DevTools (Copy as cURL), Swagger, Terminal..."
                          >
                            <Textarea
                              rows={4}
                              value={curlInputText}
                              onChange={(e) => setCurlInputText(e.target.value)}
                              placeholder={`curl -X POST 'https://api.crm.vn/customers/lookup?phone=0912345678' \\\n  -H 'Authorization: Bearer my_token' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"region":"hanoi","limit":10}'`}
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                            />
                          </Field>

                          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
                            <label className="row" style={{ gap: 6, fontSize: 12, cursor: 'pointer' }}>
                              <Checkbox
                                checked={curlAutoParams}
                                onChange={(e) => setCurlAutoParams(e.target.checked)}
                              />
                              <span>Tự động trích xuất Query & Body thành Tham số (dạng <code>{`{{tên}}`}</code>)</span>
                            </label>

                            <Button
                              size="sm"
                              variant="primary"
                              onClick={handleParseCurl}
                              disabled={!curlInputText.trim()}
                            >
                              <Sparkles size={13} /> Phân tích cURL & Điền cấu hình
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                      <Field label="Phương thức">
                        <Select
                          value={toolModal.httpConfig?.method || 'GET'}
                          onChange={(e) =>
                            setToolModal({
                              ...toolModal,
                              httpConfig: { ...(toolModal.httpConfig || { url: '' }), method: e.target.value as any },
                            })
                          }
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="DELETE">DELETE</option>
                        </Select>
                      </Field>
                      <Field label="URL API" required hint="Hỗ trợ biến {{tên_tham_số}} (vd: https://api.crm.vn/orders/{{order_id}})">
                        <Input
                          value={toolModal.httpConfig?.url || ''}
                          onChange={(e) =>
                            setToolModal({
                              ...toolModal,
                              httpConfig: { ...(toolModal.httpConfig || { method: 'GET' }), url: e.target.value },
                            })
                          }
                          placeholder="https://api.example.com/data?query={{search_term}}"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                        />
                      </Field>
                    </div>

                    <Field label="Headers (JSON)" hint="Khai báo Authorization Bearer token hoặc các headers cần thiết">
                      <Textarea
                        rows={3}
                        value={rawHeadersText}
                        onChange={(e) => setRawHeadersText(e.target.value)}
                        placeholder='{\n  "Authorization": "Bearer YOUR_SECRET_KEY",\n  "Content-Type": "application/json"\n}'
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                      />
                    </Field>

                    {['POST', 'PUT', 'PATCH', 'DELETE'].includes((toolModal.httpConfig?.method || 'GET').toUpperCase()) && (
                      <Field label="Body Template (JSON)" hint="Hỗ trợ biến {{tên_tham_số}} để truyền vào body">
                        <Textarea
                          rows={4}
                          value={toolModal.httpConfig?.bodyTemplate || ''}
                          onChange={(e) =>
                            setToolModal({
                              ...toolModal,
                              httpConfig: { ...(toolModal.httpConfig || { method: 'POST', url: '' }), bodyTemplate: e.target.value },
                            })
                          }
                          placeholder='{\n  "orderId": "{{order_id}}",\n  "status": "query"\n}'
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        />
                      </Field>
                    )}
                  </>
                ) : (
                  <Field
                    label="Mã JavaScript xử lý"
                    required
                    hint="Tham số truyền vào nằm trong đối tượng `args`. Hàm phải `return` kết quả (hoặc Promise)."
                  >
                    <Textarea
                      rows={10}
                      value={toolModal.codeSnippet || ''}
                      onChange={(e) => setToolModal({ ...toolModal, codeSnippet: e.target.value })}
                      placeholder="// args chứa tham số được AI trích xuất\nconst { city } = args;\nreturn { weather: 'Sunny', temperature: 28 };"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--surface-sunken)' }}
                    />
                  </Field>
                )}

                {/* Chạy thử nghiệm nhanh ngay trong Tab 3 */}
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    marginTop: 4,
                  }}
                >
                  <div
                    className="row-between"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setShowInlineTest(!showInlineTest)}
                  >
                    <div className="row" style={{ gap: 7 }}>
                      <Play size={13} style={{ color: 'var(--brand)' }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Thử nghiệm nhanh cấu hình này</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--brand)' }}>
                      {showInlineTest ? 'Thu gọn' : 'Mở chạy thử'}
                    </span>
                  </div>

                  {showInlineTest && (
                    <div className="stack" style={{ gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                      {toolModal.parameters && toolModal.parameters.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                          {toolModal.parameters.map((p) => (
                            <Field key={p.name} label={`${p.name} (${p.type})`}>
                              <Input
                                value={testArgs[p.name] ?? ''}
                                onChange={(e) => setTestArgs({ ...testArgs, [p.name]: e.target.value })}
                                placeholder={`Giá trị ${p.name}...`}
                                style={{ fontSize: 12 }}
                              />
                            </Field>
                          ))}
                        </div>
                      )}

                      <div className="row" style={{ gap: 8 }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={testingCustomTool}
                          onClick={() => handleRunTest()}
                        >
                          <Play size={12} /> Gửi request thử nghiệm
                        </Button>
                      </div>

                      {testResult && (
                        <div
                          style={{
                            padding: 10,
                            borderRadius: 'var(--radius-sm)',
                            background: testResult.ok ? 'var(--surface-card)' : 'rgba(239, 68, 68, 0.05)',
                            border: `1px solid ${testResult.ok ? 'var(--border-base)' : 'var(--danger)'}`,
                          }}
                        >
                          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                            <Badge tone={testResult.ok ? 'success' : 'danger'}>
                              {testResult.ok ? 'Thành công (200 OK)' : 'Thất bại (Error)'}
                            </Badge>
                            <span style={{ fontSize: 12 }}>{testResult.message}</span>
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              padding: 8,
                              background: 'var(--surface-sunken)',
                              borderRadius: 4,
                              fontSize: 11.5,
                              fontFamily: 'var(--font-mono)',
                              maxHeight: 180,
                              overflowY: 'auto',
                            }}
                          >
                            {JSON.stringify(testResult.data ?? testResult.error ?? testResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Thử nghiệm công cụ độc lập (khi bấm 'Thử' trên node hoặc danh sách) */}
      <Modal
        open={Boolean(standaloneTestTool)}
        onClose={() => setStandaloneTestTool(null)}
        title={`Thử nghiệm công cụ: ${standaloneTestTool?.title || standaloneTestTool?.name}`}
        size="md"
        footer={
          <div className="row-between" style={{ width: '100%' }}>
            <Button
              variant="primary"
              loading={testingCustomTool}
              onClick={() => handleRunTest(standaloneTestTool!)}
            >
              <Play size={13} /> Chạy thử nghiệm ngay
            </Button>
            <Button variant="secondary" onClick={() => setStandaloneTestTool(null)}>
              Đóng
            </Button>
          </div>
        }
      >
        {standaloneTestTool && (
          <div className="stack" style={{ gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="brand" style={{ fontFamily: 'var(--font-mono)' }}>
                {standaloneTestTool.name}
              </Badge>
              {standaloneTestTool.actionType === 'HTTP' ? (
                <Badge tone="info">
                  {standaloneTestTool.httpConfig?.method || 'GET'} {standaloneTestTool.httpConfig?.url}
                </Badge>
              ) : (
                <Badge tone="neutral">JavaScript Code</Badge>
              )}
            </div>

            {standaloneTestTool.description && (
              <div className="hint" style={{ fontSize: 12 }}>
                {standaloneTestTool.description}
              </div>
            )}

            {standaloneTestTool.parameters && standaloneTestTool.parameters.length > 0 ? (
              <div className="stack" style={{ gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Tham số đầu vào:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {standaloneTestTool.parameters.map((p) => (
                    <Field key={p.name} label={`${p.name} (${p.type})`} hint={p.description}>
                      <Input
                        value={testArgs[p.name] ?? ''}
                        onChange={(e) => setTestArgs({ ...testArgs, [p.name]: e.target.value })}
                        placeholder={`Nhập ${p.name}...`}
                        style={{ fontSize: 12.5 }}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ) : (
              <div className="hint" style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
                Công cụ này không yêu cầu tham số đầu vào. Bấm "Chạy thử nghiệm ngay" để kiểm tra kết quả trả về.
              </div>
            )}

            {testResult && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  background: testResult.ok ? 'var(--surface-sunken)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${testResult.ok ? 'var(--border-base)' : 'var(--danger)'}`,
                }}
              >
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Badge tone={testResult.ok ? 'success' : 'danger'}>
                      {testResult.ok ? 'Thành công (Success)' : 'Thất bại (Error)'}
                    </Badge>
                    <span style={{ fontSize: 12.5, color: testResult.ok ? 'var(--text-strong)' : 'var(--danger)' }}>
                      {testResult.message}
                    </span>
                  </div>
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    background: 'var(--surface-card)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {JSON.stringify(testResult.data ?? testResult.error ?? testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Xóa Custom Tool */}
      <ConfirmDialog
        open={Boolean(confirmDeleteTool)}
        onClose={() => setConfirmDeleteTool(null)}
        onConfirm={handleDeleteTool}
        loading={pending}
        danger
        title="Xóa công cụ tùy chỉnh"
        confirmText="Xóa công cụ"
        message={<>Bạn có chắc muốn xóa công cụ <b>{confirmDeleteTool?.title || confirmDeleteTool?.name}</b>? AI Agent sẽ không thể sử dụng công cụ này nữa.</>}
      />

      {/* Modal Xem chi tiết System MCP Tools */}
      <Modal
        open={mcpToolsModal}
        onClose={() => setMcpToolsModal(false)}
        title="Công cụ MCP Hệ thống (WorkHub Core Tools)"
        footer={<Button variant="secondary" onClick={() => setMcpToolsModal(false)}>Đóng</Button>}
      >
        <div className="stack" style={{ gap: 14 }}>
          <div className="hint">
            Khi nhân sự nhắn tin qua Zalo, Gemini AI Agent sẽ tự động quyết định gọi một hoặc nhiều công cụ dưới đây theo quyền hạn thực tế của nhân sự đó.
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Công cụ (MCP Tool)</th>
                  <th>Chức năng</th>
                  <th>Chế độ</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <div style={{ fontWeight: 580, color: 'var(--text-strong)' }}>{t.title}</div>
                      <code style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{t.name}</code>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.description}</td>
                    <td>
                      <Badge tone={t.mutating ? 'warning' : 'info'}>
                        {t.mutating ? 'Thao tác dữ liệu' : 'Chỉ đọc'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
