'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, Bot, Sparkles, Send, Wrench, Globe, Code, Plus, Play,
  Edit2, Trash2, Zap, ZoomIn, ZoomOut, RotateCcw,
  CheckCircle2, ArrowRight, Settings, GripVertical, LayoutGrid, Save, Check,
} from 'lucide-react';
import { Badge, Button, Switch } from '@/components/ui';
import type { CustomAgentTool } from '@/server/modules/zalo/custom-tools';

const STORAGE_KEY = 'workhub_zalo_workflow_layout_v2';
const NODE_WIDTH = 236;
const NODE_GAP_X = 52;

// Chuẩn hoá hình học cổng kết nối (Port Handle) để đường nối khớp 100% vào tâm icon port
export const PORT_SIZE = 12;
export const PORT_RADIUS = PORT_SIZE / 2; // 6px
export const PORT_Y = 46; // Vị trí tâm cổng kết nối tính từ đỉnh card xuống (thẳng hàng tiêu đề card)

export type NodePosition = { x: number; y: number };
export type NodePositions = Record<string, NodePosition>;

export function computeDefaultPositions(
  customTools: CustomAgentTool[],
  canManage: boolean,
): NodePositions {
  const col0X = 24;
  const col1X = col0X + NODE_WIDTH + NODE_GAP_X; // 294
  const col2X = col1X + NODE_WIDTH + NODE_GAP_X; // 564
  const col3X = col2X + NODE_WIDTH + NODE_GAP_X; // 834

  const totalToolRows = 1 + customTools.length + (canManage ? 1 : 0);
  const rowHeight = 116;
  const col2Height = totalToolRows * rowHeight;
  const canvasHeight = Math.max(370, col2Height + 40);
  const centerY = canvasHeight / 2;

  // Đồng bộ độ cao Y chuẩn để các port cổng kết nối thẳng hàng nhau tự nhiên
  const alignedNodeY = Math.round(centerY - 64);
  const toolStartY = Math.max(20, Math.round(centerY - (col2Height / 2) + 8));

  const pos: NodePositions = {
    trigger: { x: col0X, y: alignedNodeY },
    agent: { x: col1X, y: alignedNodeY },
    mcp_tools: { x: col2X, y: toolStartY },
    response: { x: col3X, y: alignedNodeY },
  };

  customTools.forEach((tool, idx) => {
    pos[tool.id] = { x: col2X, y: Math.round(toolStartY + (idx + 1) * rowHeight) };
  });

  if (canManage) {
    pos['new_tool'] = { x: col2X, y: Math.round(toolStartY + (customTools.length + 1) * rowHeight) };
  }

  return pos;
}

interface WorkflowDiagramProps {
  customTools: CustomAgentTool[];
  mcpToolsCount: number;
  zaloEnabled: boolean;
  zaloWebhookUrl: string;
  hasGeminiKey: boolean;
  llmModel?: string;
  temperature?: number;
  maxIterations?: number;
  hasCustomPrompt?: boolean;
  canManage: boolean;
  onNewTool: () => void;
  onEditTool: (tool: CustomAgentTool) => void;
  onTestTool: (tool: CustomAgentTool) => void;
  onToggleTool: (tool: CustomAgentTool) => void;
  onDeleteTool: (tool: CustomAgentTool) => void;
  onConfigureZalo?: () => void;
  onConfigureGemini?: () => void;
  onTestZalo?: () => void;
  onViewMcpTools?: () => void;
}

export function ZaloWorkflowDiagram({
  customTools,
  mcpToolsCount,
  zaloEnabled,
  zaloWebhookUrl,
  hasGeminiKey,
  llmModel,
  temperature = 0.2,
  maxIterations = 5,
  hasCustomPrompt = false,
  canManage,
  onNewTool,
  onEditTool,
  onTestTool,
  onToggleTool,
  onDeleteTool,
  onConfigureZalo,
  onConfigureGemini,
  onTestZalo,
  onViewMcpTools,
}: WorkflowDiagramProps) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const [positions, setPositions] = useState<NodePositions>(() =>
    computeDefaultPositions(customTools, canManage)
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotice = (msg: string) => {
    setSavedNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSavedNotice(null);
    }, 2200);
  };

  // Tải vị trí từ localStorage khi component mount ở trình duyệt
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('workhub_zalo_workflow_layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const defaults = computeDefaultPositions(customTools, canManage);
          setPositions({ ...defaults, ...parsed });
        }
      }
    } catch (e) {
      console.error('Failed to load workflow layout from localStorage', e);
    }
  }, []);

  // Cập nhật khi danh sách customTools thay đổi
  useEffect(() => {
    setPositions((prev) => {
      const defaults = computeDefaultPositions(customTools, canManage);
      const next = { ...defaults, ...prev };
      customTools.forEach((t) => {
        if (!prev[t.id]) {
          next[t.id] = defaults[t.id];
        }
      });
      return next;
    });
  }, [customTools.length, canManage]);

  // Bộ tính toán đường nối Bezier chuẩn n8n / ReactFlow
  // Đảm bảo c1x và c2x không bao giờ bắt chéo nhau, triệt tiêu hoàn toàn hiện tượng uốn quặp (hook / L-shape)
  // Đường nối luôn mượt mà và kết nối chính xác 100% vào tâm icon port
  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx >= 0) {
      // Khi x2 >= x1: control points gặp nhau ở trung điểm dx
      // Đảm bảo hàm số x(t) luôn tăng đơn điệu, không bao giờ bị vòng ngược
      const offset = dx * 0.5;
      const c1x = x1 + offset;
      const c2x = x2 - offset;
      return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
    }

    // Khi node đích bị kéo sang bên trái node nguồn (x2 < x1)
    // Tạo vòng lượn mềm mại bao quanh các khối node mà không bị gấp khúc
    const loopOffset = Math.max(35, Math.min(90, Math.sqrt(-dx) * 5 + Math.abs(dy) * 0.1));
    const c1x = x1 + loopOffset;
    const c2x = x2 - loopOffset;
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  };

  // Hệ thống Drag and Drop qua PointerEvent
  const dragInfoRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    initNodeX: number;
    initNodeY: number;
    moved: boolean;
  } | null>(null);

  const onPointerDownNode = (nodeId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, [role="switch"], a, .no-drag')) {
      return;
    }

    const currentPos = positions[nodeId] || computeDefaultPositions(customTools, canManage)[nodeId] || { x: 0, y: 0 };
    dragInfoRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      initNodeX: currentPos.x,
      initNodeY: currentPos.y,
      moved: false,
    };
    setDraggingId(nodeId);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMoveNode = (e: React.PointerEvent) => {
    if (!dragInfoRef.current) return;
    const { nodeId, startX, startY, initNodeX, initNodeY } = dragInfoRef.current;

    const dx = (e.clientX - startX) / zoom;
    const dy = (e.clientY - startY) / zoom;

    if (Math.hypot(dx, dy) > 3) {
      dragInfoRef.current.moved = true;
    }

    const nextX = Math.max(10, Math.round(initNodeX + dx));
    const nextY = Math.max(10, Math.round(initNodeY + dy));

    setPositions((prev) => ({
      ...prev,
      [nodeId]: { x: nextX, y: nextY },
    }));
  };

  const onPointerUpNode = (nodeId: string, e: React.PointerEvent, onClickFallback?: () => void) => {
    if (!dragInfoRef.current) return;
    const wasMoved = dragInfoRef.current.moved;
    dragInfoRef.current = null;
    setDraggingId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (wasMoved) {
      // Tự động lưu vị trí vào localStorage sau khi thả
      try {
        setPositions((curr) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(curr));
          return curr;
        });
        showNotice('Đã lưu vị trí');
      } catch (err) {
        console.error(err);
      }
    } else {
      // Thao tác click bình thường không kéo
      onClickFallback?.();
    }
  };

  // Khôi phục bố cục chuẩn ban đầu
  const handleResetLayout = () => {
    const defaults = computeDefaultPositions(customTools, canManage);
    setPositions(defaults);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    showNotice('Đã sắp xếp lại vị trí chuẩn');
  };

  // Lưu thủ công
  const handleManualSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
      showNotice('Đã lưu vị trí các khối');
    } catch {}
  };

  // Tính toán kích thước canvas thích ứng theo toạ độ node xa nhất
  const defaults = computeDefaultPositions(customTools, canManage);
  const getPos = (id: string): NodePosition => positions[id] || defaults[id] || { x: 0, y: 0 };

  const allPosList = Object.values(positions);
  const maxX = Math.max(...allPosList.map((p) => p.x), 880);
  const maxY = Math.max(...allPosList.map((p) => p.y), 320);
  const canvasWidth = Math.max(1080, maxX + NODE_WIDTH + 80);
  const canvasHeight = Math.max(380, maxY + 150);

  const triggerPos = getPos('trigger');
  const agentPos = getPos('agent');
  const mcpPos = getPos('mcp_tools');
  const responsePos = getPos('response');

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-base)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Diagram Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-raised)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Zap size={15} />
          </div>
          <div>
            <div style={{ fontWeight: 650, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
              Sơ đồ luồng Zalo AI Agent
              <Badge tone={zaloEnabled ? 'success' : 'neutral'} style={{ fontSize: 11 }}>
                {zaloEnabled ? 'Đang hoạt động' : 'Đang tắt'}
              </Badge>
              {savedNotice && (
                <Badge tone="success" style={{ fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3, animation: 'fadeIn 0.2s ease' }}>
                  <Check size={11} /> {savedNotice}
                </Badge>
              )}
            </div>
            <div className="hint" style={{ fontSize: 11.5 }}>
              Kéo thả các khối tự do • Dây nối tự uốn lượn • Click để mở popup cấu hình
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onConfigureZalo && canManage && (
            <Button size="sm" variant="secondary" onClick={onConfigureZalo}>
              <Settings size={13} /> Cấu hình Bot
            </Button>
          )}
          {onTestZalo && (
            <Button size="sm" variant="ghost" onClick={onTestZalo} title="Gửi tin nhắn thử nghiệm qua Zalo Bot">
              <Send size={13} /> Gửi tin thử
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="primary" onClick={onNewTool}>
              <Plus size={13} /> Thêm công cụ
            </Button>
          )}

          {/* Bố cục & Lưu vị trí */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: 2,
              gap: 2,
            }}
          >
            <Button
              size="sm"
              variant="ghost"
              style={{ padding: '3px 7px', height: 24, fontSize: 11.5 }}
              onClick={handleResetLayout}
              title="Sắp xếp lại theo lưới chuẩn"
            >
              <LayoutGrid size={12} /> Bố cục chuẩn
            </Button>
            <Button
              size="sm"
              variant="ghost"
              style={{ padding: '3px 7px', height: 24, fontSize: 11.5 }}
              onClick={handleManualSave}
              title="Lưu vị trí hiện tại"
            >
              <Save size={12} /> Lưu vị trí
            </Button>
          </div>

          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: 2,
            }}
          >
            <Button
              size="sm"
              variant="ghost"
              style={{ padding: '3px 7px', height: 24 }}
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(1))))}
              title="Thu nhỏ"
            >
              <ZoomOut size={12} />
            </Button>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 38, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="sm"
              variant="ghost"
              style={{ padding: '3px 7px', height: 24 }}
              onClick={() => setZoom((z) => Math.min(1.3, Number((z + 0.1).toFixed(1))))}
              title="Phóng to"
            >
              <ZoomIn size={12} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              style={{ padding: '3px 7px', height: 24 }}
              onClick={() => setZoom(1)}
              title="Đặt lại zoom 100%"
            >
              <RotateCcw size={11} />
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          overflowX: 'auto',
          overflowY: 'auto',
          background: 'var(--surface-sunken)',
          backgroundImage: 'radial-gradient(circle, var(--border-base) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          position: 'relative',
          userSelect: draggingId ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            transition: draggingId ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          {/* SVG Connectors theo toạ độ động */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <defs>
              <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="tool-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="out-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>

            {/* Đường 1: Trigger -> AI Agent */}
            <path
              d={getBezierPath(triggerPos.x + NODE_WIDTH, triggerPos.y + PORT_Y, agentPos.x, agentPos.y + PORT_Y)}
              fill="none"
              stroke="url(#flow-gradient)"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              style={{ animation: 'dash 1.2s linear infinite' }}
            />

            {/* Đường 2: AI Agent -> System MCP Tools */}
            <path
              d={getBezierPath(agentPos.x + NODE_WIDTH, agentPos.y + PORT_Y, mcpPos.x, mcpPos.y + PORT_Y)}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeOpacity="0.8"
            />

            {/* Đường 3: AI Agent -> Từng Custom Tool */}
            {customTools.map((tool) => {
              const toolPos = getPos(tool.id);
              const isToolActive = tool.isActive;
              return (
                <g key={`wire-${tool.id}`}>
                  <path
                    d={getBezierPath(agentPos.x + NODE_WIDTH, agentPos.y + PORT_Y, toolPos.x, toolPos.y + PORT_Y)}
                    fill="none"
                    stroke={isToolActive ? 'url(#tool-gradient)' : 'var(--border-base)'}
                    strokeWidth={isToolActive ? '2' : '1.5'}
                    strokeDasharray={isToolActive ? undefined : '4 4'}
                    strokeOpacity={isToolActive ? 0.85 : 0.4}
                  />
                  {isToolActive && (
                    <path
                      d={getBezierPath(toolPos.x + NODE_WIDTH, toolPos.y + PORT_Y, responsePos.x, responsePos.y + PORT_Y)}
                      fill="none"
                      stroke="url(#out-gradient)"
                      strokeWidth="1.8"
                      strokeOpacity="0.65"
                      strokeDasharray="4 3"
                    />
                  )}
                </g>
              );
            })}

            {/* Đường từ MCP Tools -> Response Node */}
            <path
              d={getBezierPath(mcpPos.x + NODE_WIDTH, mcpPos.y + PORT_Y, responsePos.x, responsePos.y + PORT_Y)}
              fill="none"
              stroke="url(#out-gradient)"
              strokeWidth="2"
              strokeOpacity="0.75"
              strokeDasharray="4 3"
            />

            {/* Đường trả lời trực tiếp từ AI -> Response (nét đứt mờ) */}
            <path
              d={getBezierPath(agentPos.x + NODE_WIDTH, agentPos.y + PORT_Y, responsePos.x, responsePos.y + PORT_Y)}
              fill="none"
              stroke="var(--border-base)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              strokeOpacity="0.35"
            />
          </svg>

          {/* ========================================================= */}
          {/* NODE 1: ZALO TRIGGER (Kéo thả được) */}
          {/* ========================================================= */}
          <div
            onPointerDown={(e) => onPointerDownNode('trigger', e)}
            onPointerMove={onPointerMoveNode}
            onPointerUp={(e) => onPointerUpNode('trigger', e, onConfigureZalo)}
            style={{
              position: 'absolute',
              left: triggerPos.x,
              top: triggerPos.y,
              width: NODE_WIDTH,
              zIndex: draggingId === 'trigger' ? 15 : 2,
              cursor: draggingId === 'trigger' ? 'grabbing' : 'grab',
              touchAction: 'none',
              transform: draggingId === 'trigger' ? 'scale(1.02)' : 'none',
              transition: draggingId === 'trigger' ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1.5px solid #0284c7',
                borderRadius: 'var(--radius-md)',
                boxShadow: draggingId === 'trigger' ? '0 12px 28px rgba(2, 132, 199, 0.28)' : '0 4px 14px rgba(2, 132, 199, 0.1)',
                overflow: 'hidden',
              }}
              title="Kéo thả để di chuyển • Click để cấu hình Bot & Webhook"
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#fff',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <GripVertical size={13} style={{ opacity: 0.65, cursor: 'grab', flexShrink: 0 }} />
                  <MessageCircle size={14} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 650, fontSize: 12, whiteSpace: 'nowrap' }}>Zalo Trigger</span>
                </div>
                <span style={{ fontSize: 9.5, background: 'rgba(255,255,255,0.25)', padding: '1.5px 6px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Webhook
                </span>
              </div>

              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Nhận tin nhắn Zalo</div>
                <div className="hint" style={{ fontSize: 11, marginTop: 1 }}>
                  Lắng nghe sự kiện chat từ Bot Platform
                </div>

                <div
                  style={{
                    marginTop: 6,
                    padding: '4px 6px',
                    background: 'var(--surface-sunken)',
                    borderRadius: 4,
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={zaloWebhookUrl}
                >
                  {zaloWebhookUrl}
                </div>

                <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge tone={zaloEnabled ? 'success' : 'neutral'} style={{ fontSize: 10 }}>
                    {zaloEnabled ? 'Active' : 'Tắt'}
                  </Badge>
                  {onConfigureZalo && (
                    <span
                      className="no-drag"
                      style={{
                        color: 'var(--brand)',
                        fontSize: 11,
                        fontWeight: 550,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <Settings size={11} /> Cấu hình &rarr;
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Output Port tròn bên phải (khớp 100% vào tâm đường nối) */}
            <div
              title="Cổng ra (Output): Gửi sự kiện chat tới Gemini AI Agent"
              style={{
                position: 'absolute',
                right: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#0284c7',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #0284c7, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* ========================================================= */}
          {/* NODE 2: GEMINI AI AGENT (Kéo thả được) */}
          {/* ========================================================= */}
          <div
            onPointerDown={(e) => onPointerDownNode('agent', e)}
            onPointerMove={onPointerMoveNode}
            onPointerUp={(e) => onPointerUpNode('agent', e, onConfigureGemini || onConfigureZalo)}
            style={{
              position: 'absolute',
              left: agentPos.x,
              top: agentPos.y,
              width: NODE_WIDTH,
              zIndex: draggingId === 'agent' ? 15 : 2,
              cursor: draggingId === 'agent' ? 'grabbing' : 'grab',
              touchAction: 'none',
              transform: draggingId === 'agent' ? 'scale(1.02)' : 'none',
              transition: draggingId === 'agent' ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1.5px solid #8b5cf6',
                borderRadius: 'var(--radius-md)',
                boxShadow: draggingId === 'agent' ? '0 12px 28px rgba(139, 92, 246, 0.3)' : '0 4px 14px rgba(139, 92, 246, 0.12)',
                overflow: 'hidden',
              }}
              title="Kéo thả để di chuyển • Click để cấu hình Gemini AI Key"
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#fff',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <GripVertical size={13} style={{ opacity: 0.65, cursor: 'grab', flexShrink: 0 }} />
                  <Bot size={14} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 650, fontSize: 12, whiteSpace: 'nowrap' }}>Gemini AI Agent</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <Sparkles size={11} />
                  <span style={{ fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>LLM</span>
                </div>
              </div>

              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Trợ lý AI WorkHub</div>
                <div className="hint" style={{ fontSize: 11, marginTop: 1 }}>
                  Phân tích câu hỏi và gọi công cụ
                </div>

                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div className="row-between" style={{ fontSize: 11 }}>
                    <span className="hint">Model:</span>
                    <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{llmModel || 'gemini-1.5-flash'}</code>
                  </div>
                  <div className="row-between" style={{ fontSize: 11 }}>
                    <span className="hint">Temp / Steps:</span>
                    <span style={{ fontWeight: 550, fontFamily: 'var(--font-mono)' }}>{temperature} / {maxIterations}s</span>
                  </div>
                  <div className="row-between" style={{ fontSize: 11 }}>
                    <span className="hint">Prompt:</span>
                    <span style={{ color: hasCustomPrompt ? 'var(--brand)' : 'var(--text-muted)', fontWeight: 550 }}>
                      {hasCustomPrompt ? 'Tùy biến' : 'Mặc định'}
                    </span>
                  </div>
                  <div className="row-between" style={{ fontSize: 11 }}>
                    <span className="hint">Công cụ:</span>
                    <span style={{ fontWeight: 600 }}>{mcpToolsCount + customTools.filter((t) => t.isActive).length} active</span>
                  </div>
                </div>

                <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge tone={hasGeminiKey ? 'brand' : 'danger'} style={{ fontSize: 10 }}>
                    {hasGeminiKey ? 'Key OK' : 'Chưa có Key'}
                  </Badge>
                  {(onConfigureGemini || onConfigureZalo) && (
                    <span
                      className="no-drag"
                      style={{
                        color: 'var(--brand)',
                        fontSize: 11,
                        fontWeight: 550,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <Sparkles size={11} /> Studio &rarr;
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Input Port bên trái (khớp 100% vào tâm đường nối từ Trigger) */}
            <div
              title="Cổng vào (Input): Nhận tin nhắn từ Zalo Trigger"
              style={{
                position: 'absolute',
                left: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#8b5cf6',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #8b5cf6, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />

            {/* Output Port bên phải (khớp 100% vào tâm đường nối sang Tools & Response) */}
            <div
              title="Cổng ra (Output): Gọi công cụ & chuyển phản hồi"
              style={{
                position: 'absolute',
                right: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#8b5cf6',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #8b5cf6, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* ========================================================= */}
          {/* NODE 3: SYSTEM MCP TOOLS (Kéo thả được) */}
          {/* ========================================================= */}
          <div
            onPointerDown={(e) => onPointerDownNode('mcp_tools', e)}
            onPointerMove={onPointerMoveNode}
            onPointerUp={(e) => onPointerUpNode('mcp_tools', e, onViewMcpTools)}
            style={{
              position: 'absolute',
              left: mcpPos.x,
              top: mcpPos.y,
              width: NODE_WIDTH,
              zIndex: draggingId === 'mcp_tools' ? 15 : 2,
              cursor: draggingId === 'mcp_tools' ? 'grabbing' : 'grab',
              touchAction: 'none',
              transform: draggingId === 'mcp_tools' ? 'scale(1.02)' : 'none',
              transition: draggingId === 'mcp_tools' ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-md)',
                boxShadow: draggingId === 'mcp_tools' ? '0 12px 28px rgba(0, 0, 0, 0.18)' : '0 3px 10px rgba(0, 0, 0, 0.03)',
                overflow: 'hidden',
              }}
              title="Kéo thả để di chuyển • Click để xem 14 MCP tools hệ thống"
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#fff',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <GripVertical size={13} style={{ opacity: 0.65, cursor: 'grab', flexShrink: 0 }} />
                  <Wrench size={13} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>System MCP Tools</span>
                </div>
                <span style={{ fontSize: 9.5, background: 'rgba(255,255,255,0.2)', padding: '1.5px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600 }}>
                  Mặc định
                </span>
              </div>

              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>WorkHub Core Tools</div>
                <div className="hint" style={{ fontSize: 10.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Nghỉ phép, Công việc, Điểm danh...
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge tone="info" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{mcpToolsCount} công cụ</Badge>
                  {onViewMcpTools && (
                    <button
                      className="no-drag"
                      onClick={onViewMcpTools}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand)',
                        fontSize: 11,
                        fontWeight: 550,
                        cursor: 'pointer',
                        padding: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Xem chi tiết &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Input Port bên trái (khớp 100% vào tâm đường nối từ AI Agent) */}
            <div
              title="Cổng vào (Input): Nhận lệnh truy vấn từ Gemini AI Agent"
              style={{
                position: 'absolute',
                left: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#3b82f6',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #3b82f6, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />

            {/* Output Port bên phải (khớp 100% vào tâm đường nối sang Zalo Response) */}
            <div
              title="Cổng ra (Output): Trả dữ liệu về Zalo Response"
              style={{
                position: 'absolute',
                right: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#10b981',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #10b981, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* ========================================================= */}
          {/* CUSTOM TOOLS NODES (Kéo thả được từng node) */}
          {/* ========================================================= */}
          {customTools.map((tool) => {
            const toolPos = getPos(tool.id);
            const isHttp = tool.actionType === 'HTTP';
            const isDraggingThis = draggingId === tool.id;

            return (
              <div
                key={tool.id}
                onPointerDown={(e) => onPointerDownNode(tool.id, e)}
                onPointerMove={onPointerMoveNode}
                onPointerUp={(e) => onPointerUpNode(tool.id, e, () => onEditTool(tool))}
                style={{
                  position: 'absolute',
                  left: toolPos.x,
                  top: toolPos.y,
                  width: NODE_WIDTH,
                  zIndex: isDraggingThis ? 15 : 2,
                  cursor: isDraggingThis ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  transform: isDraggingThis ? 'scale(1.02)' : 'none',
                  transition: isDraggingThis ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: `1.5px solid ${tool.isActive ? (isHttp ? '#f97316' : '#eab308') : 'var(--border-base)'}`,
                    borderRadius: 'var(--radius-md)',
                    boxShadow: isDraggingThis
                      ? '0 12px 28px rgba(0, 0, 0, 0.2)'
                      : (tool.isActive ? '0 4px 12px rgba(0, 0, 0, 0.05)' : 'none'),
                    opacity: tool.isActive ? 1 : 0.65,
                    overflow: 'hidden',
                  }}
                  title="Kéo thả để di chuyển • Click để chỉnh sửa công cụ"
                >
                  <div
                    style={{
                      background: isHttp
                        ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                        : 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: '#fff',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <GripVertical size={13} style={{ opacity: 0.65, cursor: 'grab', flexShrink: 0 }} />
                      {isHttp ? <Globe size={13} style={{ flexShrink: 0 }} /> : <Code size={13} style={{ flexShrink: 0 }} />}
                      <span style={{ fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                        {isHttp ? `HTTP ${tool.httpConfig?.method || 'GET'}` : 'JS Code'}
                      </span>
                    </div>
                    <div className="no-drag" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={tool.isActive}
                        disabled={!canManage}
                        onChange={() => onToggleTool(tool)}
                      />
                    </div>
                  </div>

                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 620, fontSize: 12, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tool.title}
                    </div>
                    <code style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--brand)', display: 'block', marginTop: 1 }}>
                      {tool.name}
                    </code>

                    <div className="row-between" style={{ marginTop: 7, paddingTop: 5, borderTop: '1px solid var(--border-subtle)' }}>
                      <span className="hint" style={{ fontSize: 10.5 }}>
                        {tool.parameters?.length || 0} tham số
                      </span>
                      <div className="row no-drag" style={{ gap: 3 }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          style={{ padding: '2px 5px', height: 21, fontSize: 10.5 }}
                          onClick={() => onTestTool(tool)}
                          title="Chạy thử nghiệm"
                        >
                          <Play size={10} /> Thử
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              style={{ padding: '2px 5px', height: 21, fontSize: 10.5 }}
                              onClick={() => onEditTool(tool)}
                              title="Sửa"
                            >
                              <Edit2 size={10} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              style={{ padding: '2px 5px', height: 21, fontSize: 10.5, color: 'var(--danger)' }}
                              onClick={() => onDeleteTool(tool)}
                              title="Xóa"
                            >
                              <Trash2 size={10} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Input Port bên trái (khớp 100% vào tâm đường nối từ AI Agent) */}
                <div
                  title="Cổng vào (Input): Nhận lệnh thực thi từ Gemini AI Agent"
                  style={{
                    position: 'absolute',
                    left: -PORT_RADIUS,
                    top: PORT_Y - PORT_RADIUS,
                    width: PORT_SIZE,
                    height: PORT_SIZE,
                    borderRadius: '50%',
                    background: isHttp ? '#f97316' : '#eab308',
                    border: '2.5px solid #fff',
                    boxShadow: `0 0 0 1px ${isHttp ? '#f97316' : '#eab308'}, 0 2px 5px rgba(0, 0, 0, 0.2)`,
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                />

                {/* Output Port bên phải khi active (khớp 100% vào tâm đường nối tới Response) */}
                {tool.isActive && (
                  <div
                    title="Cổng ra (Output): Gửi kết quả thực thi về Zalo Response"
                    style={{
                      position: 'absolute',
                      right: -PORT_RADIUS,
                      top: PORT_Y - PORT_RADIUS,
                      width: PORT_SIZE,
                      height: PORT_SIZE,
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '2.5px solid #fff',
                      boxShadow: '0 0 0 1px #10b981, 0 2px 5px rgba(0, 0, 0, 0.2)',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* ========================================================= */}
          {/* NODE: THÊM CÔNG CỤ MỚI (Kéo thả được) */}
          {/* ========================================================= */}
          {canManage && (
            <div
              onPointerDown={(e) => onPointerDownNode('new_tool', e)}
              onPointerMove={onPointerMoveNode}
              onPointerUp={(e) => onPointerUpNode('new_tool', e, onNewTool)}
              style={{
                position: 'absolute',
                left: getPos('new_tool').x,
                top: getPos('new_tool').y,
                width: NODE_WIDTH,
                zIndex: draggingId === 'new_tool' ? 15 : 2,
                cursor: draggingId === 'new_tool' ? 'grabbing' : 'grab',
                touchAction: 'none',
                transform: draggingId === 'new_tool' ? 'scale(1.02)' : 'none',
                transition: draggingId === 'new_tool' ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '100%',
                  padding: '12px 10px',
                  background: 'var(--surface-card)',
                  border: '1.5px dashed var(--border-base)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  color: 'var(--text-muted)',
                  boxShadow: draggingId === 'new_tool' ? '0 12px 28px rgba(0, 0, 0, 0.15)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand)';
                  e.currentTarget.style.color = 'var(--brand)';
                  e.currentTarget.style.background = 'rgba(2, 132, 199, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-base)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'var(--surface-card)';
                }}
                title="Kéo thả để di chuyển • Click để thêm công cụ mới"
              >
                <GripVertical size={13} style={{ opacity: 0.5 }} />
                <Plus size={14} />
                <span style={{ fontSize: 12, fontWeight: 550 }}>Thêm Custom Tool mới</span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* NODE 4: ZALO RESPONSE (Kéo thả được) */}
          {/* ========================================================= */}
          <div
            onPointerDown={(e) => onPointerDownNode('response', e)}
            onPointerMove={onPointerMoveNode}
            onPointerUp={(e) => onPointerUpNode('response', e, onTestZalo)}
            style={{
              position: 'absolute',
              left: responsePos.x,
              top: responsePos.y,
              width: NODE_WIDTH,
              zIndex: draggingId === 'response' ? 15 : 2,
              cursor: draggingId === 'response' ? 'grabbing' : 'grab',
              touchAction: 'none',
              transform: draggingId === 'response' ? 'scale(1.02)' : 'none',
              transition: draggingId === 'response' ? 'box-shadow 0.15s ease' : 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1.5px solid #10b981',
                borderRadius: 'var(--radius-md)',
                boxShadow: draggingId === 'response' ? '0 12px 28px rgba(16, 185, 129, 0.28)' : '0 4px 14px rgba(16, 185, 129, 0.1)',
                overflow: 'hidden',
              }}
              title="Kéo thả để di chuyển • Click để gửi thử tin nhắn"
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#fff',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <GripVertical size={13} style={{ opacity: 0.65, cursor: 'grab', flexShrink: 0 }} />
                  <Send size={13} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 650, fontSize: 12, whiteSpace: 'nowrap' }}>Zalo Response</span>
                </div>
                <span style={{ fontSize: 9.5, background: 'rgba(255,255,255,0.25)', padding: '1.5px 6px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Send
                </span>
              </div>

              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Phản hồi người dùng</div>
                <div className="hint" style={{ fontSize: 11, marginTop: 1 }}>
                  Gửi kết quả phân tích & dữ liệu về cho Zalo chat
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
                    <CheckCircle2 size={12} />
                    <span>Markdown & Rich Text</span>
                  </div>
                  {onTestZalo && (
                    <button
                      className="no-drag"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTestZalo();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand)',
                        fontSize: 10.5,
                        fontWeight: 550,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Gửi tin nhắn thử nghiệm"
                    >
                      <Send size={10} /> Gửi thử &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Input Port bên trái (khớp 100% vào tâm đường nối từ MCP, Tools & AI Agent) */}
            <div
              title="Cổng vào (Input): Nhận nội dung phản hồi chuyển tới Zalo"
              style={{
                position: 'absolute',
                left: -PORT_RADIUS,
                top: PORT_Y - PORT_RADIUS,
                width: PORT_SIZE,
                height: PORT_SIZE,
                borderRadius: '50%',
                background: '#10b981',
                border: '2.5px solid #fff',
                boxShadow: '0 0 0 1px #10b981, 0 2px 5px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -18;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
